"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { assertCreateAllowed } from "@/lib/test-mode";
import { createServiceClient } from "@/lib/supabase/server";
import { stampTestRows } from "@/features/settings/actions";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
  sendNotification,
} from "@/lib/notifications";
import { fetchMetaAdsCoveredPostIds } from "@/lib/supabase/meta-ads";
import { partnershipApproved } from "@/lib/partnership";
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
      /** Installments that left a balance outstanding (collab now Partial). */
      partial: number;
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
  collab_id: string | null;
  deliverable_index: number | null;
  ads_usage_rights: string | null;
  ads_results: string | null;
  partnership_id: string | null;
  ad_partnership_valid: boolean | null;
  partnership_status: string | null;
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
 *   present (Done attempt), the creator must have APPROVED the partnership
 *   request (partnership_status='approved') or an admin must have explicitly
 *   overridden (ad_partnership_valid=true). A bare partnership_id no longer
 *   passes — the invite is auto-sent at posting time.
 *
 * Dedup key: (post_id, lower(utr)). Same UTR across multiple post_ids is
 * allowed (one bank transfer can cover multiple collabs).
 *
 * PARTIAL PAYMENTS: the entered amount MAY be less than the collab's agreed
 * total. Each installment (distinct UTR) is recorded as a NEW payment row;
 * paid-so-far is summed across all UTR-bearing rows of the collab. When
 * paid ≥ total the collab flips to Done (cascaded to all deliverables); while
 * 0 < paid < total it is Partial (balance outstanding). A collab that is
 * already fully paid blocks further installments (counted as a duplicate).
 */
