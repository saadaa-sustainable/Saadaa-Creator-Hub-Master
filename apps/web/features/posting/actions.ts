"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { closeCampaignIfComplete } from "@/lib/campaign-lifecycle";
import { getCampaignAutoCloseEnabled } from "@/features/settings/actions";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
} from "@/lib/notifications";
import {
  extractShortcode,
  formatIstDate,
  postDateFromUrl,
} from "@/lib/instagram-shortcode";
import { fetchPostByShortcode, isMetaGraphConfigured } from "@/lib/meta-graph";
import { checkMetaGate, recordMetaUsage } from "@/lib/meta-rate-limit";
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
 * Live post lookup for the Posting form. On a pasted Instagram link we hit Meta
 * `business_discovery` for the creator's recent media and match the shortcode —
 * which yields the AUTHORITATIVE post date (Meta's timestamp, not the ±1-day
 * shortcode estimate), confirms the post belongs to that creator, and returns
 * the caption / like / comment / media-type details for the in-app preview.
 *
 * Graceful fallback: when Meta is rate-limited / the account is personal / the
 * post is older than the recent window, `metaMatched=false` and `date` falls
 * back to the local shortcode decode (`dateSource:"shortcode"`). The preview
 * popup still renders via the public Instagram embed (no token needed).
 */
export type PostDetailsResult =
  | {
      ok: true;
      shortcode: string;
      date: string;
      dateSource: "instagram" | "shortcode";
      ownerConfirmed: boolean;
      metaMatched: boolean;
      caption: string | null;
      likeCount: number | null;
      commentsCount: number | null;
      mediaType: string | null;
      permalink: string | null;
      /** Why live stats are unavailable (only when metaMatched=false). */
      note: string | null;
    }
  | { ok: false; reason: string };

