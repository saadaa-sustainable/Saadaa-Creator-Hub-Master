"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
} from "@/lib/notifications";
import { postDateFromUrl } from "@/lib/instagram-shortcode";
import {
  nextPayableCycleDate,
  paymentDueDateFor,
} from "@/lib/payable-cycle";
import { PostingSchema } from "./schema";

export type PostingResult =
  | { ok: true; postId: string; postDate: string; postDateSource: "form" | "shortcode" | "today" }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Server action — submit posting data for one deliverable. Mirrors legacy
 * submitPosting: writes post_date / post_link / download_link / raw_dump /
 * partnership_id, flips workflow_status='Posted'. Hard-rejects missing
 * download link when ads_usage_rights='Yes' (legacy §7.1).
 *
 * post_date resolution (legacy parity):
 *   1. Form value if supplied
 *   2. Decode from postLink shortcode (Instagram epoch bitshift, no API)
 *   3. Fallback to today
 */
export async function submitPosting(input: unknown) {
  const actor = await assertPermission("posting_submit");

  const parsed = PostingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false as const, error: "Validation failed", fieldErrors };
  }

  const {
    postId,
    postDate,
    postLink,
    downloadLink,
    rawDump,
    partnershipId,
  } = parsed.data;

  // Resolve post_date: form > shortcode decode > today
  let resolvedDate = postDate?.trim() || "";
  let dateSource: "form" | "shortcode" | "today" = "form";
  if (!resolvedDate) {
    const decoded = postDateFromUrl(postLink);
    if (decoded) {
      resolvedDate = decoded;
      dateSource = "shortcode";
    } else {
      resolvedDate = todayIso();
      dateSource = "today";
    }
  }

  const supabase = createServiceClient();

  const { error: updErr } = await (supabase as any)
    .from("posts")
    .update({
      post_date: resolvedDate,
      post_link: postLink,
      download_link: downloadLink || null,
      raw_dump: rawDump || null,
      partnership_id: partnershipId || null,
      ad_partnership_valid:
        (partnershipId ?? "").trim().length > 0 ? true : undefined,
      workflow_status: "Posted",
      payment_status: "Not Due",
    })
    .eq("post_id", postId);

  if (updErr) return { ok: false as const, error: updErr.message };

  // §8.1 — auto-init draft payment row on every Posted transition. Idempotent
  // (skips when a non-Done row already exists for this post). Child
  // deliverables are skipped — payment lives on the parent collab only.
  await autoInitDraftPayment(supabase, postId, resolvedDate);

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  // ── Submitter confirmation (Wave 7.x) ───────────────────────────────────
  // Email the actor that posting was submitted. Fire-and-forget via after();
  // best-effort, never throws/blocks.
  after(async () => {
    await notifyActorConfirmation({
      actor,
      type: NOTIFICATION_TYPES.POSTING_CONFIRMATION,
      subject: `Posting submitted — ${postId} marked Posted`,
      title: "Posting submitted",
      subtitle: `POST ID: ${postId}`,
      summaryLines: [
        `Posting details were saved and ${postId} is now marked Posted.`,
      ],
      rows: [
        { label: "Post ID", value: postId },
        { label: "Post Date", value: resolvedDate },
        { label: "Post Link", value: postLink },
        { label: "Partnership ID", value: partnershipId || null },
      ],
      postId,
    });
  });

  revalidateTag("posts");
  revalidateTag("payments");
  revalidatePath("/posting");
  revalidatePath("/journey");
  revalidatePath("/accounts-hub");

  return {
    ok: true as const,
    postId,
    postDate: resolvedDate,
    postDateSource: dateSource,
  };
}

/**
 * Spawn a Not-Due draft payment row when a post flips to Posted. Mirrors
 * legacy `_autoInitDraftPayment_` (InfluencerBackend.js:10256-10306).
 *
 * Idempotent: if any non-Done payment row already exists for this post_id,
 * we leave it alone. Children deliverables (deliverable_index > 1) are
 * skipped — payment lives on the parent collab.
 */
async function autoInitDraftPayment(
  supabase: ReturnType<typeof createServiceClient>,
  postId: string,
  postDate: string,
): Promise<void> {
  // Skip if this is a child deliverable row.
  const { data: postRow } = await (supabase as any)
    .from("posts")
    .select(
      "deliverable_index, commercial_amount, inf_id, collab_number, ads_usage_rights",
    )
    .eq("post_id", postId)
    .maybeSingle();
  if (!postRow) return;
  const deliverableIndex = Number(postRow.deliverable_index ?? 1);
  if (deliverableIndex > 1) return;

  // Idempotency: any existing non-Done payment row is the draft already.
  const { data: existing } = await (supabase as any)
    .from("payments")
    .select("id, status")
    .eq("post_id", postId)
    .neq("status", "Done")
    .limit(1);
  if (existing && existing.length > 0) return;

  // Collab-level eligibility: don't create a draft until the whole collab is
  // payable. A collab is payable when EVERY sibling has been posted (link +
  // date) AND no sibling with ads_usage_rights=Yes is missing a partnership_id.
  // Otherwise we'd leak a phantom UTR-less row that the operator can't act on.
  if (postRow.inf_id) {
    const { data: sibs } = await (supabase as any)
      .from("posts")
      .select(
        "post_link, post_date, ads_usage_rights, partnership_id, ad_partnership_valid",
      )
      .eq("inf_id", postRow.inf_id)
      .eq("collab_number", Number(postRow.collab_number ?? 1));
    const adsYes = (raw: string | null | undefined) => {
      if (!raw) return false;
      const v = String(raw).trim().toLowerCase();
      return !["", "no", "n/a", "none", "0", "false"].includes(v);
    };
    for (const s of (sibs ?? []) as Array<{
      post_link: string | null;
      post_date: string | null;
      ads_usage_rights: string | null;
      partnership_id: string | null;
      ad_partnership_valid: boolean | null;
    }>) {
      if (!s.post_link || !s.post_date) return;
      if (adsYes(s.ads_usage_rights)) {
        const hasKey =
          s.ad_partnership_valid === true ||
          (s.partnership_id ?? "").trim().length > 0;
        if (!hasKey) return;
      }
    }
  }

  const dueDate = paymentDueDateFor(postDate);
  const estPayable = nextPayableCycleDate(dueDate);

  const { error: insErr } = await (supabase as any).from("payments").insert({
    post_id: postId,
    deliverable_post_id: postId,
    amount: Number(postRow.commercial_amount ?? 0),
    status: "Not Due",
    due_date: dueDate,
    estimated_payable_date: estPayable,
    payment_advice_sent: false,
  });
  if (insErr) {
    console.error(
      `[autoInitDraftPayment] insert failed for ${postId}: ${insErr.message}`,
    );
  }
}

/**
 * Patch partnership_id on a single post. Called from inline edit in the
 * Posting Overview modal, Accounts Hub kanban card, and list view.
 */
export async function savePartnershipKey(
  postId: string,
  partnershipId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertPermission("posting_submit");
  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("posts")
    .update({ partnership_id: partnershipId.trim() || null })
    .eq("post_id", postId);
  if (error) return { ok: false, error: error.message };
  revalidateTag("posts");
  revalidatePath("/posting");
  revalidatePath("/accounts-hub");
  return { ok: true };
}
