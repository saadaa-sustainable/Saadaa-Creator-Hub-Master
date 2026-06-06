"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { NOTIFICATION_TYPES, sendNotification } from "@/lib/notifications";
import { fetchMetaAdsCoveredPostIds } from "@/lib/supabase/meta-ads";
import { isAdTested, isPostedButNotTested } from "@/lib/ad-tested";
import {
  nextPayableCycleDate,
  paymentDueDateFor,
  todayIstIso,
} from "@/lib/payable-cycle";
import {
  PaymentBatchSchema,
  PaymentSubmitSchema,
  type PaymentSubmitInput,
} from "./schema";

export interface BlockedDetail {
  postId: string;
  unpostedSiblings: string[];
  partnershipMissingSiblings: string[];
}

export type SubmitPaymentResult =
  | {
      ok: true;
      saved: number;
      paid: number;
      due: number;
      skipped: number;
      skippedIds: string[];
      blockedByStage: string[];
      blockedByReelRule: string[];
      blockedByAdPartnership: string[];
      duplicates: string[];
      /** Per-blocked-post detail so the UI can show the exact siblings to fix. */
      blockedDetails: BlockedDetail[];
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };

interface PostContext {
  post_id: string;
  post_id_short: string | null;
  workflow_status: string;
  commercial_amount: number | null;
  inf_id: string | null;
  username: string | null;
  collab_number: number | null;
  deliverable_index: number | null;
  ads_usage_rights: string | null;
  ads_results: string | null;
  partnership_id: string | null;
  ad_partnership_valid: boolean | null;
  bank_name: string | null;
  bank_number: string | null;
  ifsc: string | null;
}

/**
 * Meta Ads warehouse covered set with a 5s timeout fallback — mirrors the
 * guard in features/ad-status/queries.ts so the warehouse never blocks a
 * payment submit. Empty Set on timeout/misconfig (degrades to ads_results-only
 * classification, never blocks).
 */
async function coveredPostIdsWithTimeout(): Promise<Set<string>> {
  return Promise.race([
    fetchMetaAdsCoveredPostIds(),
    new Promise<Set<string>>((resolve) =>
      setTimeout(() => resolve(new Set()), 5000),
    ),
  ]);
}

const ADS_YES = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return !["", "no", "n/a", "none", "0", "false"].includes(v);
};

const POSTED_STATES = new Set(["Posted", "Delivered"]);

/**
 * Bulk submit one or more payment rows. Mirrors legacy `submitPayments`
 * (InfluencerBackend.js:9357-9739). Each row passes the same 3-gate
 * validation pipeline + dedup before writing.
 *
 * - Stage gate: post must be in Posted | Delivered.
 * - §7.2 Reel rule: per (inf_id, collab_number), at least one Reel deliverable
 *   must have BOTH post_link AND post_date.
 * - §8.2 Ad partnership gate: when ads_usage_rights = "yes" AND a UTR is
 *   present (Done attempt), post must have ad_partnership_valid=true OR a
 *   non-empty partnership_id.
 *
 * Dedup key: (post_id, lower(utr)). Same UTR across multiple post_ids is
 * allowed (one bank transfer can cover multiple collabs).
 */