export async function fetchPostDetails(input: {
  postLink: string;
  username?: string | null;
}): Promise<PostDetailsResult> {
  await assertPermission("posting_submit");

  const link = (input.postLink ?? "").trim();
  const shortcode = extractShortcode(link);
  if (!shortcode) {
    return { ok: false, reason: "No Instagram post link detected." };
  }

  const handle = (input.username ?? "").trim().replace(/^@/, "");
  const bitshift = postDateFromUrl(link);

  // Accurate reason when we can't pull live stats — distinguishes "old post" from
  // "private account" from "cooling down", instead of a misleading catch-all.
  let note: string | null = null;
  if (!handle) {
    note =
      "Live stats need the creator's @handle — confirm ownership below. The embed is the live post.";
  } else if (!isMetaGraphConfigured()) {
    note =
      "Live stats need the Instagram fetch configured. The embed is the live post.";
  } else {
    const gate = await checkMetaGate();
    if (gate.coolingDown) {
      note = `Instagram fetch is cooling down (try again in ~${gate.retryAfterSec}s). The embed is the live post.`;
    } else {
      const r = await fetchPostByShortcode(handle, shortcode);
      await recordMetaUsage(1, r.usagePct ?? 0);
      if (r.status === "ok" && r.node) {
        const n = r.node;
        return {
          ok: true,
          shortcode,
          date: n.timestamp ? formatIstDate(new Date(n.timestamp)) : (bitshift ?? todayIso()),
          dateSource: n.timestamp ? "instagram" : "shortcode",
          ownerConfirmed: true,
          metaMatched: true,
          caption: n.caption,
          likeCount: n.likeCount,
          commentsCount: n.commentsCount,
          mediaType: n.mediaType,
          permalink: n.permalink,
          note: null,
        };
      }
      note = r.accountResolved
        ? `This post isn't in @${handle}'s recent Instagram media (older than the window Instagram exposes), so live stats can't be pulled. The embed is the live post.`
        : `Instagram didn't return live stats for @${handle} — only business / creator accounts expose them. The embed is the live post.`;
    }
  }

  // Fallback: no Meta match — local shortcode decode only (popup still embeds).
  if (bitshift) {
    return {
      ok: true,
      shortcode,
      date: bitshift,
      dateSource: "shortcode",
      ownerConfirmed: false,
      metaMatched: false,
      caption: null,
      likeCount: null,
      commentsCount: null,
      mediaType: null,
      permalink: null,
      note,
    };
  }
  return { ok: false, reason: "Could not read this post." };
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

  // Resolve the collab + campaign for this deliverable once — used by the
  // auto-close sweep and the confirmation email (which references Collab ID).
  const { data: idRow } = await (supabase as any)
    .from("posts")
    .select("collab_id, campaign_id")
    .eq("post_id", postId)
    .maybeSingle();
  const collabId = (idRow?.collab_id as string | null) ?? postId;
  const campaignIdOfPost = (idRow?.campaign_id as string | null)?.trim() ?? "";

  // Auto-close the campaign if this posting fills its full creator allocation
  // (cap creators all Posted/Delivered). Fire-and-forget; the daily cron also
  // sweeps as a backstop. Best-effort, never blocks the posting response.
  // Respects the campaign auto-close master switch (Settings) — when off (backlog
  // mode) campaigns stay open even when complete.
  if (campaignIdOfPost) {
    after(async () => {
      if (await getCampaignAutoCloseEnabled()) {
        await closeCampaignIfComplete(campaignIdOfPost);
      }
    });
  }

  // ── Submitter confirmation (Wave 7.x) ───────────────────────────────────
  // Email the actor that posting was submitted. Keyed on Collab ID (SIF-N-Cn);
  // the specific deliverable post id is a secondary detail row. Fire-and-forget.
  after(async () => {
    await notifyActorConfirmation({
      actor,
      type: NOTIFICATION_TYPES.POSTING_CONFIRMATION,
      subject: `Posting submitted — ${collabId} marked Posted`,
      title: "Posting submitted",
      subtitle: `COLLAB ID: ${collabId}`,
      summaryLines: [
        `Posting details were saved and ${postId} is now marked Posted.`,
      ],
      rows: [
        { label: "Collab ID", value: collabId },
        { label: "Post ID (deliverable)", value: postId },
        { label: "Post Date", value: resolvedDate },
        { label: "Post Link", value: postLink },
        { label: "Drive / Download Link", value: downloadLink || null },
        { label: "Raw Footage Dump", value: rawDump || null },
        { label: "Partnership Key", value: partnershipId || null },
      ],
      postId,
      collabId,
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
 * Idempotent: if any non-Done payment row already exists for this collab's
 * representative, we leave it alone. Collab ID model: one payment per collab_id
 * raised on the representative deliverable (lowest post_id in the collab).
 */
async function autoInitDraftPayment(
  supabase: ReturnType<typeof createServiceClient>,
  postId: string,
  postDate: string,
): Promise<void> {
  const { data: postRow } = await (supabase as any)
    .from("posts")
    .select(
      "post_id, deliverable_index, commercial_amount, inf_id, username, collab_number, collab_id, ads_usage_rights",
    )
    .eq("post_id", postId)
    .maybeSingle();
  if (!postRow) return;

  // collab_id grouping key (legacy fallback to inf_id||'-C'||collab_number).
  const collabId: string =
    postRow.collab_id ??
    (postRow.inf_id
      ? `${postRow.inf_id}-C${Number(postRow.collab_number ?? 1)}`
      : postId);

  // Resolve the collab's deliverables once: used both to gate eligibility and
  // to pick the representative (lowest post_id) that owns the single payment.
  let collabDeliverables: Array<{
    post_id: string;
    post_link: string | null;
    post_date: string | null;
    commercial_amount: number | null;
    ads_usage_rights: string | null;
    partnership_id: string | null;
    ad_partnership_valid: boolean | null;
    collab_id: string | null;
    inf_id: string | null;
    collab_number: number | null;
  }> = [];
  if (postRow.inf_id) {
    const { data: sibs } = await (supabase as any)
      .from("posts")
      .select(
        "post_id, post_link, post_date, commercial_amount, ads_usage_rights, partnership_id, ad_partnership_valid, collab_id, inf_id, collab_number",
      )
      .eq("inf_id", postRow.inf_id);
    collabDeliverables = ((sibs ?? []) as typeof collabDeliverables).filter(
      (s) =>
        (s.collab_id ??
          (s.inf_id ? `${s.inf_id}-C${Number(s.collab_number ?? 1)}` : "")) ===
        collabId,
    );
  } else {
    collabDeliverables = [
      {
        post_id: postRow.post_id,
        post_link: null,
        post_date: postDate,
        commercial_amount: postRow.commercial_amount ?? null,
        ads_usage_rights: postRow.ads_usage_rights ?? null,
        partnership_id: null,
        ad_partnership_valid: null,
        collab_id: postRow.collab_id ?? null,
        inf_id: postRow.inf_id ?? null,
        collab_number: postRow.collab_number ?? null,
      },
    ];
  }

  // The representative deliverable owns the single payment row (lowest post_id).
  const representativeId = collabDeliverables.reduce(
    (lo, d) => (String(d.post_id) < lo ? String(d.post_id) : lo),
    String(postRow.post_id),
  );

  // Idempotency: any existing non-Done payment row keyed on the representative.
  const { data: existing } = await (supabase as any)
    .from("payments")
    .select("id, status")
    .eq("post_id", representativeId)
    .neq("status", "Done")
    .limit(1);
  if (existing && existing.length > 0) return;

  // Collab-level eligibility: don't create a draft until the whole collab is
  // payable. A collab is payable when EVERY deliverable has been posted (link +
  // date) AND no deliverable with ads_usage_rights=Yes is missing a partnership.
  // Otherwise we'd leak a phantom UTR-less row that the operator can't act on.
  const adsYes = (raw: string | null | undefined) => {
    if (!raw) return false;
    const v = String(raw).trim().toLowerCase();
    return !["", "no", "n/a", "none", "0", "false"].includes(v);
  };
  for (const s of collabDeliverables) {
    if (!s.post_link || !s.post_date) return;
    if (adsYes(s.ads_usage_rights)) {
      const hasKey =
        s.ad_partnership_valid === true ||
        (s.partnership_id ?? "").trim().length > 0;
      if (!hasKey) return;
    }
  }

  // Full collab amount = sum of per-row splits across all deliverables.
  const collabAmount = collabDeliverables.reduce(
    (sum, d) => sum + Number(d.commercial_amount ?? 0),
    0,
  );

  const dueDate = paymentDueDateFor(postDate);
  const estPayable = nextPayableCycleDate(dueDate);

  const { error: insErr } = await (supabase as any).from("payments").insert({
    post_id: representativeId,
    deliverable_post_id: representativeId,
    collab_id: collabId,
    inf_id: postRow.inf_id ?? null,
    username: postRow.username ?? null,
    collab_number: postRow.collab_number ?? null,
    amount: collabAmount,
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