export async function submitPayments(
  input: unknown,
): Promise<SubmitPaymentResult> {
  const actor = await assertPermission("accounts_write");
  await assertCreateAllowed("payment", actor, "Payments");

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

  // Test Mode: ids of payment rows created in this submit, stamped is_test=true at
  // the end when the Payment scope is on (no-op otherwise).
  const testPaymentIds: number[] = [];

  // Pre-fetch all referenced posts in one query for gate checks.
  const postIds = [...new Set(rows.map((r) => r.postId))];
  const { data: postRows, error: postsErr } = await (supabase as any)
    .from("posts")
    .select(
      "post_id, post_id_short, workflow_status, commercial_amount, inf_id, username, collab_number, collab_id, deliverable_index, ads_usage_rights, ads_results, partnership_id, ad_partnership_valid, partnership_status, bank_name, bank_number, ifsc",
    )
    .in("post_id", postIds);
  if (postsErr) return { ok: false, error: postsErr.message };

  // collab_id grouping key — prefer the stamped collab_id, fall back to
  // inf_id||'-C'||collab_number for legacy rows, then post_id.
  const collabKeyOf = (p: {
    collab_id: string | null;
    inf_id: string | null;
    collab_number: number | null;
    post_id: string;
  }): string =>
    p.collab_id ??
    (p.inf_id ? `${p.inf_id}-C${p.collab_number ?? 1}` : p.post_id);

  const postById = new Map<string, PostContext>(
    ((postRows ?? []) as PostContext[]).map((p) => [p.post_id, p]),
  );

  // Pre-fetch existing payment rows for dedup / installment accounting.
  // Partial-payments model: a collab can carry MANY installment rows (each a
  // distinct UTR) keyed on the representative post_id, plus AT MOST one
  // null-utr draft row. We pull id/utr/status/amount so we can (a) find the
  // lone draft to update in place, (b) sum installments for paid-so-far.
  const { data: existingRows } = await (supabase as any)
    .from("payments")
    .select("id, post_id, utr, status, amount")
    .in("post_id", postIds);
  type ExistingPay = {
    id: string;
    post_id: string;
    utr: string | null;
    status: string | null;
    amount: number | null;
  };
  const existingAll = (existingRows ?? []) as ExistingPay[];
  // Lone null-utr DRAFT row per post_id (the auto-init row to update in place).
  const draftByPostId = new Map<string, ExistingPay>();
  // Sum of already-recorded installments (rows WITH a utr) per post_id — the
  // paid-so-far baseline. Drafts (null utr) never count toward paid.
  const paidSoFarByPostId = new Map<string, number>();
  for (const r of existingAll) {
    const hasUtr = (r.utr ?? "").trim().length > 0;
    if (hasUtr) {
      paidSoFarByPostId.set(
        r.post_id,
        (paidSoFarByPostId.get(r.post_id) ?? 0) + Number(r.amount ?? 0),
      );
    } else if (!draftByPostId.has(r.post_id)) {
      draftByPostId.set(r.post_id, r);
    }
  }
  // Same (post_id, lower(utr)) dedup key set — an installment with a UTR
  // already recorded for the same post is a duplicate submission.
  const existingKeys = new Set<string>(
    existingAll
      .filter((r) => (r.utr ?? "").trim().length > 0)
      .map((r) => `${r.post_id}|${String(r.utr).trim().toLowerCase()}`),
  );

  // §7.2 Reel rule pre-check — per collab_id, pull all deliverables to verify
  // at least one has reel content with link.
  const collabKeys = new Set<string>();
  // inf_ids of the collabs we touch — used to fetch every deliverable of those
  // collabs in one query (deliverables of a collab share inf_id).
  const touchedInfIds = new Set<string>();
  for (const r of rows) {
    const p = postById.get(r.postId);
    if (!p) continue;
    collabKeys.add(collabKeyOf(p));
    if (p.inf_id) touchedInfIds.add(p.inf_id);
  }
  const collabsWithReel = new Set<string>();
  if (collabKeys.size > 0) {
    const infIds = [...touchedInfIds];
    if (infIds.length > 0) {
      const { data: collabRows } = await (supabase as any)
        .from("posts")
        .select(
          "post_id, inf_id, collab_number, collab_id, reels, deliverable_type, post_link, post_date",
        )
        .in("inf_id", infIds);
      for (const cr of (collabRows ?? []) as Array<{
        post_id: string;
        inf_id: string | null;
        collab_number: number | null;
        collab_id: string | null;
        reels: number | null;
        deliverable_type: string | null;
        post_link: string | null;
        post_date: string | null;
      }>) {
        const key = collabKeyOf(cr);
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
  //       whose partnership the creator hasn't APPROVED (and no admin
  //       override). Same collab-wide lock.
  // Both maps store the offending sibling post_id_short so the toast can call
  // them out by name. Saadaa pays per-collab, not per-deliverable, so any
  // sibling deficiency blocks every payment in the collab.
  const collabUnpostedByKey = new Map<string, string[]>();
  const collabPartnershipMissingByKey = new Map<string, string[]>();
  // Collab agreed total = sum of commercial_amount across every deliverable
  // sharing the collab_id (each row stores the per-row equal-split value).
  // Used to decide Partial vs Done against paid-so-far. Mirrors the
  // collabSumMap in queries.ts so submit + board agree on the total.
  const collabTotalByKey = new Map<string, number>();
  if (collabKeys.size > 0) {
    const infIds = [...touchedInfIds];
    if (infIds.length > 0) {
      const { data: collabRows } = await (supabase as any)
        .from("posts")
        .select(
          "post_id, post_id_short, inf_id, collab_number, collab_id, commercial_amount, post_link, post_date, ads_usage_rights, partnership_id, ad_partnership_valid, partnership_status",
        )
        .in("inf_id", infIds);
      for (const cr of (collabRows ?? []) as Array<{
        post_id: string;
        post_id_short: string | null;
        inf_id: string | null;
        collab_number: number | null;
        collab_id: string | null;
        commercial_amount: number | null;
        post_link: string | null;
        post_date: string | null;
        ads_usage_rights: string | null;
        partnership_id: string | null;
        ad_partnership_valid: boolean | null;
        partnership_status: string | null;
      }>) {
        const key = collabKeyOf(cr);
        collabTotalByKey.set(
          key,
          (collabTotalByKey.get(key) ?? 0) + Number(cr.commercial_amount ?? 0),
        );
        const sibLabel = cr.post_id_short ?? cr.post_id ?? "?";
        if (!cr.post_link || !cr.post_date) {
          const arr = collabUnpostedByKey.get(key) ?? [];
          arr.push(sibLabel);
          collabUnpostedByKey.set(key, arr);
        }
        if (ADS_YES(cr.ads_usage_rights)) {
          // Creator must have APPROVED the partnership (or admin override) —
          // key presence alone no longer counts.
          if (!partnershipApproved(cr)) {
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
    const collabKey = collabKeyOf(p);
    const unposted = collabUnpostedByKey.get(collabKey) ?? [];
    const partnershipMissing =
      collabPartnershipMissingByKey.get(collabKey) ?? [];

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
    // =Yes whose partnership the creator hasn't APPROVED (and no admin
    // override) blocks all payments in the collab. Only fires for Done
    // attempts (UTR provided); draft writes still pass.
    if (hasUtr) {
      const ownAdsRequired = ADS_YES(p.ads_usage_rights);
      const ownHasPartnership = partnershipApproved(p);
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

    // Dedup — block only when the collab is ALREADY FULLY PAID (paid-so-far ≥
    // collab total). Partial-payments model: a partially-paid collab still
    // accepts further installments until the total is met. Draft rows
    // (null utr) never count toward paid, so a fresh collab is never blocked.
    const collabTotal = collabTotalByKey.get(collabKey) ?? Number(p.commercial_amount ?? 0);
    const paidSoFar = paidSoFarByPostId.get(r.postId) ?? 0;
    if (collabTotal > 0 && paidSoFar >= collabTotal) {
      duplicates.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: [],
        partnershipMissingSiblings: [],
      });
      continue;
    }
    const utrNonEmpty = (r.utr ?? "").trim().length > 0;
    // Block exact duplicate installment — same (post_id, lower(utr)) already
    // recorded (re-submission of the same bank reference).
    const dedupKey = `${r.postId}|${(r.utr ?? "").trim().toLowerCase()}`;
    if (utrNonEmpty && existingKeys.has(dedupKey)) {
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
  let partial = 0;
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

  // Running paid-so-far per post across THIS batch (seeded with the DB
  // baseline) so two installments for the same collab in one submission
  // accumulate correctly when deciding Partial vs Done.
  const runningPaidByPost = new Map<string, number>(paidSoFarByPostId);

  for (const r of accepted) {
    const post = postById.get(r.postId)!;
    const hasUtr = (r.utr ?? "").trim().length > 0;
    const collabKey = collabKeyOf(post);
    const collabTotal =
      collabTotalByKey.get(collabKey) ?? Number(post.commercial_amount ?? 0);
    const dueDate = paymentDueDateFor(r.paymentDate);
    const estPayable = nextPayableCycleDate(dueDate);
    const postedNotTested = isPostedButNotTested(
      post.ads_usage_rights,
      post.ads_results,
      post.post_id_short,
      coveredSet,
    );

    // ── Installment (UTR present) ──────────────────────────────────────────
    // Partial-payments model: a real installment is a NEW row carrying a
    // distinct UTR. We never overwrite prior installments. After inserting,
    // recompute paid-so-far for the collab and derive the collab-level state:
    //   paid ≥ total → Done   ·   0 < paid < total → Partial
    if (hasUtr) {
      const priorPaid = runningPaidByPost.get(r.postId) ?? 0;
      const newPaid = priorPaid + Number(r.amount ?? 0);
      const fullyPaid = collabTotal > 0 && newPaid + 0.0001 >= collabTotal;
      const collabStatus: "Done" | "Partial" = fullyPaid ? "Done" : "Partial";

      // Insert the installment row (distinct UTR → distinct row).
      const { data: insRow, error: insErr } = await (supabase as any)
        .from("payments")
        .insert({
          post_id: r.postId,
          deliverable_post_id: r.postId,
          inf_id: post.inf_id || null,
          username: post.username || null,
          utr: r.utr,
          amount: r.amount,
          payment_date: r.paymentDate || null,
          // The installment row itself carries the collab's current rollup
          // status so the ledger overlay (latest row wins) reflects Partial/Done.
          status: collabStatus,
          due_date: dueDate,
          estimated_payable_date: estPayable,
          payment_advice_sent: false,
          bank_name: r.bankName || post.bank_name || null,
          bank_number: r.bankNumber || post.bank_number || null,
          ifsc: r.ifsc || post.ifsc || null,
          collab_id: collabKey,
          collab_number: post.collab_number ?? null,
          deliverable_index: post.deliverable_index ?? null,
          posted_but_not_tested: postedNotTested,
        })
        .select("id")
        .single();
      if (insErr) {
        console.error(`[submitPayments] insert ${r.postId}: ${insErr.message}`);
        duplicates.push(r.postId);
        blockedDetails.push({
          postId: r.postId,
          unpostedSiblings: [],
          partnershipMissingSiblings: [],
        });
        continue;
      }
      runningPaidByPost.set(r.postId, newPaid);
      if (insRow?.id != null) testPaymentIds.push(insRow.id as number);
      saved++;

      // Retire the lone null-utr DRAFT row for this post (if any) — it has been
      // superseded by real installments. Stamp it to the rollup status so a
      // stale "Not Due/Due" draft can't out-rank the installment in the
      // latest-row overlay. Done in place (matched by id), never duplicated.
      const draft = draftByPostId.get(r.postId);
      if (draft) {
        await (supabase as any)
          .from("payments")
          .update({ status: collabStatus })
          .eq("id", draft.id);
      }

      // Mirror rollup status onto the representative post row.
      const { error: updErr } = await (supabase as any)
        .from("posts")
        .update({
          payment_status: collabStatus,
          utr: r.utr,
          payment_date: r.paymentDate,
        })
        .eq("post_id", r.postId);
      if (updErr) {
        console.error(
          `[submitPayments] posts update ${r.postId}: ${updErr.message}`,
        );
      }

      if (collabStatus === "Done") {
        paid++;
        paidPosts.push({
          postId: r.postId,
          infId: post.inf_id || null,
          amount: newPaid,
          utr: r.utr || null,
          paymentDate: r.paymentDate || null,
        });
      } else partial++;

      // Cascade the rollup status to every OTHER deliverable of the collab so
      // the board shows the whole collab Partial/Done. We DELETE stray payment
      // rows on the other deliverables only once the collab is fully Done, to
      // keep spend one-per-collab; while Partial we leave them untouched (they
      // carry no installment rows of their own under this model anyway).
      if (post.inf_id) {
        const { data: collabRows } = await (supabase as any)
          .from("posts")
          .select("post_id, inf_id, collab_number, collab_id")
          .eq("inf_id", post.inf_id);

        const otherIds = (
          (collabRows ?? []) as Array<{
            post_id: string;
            inf_id: string | null;
            collab_number: number | null;
            collab_id: string | null;
          }>
        )
          .filter(
            (c) => collabKeyOf(c) === collabKey && c.post_id !== post.post_id,
          )
          .map((c) => c.post_id);

        if (otherIds.length > 0) {
          await (supabase as any)
            .from("posts")
            .update({
              payment_status: collabStatus,
              utr: r.utr,
              payment_date: r.paymentDate,
            })
            .in("post_id", otherIds);

          if (collabStatus === "Done") {
            // Spend stays one-per-collab — remove stray rows on siblings.
            await (supabase as any)
              .from("payments")
              .delete()
              .in("post_id", otherIds);
          }
        }
      }
      continue;
    }

    // ── Draft write (no UTR) ───────────────────────────────────────────────
    // No money moved — record/refresh the collab's draft row as Due. Match the
    // existing lone draft in place (never create a second null-utr draft).
    const draftPayload: Record<string, unknown> = {
      utr: null,
      amount: r.amount,
      payment_date: r.paymentDate || null,
      status: "Due",
      due_date: dueDate,
      estimated_payable_date: estPayable,
      payment_advice_sent: false,
      bank_name: r.bankName || post.bank_name || null,
      bank_number: r.bankNumber || post.bank_number || null,
      ifsc: r.ifsc || post.ifsc || null,
      collab_id: collabKey,
      collab_number: post.collab_number ?? null,
      deliverable_index: post.deliverable_index ?? null,
      posted_but_not_tested: postedNotTested,
    };
    const existingDraft = draftByPostId.get(r.postId);
    let writeErr: { message: string } | null = null;
    if (existingDraft) {
      const { error } = await (supabase as any)
        .from("payments")
        .update(draftPayload)
        .eq("id", existingDraft.id);
      writeErr = error;
    } else {
      const { data: draftRow, error } = await (supabase as any)
        .from("payments")
        .insert({
          ...draftPayload,
          post_id: r.postId,
          deliverable_post_id: r.postId,
          inf_id: post.inf_id || null,
          username: post.username || null,
        })
        .select("id")
        .single();
      writeErr = error;
      if (!error && draftRow?.id != null) {
        testPaymentIds.push(draftRow.id as number);
      }
    }
    if (writeErr) {
      console.error(`[submitPayments] draft ${r.postId}: ${writeErr.message}`);
      duplicates.push(r.postId);
      blockedDetails.push({
        postId: r.postId,
        unpostedSiblings: [],
        partnershipMissingSiblings: [],
      });
      continue;
    }
    saved++;
    due++;
    const { error: updErr } = await (supabase as any)
      .from("posts")
      .update({ payment_status: "Due" })
      .eq("post_id", r.postId);
    if (updErr) {
      console.error(
        `[submitPayments] posts update ${r.postId}: ${updErr.message}`,
      );
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
        .select("post_id, email, username, collab_id")
        .in("post_id", snapPostIds);
      const emailByPost = new Map<string, string | null>();
      const nameByPost = new Map<string, string | null>();
      const collabByPost = new Map<string, string | null>();
      for (const pr of (postEmailRows ?? []) as Array<{
        post_id: string;
        email: string | null;
        username: string | null;
        collab_id: string | null;
      }>) {
        emailByPost.set(pr.post_id, pr.email);
        nameByPost.set(pr.post_id, pr.username);
        collabByPost.set(pr.post_id, pr.collab_id);
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
        const collabId = collabByPost.get(pp.postId) ?? pp.postId;
        const amountFmt = new Intl.NumberFormat("en-IN").format(pp.amount);
        const bodyHtml = `
          <p style="margin:0 0 12px;">Hi <strong>${esc(greetName)}</strong>,</p>
          <p style="margin:0 0 14px;">Your payment for collaboration <strong>${esc(collabId)}</strong> has been processed.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">
            <tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;font-weight:800;width:40%;">Amount</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;">INR ${amountFmt}</td></tr>
            ${pp.utr ? `<tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">UTR / Reference</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">${esc(pp.utr)}</td></tr>` : ""}
            ${pp.paymentDate ? `<tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Payment Date</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">${esc(pp.paymentDate)}</td></tr>` : ""}
          </table>
          <p style="margin:0;font-size:13px;color:#6E695E;">If anything looks off, simply reply to this email and our team will help.</p>`;
        const plainBody =
          `Hi ${greetName},\n\n` +
          `Your payment for collaboration ${collabId} has been processed.\n` +
          `Amount: INR ${amountFmt}` +
          (pp.utr ? `\nUTR/Reference: ${pp.utr}` : "") +
          (pp.paymentDate ? `\nPayment Date: ${pp.paymentDate}` : "") +
          `\n\nIf anything looks off, reply to this email.`;
        await sendNotification({
          type: NOTIFICATION_TYPES.PAYMENT_PROCESSED,
          to,
          subject: `Payment Processed · ${collabId}`,
          htmlBody: bodyHtml,
          plainBody,
          postId: pp.postId,
          collabId,
        });
      }
    });
  }

  // ── Submitter confirmation (Wave 7.x) ───────────────────────────────────
  // ONE summary email to the actor (the accounts operator) — NOT one per row.
  // Distinct from the per-creator "Payment Processed" emails above. Fires only
  // when at least one row was written. Fire-and-forget via after(); best-effort.
  if (saved > 0) {
    const savedCount = saved;
    const paidCount = paid;
    const dueCount = due;
    const partialCount = partial;
    const skippedCount = skipped;
    after(async () => {
      await notifyActorConfirmation({
        actor,
        type: NOTIFICATION_TYPES.PAYMENT_CONFIRMATION,
        subject: `${savedCount} payment${
          savedCount === 1 ? "" : "s"
        } logged (${paidCount} paid · ${partialCount} partial · ${dueCount} due)`,
        title: "Payments logged",
        summaryLines: [
          `Your payment submission was processed — ${savedCount} record${
            savedCount === 1 ? "" : "s"
          } logged.`,
        ],
        rows: [
          { label: "Records Logged", value: savedCount },
          { label: "Marked Paid", value: paidCount },
          { label: "Marked Partial", value: partialCount > 0 ? partialCount : null },
          { label: "Marked Due", value: dueCount },
          { label: "Skipped / Blocked", value: skippedCount > 0 ? skippedCount : null },
        ],
        footnote:
          "Paid records also trigger a separate payment-processed email to each creator. Partial records leave a balance outstanding until the collab total is met.",
      });
    });
  }

  // Test Mode: stamp the payment rows created in this submit when the Payment
  // scope is on. No-op when Test Mode is off.
  await stampTestRows([
    { scope: "payment", table: "payments", idColumn: "id", ids: testPaymentIds },
  ]);

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
    partial,
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