export async function submitPayments(
  input: unknown,
): Promise<SubmitPaymentResult> {
  const actor = await assertPermission("accounts_write");

  // Schema validate.
  const parsed = PaymentBatchSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const rows = parsed.data.rows;
  const supabase = createServiceClient();

  // Pre-fetch all referenced posts in one query for gate checks.
  const postIds = [...new Set(rows.map((r) => r.postId))];
  const { data: postRows, error: postsErr } = await (supabase as any)
    .from("posts")
    .select(
      "post_id, post_id_short, workflow_status, commercial_amount, inf_id, username, collab_number, deliverable_index, ads_usage_rights, ads_results, partnership_id, ad_partnership_valid, bank_name, bank_number, ifsc",
    )
    .in("post_id", postIds);
  if (postsErr) return { ok: false, error: postsErr.message };

  const postById = new Map<string, PostContext>(
    ((postRows ?? []) as PostContext[]).map((p) => [p.post_id, p]),
  );

  // Pre-fetch existing payment rows for dedup / upsert.
  // Key by post_id. If ANY Done row exists → block. If draft rows exist → update by post_id.
  const { data: existingRows } = await (supabase as any)
    .from("payments")
    .select("post_id, utr, status")
    .in("post_id", postIds);
  // Track which post_ids have existing rows and their highest-priority status.
  // "Done" beats "Due" beats "Not Due" (if multiple rows, Done wins).
  const existingByPostId = new Map<
    string,
    { hasDraft: boolean; status: string | null; utr: string | null }
  >();
  for (const r of (existingRows ?? []) as { post_id: string; utr: string | null; status: string | null }[]) {
    const cur = existingByPostId.get(r.post_id);
    if (!cur) {
      existingByPostId.set(r.post_id, { hasDraft: r.status !== "Done", status: r.status, utr: r.utr });
    } else if (r.status === "Done") {
      existingByPostId.set(r.post_id, { hasDraft: false, status: "Done", utr: r.utr });
    }
  }
  // Keep key set for same-UTR cross-post dedup (UTR covering multiple posts).
  const existingKeys = new Set<string>(
    ((existingRows ?? []) as { post_id: string; utr: string | null }[]).map(
      (r) => `${r.post_id}|${String(r.utr ?? "").trim().toLowerCase()}`,
    ),
  );

  // §7.2 Reel rule pre-check — per (inf_id, collab_number) collab,
  // pull all deliverables to verify at least one has reel content with link.
  const collabKeys = new Set<string>();
  for (const r of rows) {
    const p = postById.get(r.postId);
    if (!p?.inf_id) continue;
    collabKeys.add(`${p.inf_id}|${Number(p.collab_number ?? 1)}`);
  }
  const collabsWithReel = new Set<string>();
  if (collabKeys.size > 0) {
    // Pull all deliverables for these collabs in one query.
    const infIds = [
      ...new Set(
        [...collabKeys].map((k) => k.split("|")[0]).filter(Boolean),
      ),
    ];
    if (infIds.length > 0) {
      const { data: collabRows } = await (supabase as any)
        .from("posts")
        .select(
          "inf_id, collab_number, reels, deliverable_type, post_link, post_date",
        )
        .in("inf_id", infIds);
      for (const cr of (collabRows ?? []) as Array<{
        inf_id: string | null;
        collab_number: number | null;
        reels: number | null;
        deliverable_type: string | null;
        post_link: string | null;
        post_date: string | null;
      }>) {
        const key = `${cr.inf_id ?? ""}|${Number(cr.collab_number ?? 1)}`;
        const reelCount = Number(cr.reels ?? 0);
        const isReelDeliverable =
          reelCount > 0 || cr.deliverable_type === "reel";
        const hasLink = !!cr.post_link;
        const hasDate = !!cr.post_date;
        if (isReelDeliverable && hasLink && hasDate) {
          collabsWithReel.add(key);
        }
      }
    }
  }

  // Combined sibling scan — collab-level eligibility tracking. We track:
  //   (a) `collabUnpostedByKey` — siblings that are missing post_link or
  //       post_date. Any single unposted sibling locks the entire collab.
  //   (b) `collabPartnershipMissingByKey` — siblings with ads_usage_rights=Yes
  //       but no partnership_id. Same collab-wide lock.
  // Both maps store the offending sibling post_id_short so the toast can call
  // them out by name. Saadaa pays per-collab, not per-deliverable, so any
  // sibling deficiency blocks every payment in the collab.
  const collabUnpostedByKey = new Map<string, string[]>();
  const collabPartnershipMissingByKey = new Map<string, string[]>();
  if (collabKeys.size > 0) {
    const infIds = [
      ...new Set(
        [...collabKeys].map((k) => k.split("|")[0]).filter(Boolean),
      ),
    ];
    if (infIds.length > 0) {
      const { data: collabRows } = await (supabase as any)
        .from("posts")
        .select(
          "post_id, post_id_short, inf_id, collab_number, post_link, post_date, ads_usage_rights, partnership_id, ad_partnership_valid",
        )
        .in("inf_id", infIds);
      for (const cr of (collabRows ?? []) as Array<{
        post_id: string | null;
        post_id_short: string | null;
        inf_id: string | null;
        collab_number: number | null;
        post_link: string | null;
        post_date: string | null;
        ads_usage_rights: string | null;
        partnership_id: string | null;
        ad_partnership_valid: boolean | null;
      }>) {
        const key = `${cr.inf_id ?? ""}|${Number(cr.collab_number ?? 1)}`;
        const sibLabel = cr.post_id_short ?? cr.post_id ?? "?";
        if (!cr.post_link || !cr.post_date) {
          const arr = collabUnpostedByKey.get(key) ?? [];
          arr.push(sibLabel);
          collabUnpostedByKey.set(key, arr);
        }
        if (ADS_YES(cr.ads_usage_rights)) {
          const hasKey =
            cr.ad_partnership_valid === true ||
            (cr.partnership_id ?? "").trim().length > 0;
          if (!hasKey) {
            const arr = collabPartnershipMissingByKey.get(key) ?? [];
            arr.push(sibLabel);
            collabPartnershipMissingByKey.set(key, arr);
          }
        }
      }
    }
  }

  const blockedByStage: string[] = [];
  const blockedByReelRule: string[] = [];
  const blockedByAdPartnership: string[] = [];
  const duplicates: string[] = [];
  const blockedDetails: BlockedDetail[] = [];
  const accepted: PaymentSubmitInput[] = [];

  for (const r of rows) {
    const p = postById.get(r.postId);
    if (!p) {
      blockedByStage.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: [],
        partnershipMissingSiblings: [],
      });
      continue;
    }
    if (!POSTED_STATES.has(p.workflow_status)) {
      blockedByStage.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: [],
        partnershipMissingSiblings: [],
      });
      continue;
    }

    const hasUtr = (r.utr ?? "").trim().length > 0;
    const collabKey = p.inf_id
      ? `${p.inf_id}|${Number(p.collab_number ?? 1)}`
      : null;
    const unposted = collabKey
      ? (collabUnpostedByKey.get(collabKey) ?? [])
      : [];
    const partnershipMissing = collabKey
      ? (collabPartnershipMissingByKey.get(collabKey) ?? [])
      : [];

    // §7.2 — collab-level posting completeness. ANY sibling without
    // post_link OR post_date locks payment for the whole collab. Stricter
    // than legacy "at least one reel posted" because Saadaa pays per-collab.
    if (unposted.length > 0) {
      blockedByReelRule.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: unposted,
        partnershipMissingSiblings: partnershipMissing,
      });
      continue;
    }

    // §8.2 — collab-level partnership gate. ANY sibling with ads_usage_rights
    // =Yes but no partnership_id blocks all payments in the collab. Only fires
    // for Done attempts (UTR provided); draft writes still pass.
    if (hasUtr) {
      const ownAdsRequired = ADS_YES(p.ads_usage_rights);
      const ownHasPartnership =
        p.ad_partnership_valid === true ||
        (p.partnership_id ?? "").trim().length > 0;
      if (
        (ownAdsRequired && !ownHasPartnership) ||
        partnershipMissing.length > 0
      ) {
        blockedByAdPartnership.push(r.postId);
        blockedDetails.push({
          postId: r.postId,
          unpostedSiblings: unposted,
          partnershipMissingSiblings: partnershipMissing,
        });
        continue;
      }
    }

    // Dedup — block if this post already has a Done (paid) payment row.
    // Draft rows (Not Due / Due) are updated in-place, not blocked.
    const existingForPost = existingByPostId.get(r.postId);
    if (existingForPost?.status === "Done") {
      duplicates.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: [],
        partnershipMissingSiblings: [],
      });
      continue;
    }
    const utrNonEmpty = (r.utr ?? "").trim().length > 0;
    // Also block same UTR re-submission across any post (legacy parity).
    // Skip check when existing row has the same post+utr (that's the row we're updating).
    const dedupKey = `${r.postId}|${(r.utr ?? "").trim().toLowerCase()}`;
    if (utrNonEmpty && existingKeys.has(dedupKey) && existingForPost?.utr !== (r.utr ?? "").trim()) {
      duplicates.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: [],
        partnershipMissingSiblings: [],
      });
      continue;
    }

    accepted.push(r);
    if (utrNonEmpty) existingKeys.add(dedupKey);
  }

  // Write accepted rows.
  let saved = 0;
  let paid = 0;
  let due = 0;
  const skipped =
    blockedByStage.length +
    blockedByReelRule.length +
    blockedByAdPartnership.length +
    duplicates.length;

  // Fetch the Meta Ads warehouse covered set once for the whole batch so each
  // written row can be stamped with `posted_but_not_tested` (ad-eligible but
  // not yet tested). Never blocks payment — annotation only.
  const coveredSet =
    accepted.length > 0
      ? await coveredPostIdsWithTimeout()
      : new Set<string>();

  // Posts that became status 'Done' in this batch — drives the
  // "payment processed" creator notification (Wave 7) fired after the loop.
  const paidPosts: Array<{
    postId: string;
    infId: string | null;
    amount: number;
    utr: string | null;
    paymentDate: string | null;
  }> = [];

  for (const r of accepted) {
    const post = postById.get(r.postId)!;
    const hasUtr = (r.utr ?? "").trim().length > 0;
    const status: "Done" | "Due" = hasUtr ? "Done" : "Due";
    const dueDate = paymentDueDateFor(r.paymentDate);
    const estPayable = nextPayableCycleDate(dueDate);
    const paymentPayload: Record<string, unknown> = {
      utr: r.utr || null,
      amount: r.amount,
      payment_date: r.paymentDate || null,
      status,
      due_date: dueDate,
      estimated_payable_date: estPayable,
      payment_advice_sent: false,
      // Bank info: form value takes priority, fall back to what's stored on the post.
      bank_name: r.bankName || post.bank_name || null,
      bank_number: r.bankNumber || post.bank_number || null,
      ifsc: r.ifsc || post.ifsc || null,
      // Collab tracking — always sourced from the post, not the form.
      collab_number: post.collab_number ?? null,
      deliverable_index: post.deliverable_index ?? null,
      // §ad-tested — flag a payment whose paid post is an ad-eligible
      // deliverable that has NOT yet been tested as an ad. Mirrors the Ad
      // Status view; cleared later by recomputePaymentStates once tested.
      posted_but_not_tested: isPostedButNotTested(
        post.ads_usage_rights,
        post.ads_results,
        post.post_id_short,
        coveredSet,
      ),
    };

    let writeErr: { message: string } | null = null;

    // Upsert on post_id (requires UNIQUE(post_id) constraint on payments table).
    // Atomic — no race condition between backfill draft rows and form submits.
    const { error } = await (supabase as any)
      .from("payments")
      .upsert(
        {
          ...paymentPayload,
          post_id: r.postId,
          deliverable_post_id: r.postId,
          inf_id: post.inf_id || null,
          username: post.username || null,
        },
        { onConflict: "post_id" },
      );
    writeErr = error;
    if (error) console.error(`[submitPayments] upsert ${r.postId}: ${error.message}`);

    if (writeErr) {
      duplicates.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: [],
        partnershipMissingSiblings: [],
      });
      continue;
    }

    saved++;

    // Mirror onto posts row (denormalized for KPIs + downstream filters).
    const { error: updErr } = await (supabase as any)
      .from("posts")
      .update({
        payment_status: status,
        ...(hasUtr ? { utr: r.utr } : {}),
        ...(hasUtr ? { payment_date: r.paymentDate } : {}),
      })
      .eq("post_id", r.postId);
    if (updErr) {
      console.error(
        `[submitPayments] posts update ${r.postId}: ${updErr.message}`,
      );
    }

    if (status === "Done") {
      paid++;
      paidPosts.push({
        postId: r.postId,
        infId: post.inf_id || null,
        amount: r.amount,
        utr: r.utr || null,
        paymentDate: r.paymentDate || null,
      });
    } else due++;

    // When parent post is paid, cascade "Done" to all sibling child deliverables
    // (same inf_id + collab_number, deliverable_index > 1) on the `posts`
    // table ONLY. Children do NOT get their own payment rows — the full collab
    // amount lives on the parent's single payment row. This prevents spend
    // metrics from triple-counting (one collab of ₹10,000 for 3 deliverables
    // must total ₹10,000, not ₹30,000).
    //
    // We also remove any pre-existing child payment rows that were inserted
    // before this fix was deployed.
    const isParent =
      post.deliverable_index == null || Number(post.deliverable_index) === 1;
    if (
      status === "Done" &&
      isParent &&
      post.inf_id &&
      post.collab_number != null
    ) {
      const { data: siblings } = await (supabase as any)
        .from("posts")
        .select("post_id, deliverable_index")
        .eq("inf_id", post.inf_id)
        .eq("collab_number", post.collab_number)
        .gt("deliverable_index", 1);

      const childIds = ((siblings ?? []) as Array<{ post_id: string }>).map(
        (c) => c.post_id,
      );

      if (childIds.length > 0) {
        // Mirror payment status onto child posts rows so UI shows them paid.
        await (supabase as any)
          .from("posts")
          .update({
            payment_status: "Done",
            ...(hasUtr ? { utr: r.utr } : {}),
            ...(hasUtr ? { payment_date: r.paymentDate } : {}),
          })
          .in("post_id", childIds);

        // Backfill safety: remove any orphan child payment rows so spend
        // sums stay parent-only.
        await (supabase as any)
          .from("payments")
          .delete()
          .in("post_id", childIds);
      }
    }
  }

  // ── Notification: Payment Processed (Wave 7) ─────────────────────────────
  // For each post that became status 'Done', email the influencer (creator) a
  // "payment processed" confirmation. One email per paid post. Recipient email
  // is resolved via the post (its own `email`) then the creators table by
  // inf_id. Fire-and-forget via after(); best-effort, never blocks the submit.
  if (paidPosts.length > 0) {
    const paidSnapshot = paidPosts.slice();
    after(async () => {
      const sb = createServiceClient();

      // Resolve recipient emails: prefer the post row's own email, fall back to
      // the creator record by inf_id. One bulk lookup each.
      const snapPostIds = paidSnapshot.map((p) => p.postId);
      const { data: postEmailRows } = await (sb as any)
        .from("posts")
        .select("post_id, email, username")
        .in("post_id", snapPostIds);
      const emailByPost = new Map<string, string | null>();
      const nameByPost = new Map<string, string | null>();
      for (const pr of (postEmailRows ?? []) as Array<{
        post_id: string;
        email: string | null;
        username: string | null;
      }>) {
        emailByPost.set(pr.post_id, pr.email);
        nameByPost.set(pr.post_id, pr.username);
      }

      const infIds = Array.from(
        new Set(
          paidSnapshot
            .map((p) => p.infId)
            .filter((x): x is string => !!x),
        ),
      );
      const creatorByInf = new Map<
        string,
        { email: string | null; inf_name: string | null }
      >();
      if (infIds.length > 0) {
        const { data: creatorRows } = await (sb as any)
          .from("creators")
          .select("inf_id, email, inf_name")
          .in("inf_id", infIds);
        for (const cr of (creatorRows ?? []) as Array<{
          inf_id: string;
          email: string | null;
          inf_name: string | null;
        }>) {
          creatorByInf.set(cr.inf_id, {
            email: cr.email,
            inf_name: cr.inf_name,
          });
        }
      }

      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      for (const pp of paidSnapshot) {
        const creator = pp.infId ? creatorByInf.get(pp.infId) : undefined;
        const to =
          emailByPost.get(pp.postId) ?? creator?.email ?? null;
        if (!to || !to.includes("@")) continue; // skip silently
        const greetName =
          creator?.inf_name ?? nameByPost.get(pp.postId) ?? "there";
        const amountFmt = new Intl.NumberFormat("en-IN").format(pp.amount);
        const bodyHtml = `
          <p style="margin:0 0 12px;">Hi <strong>${esc(greetName)}</strong>,</p>
          <p style="margin:0 0 14px;">Your payment for collaboration <strong>${esc(pp.postId)}</strong> has been processed.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">
            <tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;font-weight:800;width:40%;">Amount</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;">INR ${amountFmt}</td></tr>
            ${pp.utr ? `<tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">UTR / Reference</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">${esc(pp.utr)}</td></tr>` : ""}
            ${pp.paymentDate ? `<tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Payment Date</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">${esc(pp.paymentDate)}</td></tr>` : ""}
          </table>
          <p style="margin:0;font-size:13px;color:#6E695E;">If anything looks off, simply reply to this email and our team will help.</p>`;
        const plainBody =
          `Hi ${greetName},\n\n` +
          `Your payment for collaboration ${pp.postId} has been processed.\n` +
          `Amount: INR ${amountFmt}` +
          (pp.utr ? `\nUTR/Reference: ${pp.utr}` : "") +
          (pp.paymentDate ? `\nPayment Date: ${pp.paymentDate}` : "") +
          `\n\nIf anything looks off, reply to this email.`;
        await sendNotification({
          type: NOTIFICATION_TYPES.PAYMENT_PROCESSED,
          to,
          subject: `Payment Processed · ${pp.postId}`,
          htmlBody: bodyHtml,
          plainBody,
          postId: pp.postId,
        });
      }
    });
  }

  // Cache invalidation — every Accounts read tag.
  revalidateTag("payments");
  revalidateTag("posts");
  revalidatePath("/accounts-hub");
  revalidatePath("/journey");
  revalidatePath("/my-dashboard");

  return {
    ok: true,
    saved,
    paid,
    due,
    skipped,
    skippedIds: [
      ...blockedByStage,
      ...blockedByReelRule,
      ...blockedByAdPartnership,
      ...duplicates,
    ],
    blockedByStage,
    blockedByReelRule,
    blockedByAdPartnership,
    duplicates,
    blockedDetails,
  };
}

/**
 * Convenience single-row variant — same gate pipeline, returns the same
 * shape so the UI can render one toast.
 */
export async function submitSinglePayment(
  input: unknown,
): Promise<SubmitPaymentResult> {
  const parsed = PaymentSubmitSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }
  return submitPayments({ rows: [parsed.data] });
}

/**
 * Daily reconciliation — transitions Not Due → Due when due_date has passed
 * and heals stale estimated_payable_date values. Mirrors legacy
 * `recomputePaymentStates`. Intended to be wired into the existing 3hr
 * scrape-pending-apify cron OR called manually from an admin tool.
 */
export async function recomputePaymentStates(): Promise<{
  scanned: number;
  flippedToDue: number;
  estPayableHealed: number;
  testedCleared: number;
}> {
  const supabase = createServiceClient();
  const today = todayIstIso();

  // 1. Not Due → Due when due_date ≤ today
  const { data: dueCandidates } = await (supabase as any)
    .from("payments")
    .select("id, post_id, due_date")
    .eq("status", "Not Due")
    .not("due_date", "is", null)
    .lte("due_date", today);

  const dueRows = (dueCandidates ?? []) as Array<{
    id: string;
    post_id: string;
    due_date: string;
  }>;
  let flipped = 0;
  for (const row of dueRows) {
    const { error: uErr } = await (supabase as any)
      .from("payments")
      .update({ status: "Due" })
      .eq("id", row.id);
    if (uErr) {
      console.error(
        `[recomputePaymentStates] ${row.id}: ${uErr.message}`,
      );
      continue;
    }
    await (supabase as any)
      .from("posts")
      .update({ payment_status: "Due" })
      .eq("post_id", row.post_id)
      .neq("payment_status", "Done");
    flipped++;
  }

  // 2. Heal estimated_payable_date when null but due_date present.
  const { data: needHeal } = await (supabase as any)
    .from("payments")
    .select("id, due_date, estimated_payable_date")
    .neq("status", "Done")
    .not("due_date", "is", null)
    .is("estimated_payable_date", null);
  const healRows = (needHeal ?? []) as Array<{
    id: string;
    due_date: string;
  }>;
  let healed = 0;
  for (const row of healRows) {
    const est = nextPayableCycleDate(row.due_date);
    if (!est) continue;
    const { error: uErr } = await (supabase as any)
      .from("payments")
      .update({ estimated_payable_date: est })
      .eq("id", row.id);
    if (!uErr) healed++;
  }

  // 3. Auto-clear `posted_but_not_tested` once the ad becomes tested. Re-check
  //    against ads_results + the Meta Ads warehouse (same logic as submit).
  let testedCleared = 0;
  const { data: flaggedPayments } = await (supabase as any)
    .from("payments")
    .select("id, post_id")
    .eq("posted_but_not_tested", true);
  const flagged = (flaggedPayments ?? []) as Array<{
    id: string;
    post_id: string;
  }>;
  if (flagged.length > 0) {
    const flaggedPostIds = [...new Set(flagged.map((p) => p.post_id))];
    const [coveredSet, postsRes] = await Promise.all([
      coveredPostIdsWithTimeout(),
      (supabase as any)
        .from("posts")
        .select("post_id, post_id_short, ads_results")
        .in("post_id", flaggedPostIds),
    ]);
    const postById = new Map<
      string,
      { post_id_short: string | null; ads_results: string | null }
    >(
      (
        (postsRes.data ?? []) as Array<{
          post_id: string;
          post_id_short: string | null;
          ads_results: string | null;
        }>
      ).map((p) => [p.post_id, p]),
    );
    for (const pay of flagged) {
      const post = postById.get(pay.post_id);
      if (!post) continue;
      if (isAdTested(post.ads_results, post.post_id_short, coveredSet)) {
        const { error: cErr } = await (supabase as any)
          .from("payments")
          .update({ posted_but_not_tested: false })
          .eq("id", pay.id);
        if (!cErr) testedCleared++;
      }
    }
  }

  if (flipped > 0 || healed > 0 || testedCleared > 0) {
    revalidateTag("payments");
    revalidatePath("/accounts-hub");
  }

  return {
    scanned: dueRows.length + healRows.length,
    flippedToDue: flipped,
    estPayableHealed: healed,
    testedCleared,
  };
}

// Constants belong in `./constants.ts` because a "use server" module can
// only export async functions.
