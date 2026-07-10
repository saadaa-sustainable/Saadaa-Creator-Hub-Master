import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import {
  creatorAcceptedPartnership,
  isCollabPaymentEligible,
  postingFormCompleted,
} from "@/lib/payment-eligibility";
import { nextPayableCycleDate, paymentDueDateFor } from "@/lib/payable-cycle";
import type { PaymentsRow } from "@/lib/supabase/types.gen";
import type { AccountsFilters, AccountsKpi, AccountsRow } from "./types";

/**
 * Accounts Hub data fetch — mirrors legacy `getAccountsHubData`
 * (InfluencerBackend.js:10503-10746).
 *
 * Reads parent posts in workflow_status ∈ {Reach Out, On Board, Order Sent,
 * Posted, Delivered} (children skipped — payment lives on parent collab).
 * Overlays latest payment row per post for status/UTR/date/match badges.
 * Computes KPIs over the Posted+Delivered subset only.
 *
 * Service-role client used because page-level RBAC has already gated access.
 * Filter options are derived from the same dataset (no extra fetches).
 */
const PAYABLE_STAGES = [
  "Reach Out",
  "On Board",
  "Order Sent",
  "Posted",
  "Delivered",
] as const;

const KPI_STAGES = new Set(["Posted", "Delivered"]);

export async function fetchAccountsHubData(
  filters: AccountsFilters,
  opts: { includeVoided?: boolean } = {},
): Promise<{ rows: AccountsRow[]; kpi: AccountsKpi }> {
  const supabase = createServiceClient();

  // Voided (offboarded) collabs are excluded from the board / Due list / KPIs by
  // default — their balance can no longer be paid. The Paid CSV opts in via
  // `includeVoided` so already-disbursed money still appears in finance history.
  const stages = opts.includeVoided
    ? [...PAYABLE_STAGES, "Offboarded", "Offboarding"]
    : PAYABLE_STAGES;

  let postsQuery = (supabase as any)
    .from("posts")
    .select(
      `
      post_id,
      post_id_short,
      workflow_status,
      inf_id,
      campaign_id,
      collab_number,
      collab_id,
      deliverable_index,
      content_type,
      nomenclature,
      collab_type,
      commercial_amount,
      barter_amount,
      ads_usage_rights,
      partnership_id,
      ad_partnership_valid,
      partnership_status,
      username,
      post_link,
      post_date,
      onboard_date,
      reach_out_date,
      reels,
      static_posts,
      stories,
      payment_status,
      bank_name,
      bank_number,
      ifsc,
      campaign:campaigns ( campaign_id, campaign_name ),
      creator:creators  ( inf_id, username, inf_name, profile_pic, category, followers, verification, is_active )
    `,
    )
    .in("workflow_status", stages);
  // Collab ID model: fetch ALL deliverables (no parent/child filter). We
  // collapse to ONE representative row per collab_id in JS below, and sum
  // commercial_amount across every deliverable sharing that collab_id. Payment
  // is raised per collab_id (one payment covers the whole collab).

  if (filters.campaign) {
    postsQuery = postsQuery.eq("campaign_id", filters.campaign);
  }
  // Ad-rights filter is applied in JS below (see ADS_YES). supabase-js
  // `.not(col,"in",'("",no,No,NO)')` mangles the quoted/paren in-list, so the
  // "Yes" filter silently dropped valid free-text durations like "5 Months".

  const { data: postsRaw, error: postsErr } = await postsQuery
    .order("reach_out_date", { ascending: false, nullsFirst: false })
    .limit(2000);

  if (postsErr) throw postsErr;
  const allDeliverables = (postsRaw ?? []) as Array<
    Omit<AccountsRow, "payment"> & {
      campaign: AccountsRow["campaign"];
      creator: AccountsRow["creator"];
    }
  >;

  // collab_id grouping key — prefer the stamped collab_id; fall back to
  // inf_id||'-C'||collab_number for legacy rows not yet backfilled, then to
  // post_id so a lone row still forms its own group.
  const collabKeyOf = (p: Record<string, unknown>): string => {
    const cid = p.collab_id as string | null;
    if (cid) return cid;
    const inf = p.inf_id as string | null;
    const cn = (p.collab_number as number | null) ?? 1;
    if (inf) return `${inf}-C${cn}`;
    return (p.post_id as string) ?? "";
  };

  // Collapse to ONE representative row per collab_id (lowest post_id), and sum
  // commercial_amount across all deliverables of the collab so the representative
  // carries the originally-agreed total (each row stores the per-row split).
  const repByCollab = new Map<string, (typeof allDeliverables)[number]>();
  const collabSumMap = new Map<string, number>();
  const collabCountMap = new Map<string, number>();
  for (const d of allDeliverables) {
    const dAny = d as Record<string, unknown>;
    const key = collabKeyOf(dAny);
    collabSumMap.set(
      key,
      (collabSumMap.get(key) ?? 0) + Number(dAny.commercial_amount ?? 0),
    );
    collabCountMap.set(key, (collabCountMap.get(key) ?? 0) + 1);
    const cur = repByCollab.get(key);
    if (
      !cur ||
      String(dAny.post_id ?? "") <
        String((cur as Record<string, unknown>).post_id ?? "")
    ) {
      repByCollab.set(key, d);
    }
  }
  let postsLoaded = Array.from(repByCollab.values());

  // Ad-rights filter (REQ #8): use the canonical ADS_YES truthiness helper so
  // free-text durations ("5 Months", "12 Months", …) count as "Yes".
  if (filters.adsRights === "yes") {
    postsLoaded = postsLoaded.filter((p) =>
      ADS_YES((p as Record<string, unknown>).ads_usage_rights as string | null),
    );
  } else if (filters.adsRights === "no") {
    postsLoaded = postsLoaded.filter(
      (p) =>
        !ADS_YES(
          (p as Record<string, unknown>).ads_usage_rights as string | null,
        ),
    );
  }

  // Collab total: each deliverable's commercial_amount holds the per-row split
  // value; the originally-agreed total = sum across all deliverables sharing the
  // collab_id (already computed in collabSumMap above). Overwrite the
  // representative row's commercial_amount before downstream consumers (KPIs,
  // payment drafts, UI).
  const posts = postsLoaded.map((p) => {
    const pAny = p as Record<string, unknown>;
    const key = collabKeyOf(pAny);
    const collabTotal = collabSumMap.get(key);
    const count = collabCountMap.get(key) ?? 1;
    return {
      ...p,
      ...(collabTotal != null ? { commercial_amount: collabTotal } : {}),
      _collabDeliverableCount: count,
    };
  });

  // Overlay payments — pull every payment whose post_id is in this batch,
  // then bucket by post_id and pick the latest row per post.
  const postIds = posts
    .map((p) => p.post_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const paymentsByPostId = new Map<string, PaymentsRow>();
  // Partial-payments: sum of all installment amounts (UTR-bearing rows) per
  // post_id — the paid-so-far baseline. Drafts (null utr) never count.
  const paidSoFarByPostId = new Map<string, number>();
  if (postIds.length > 0) {
    const { data: paymentsRaw, error: payErr } = await (supabase as any)
      .from("payments")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: false });
    if (payErr) {
      console.error("[accounts-hub] payments fetch failed:", payErr.message);
    }
    for (const row of (paymentsRaw ?? []) as PaymentsRow[]) {
      // We want the LATEST row per post_id. Iterating in created_at desc, so
      // first hit wins.
      if (!paymentsByPostId.has(row.post_id)) {
        paymentsByPostId.set(row.post_id, row);
      }
      // Accumulate paid-so-far across every installment row (those with a UTR).
      if ((row.utr ?? "").trim().length > 0) {
        paidSoFarByPostId.set(
          row.post_id,
          (paidSoFarByPostId.get(row.post_id) ?? 0) + Number(row.amount ?? 0),
        );
      }
    }
  }

  // Backfill: Posted/Delivered collabs (one representative row per collab_id)
  // that have no payment row yet, BUT only for collabs that are fully
  // payment-eligible. A collab is payment-eligible when:
  //   1. EVERY deliverable of the collab is posted (post_link + post_date), and
  //   2. the creator has ACCEPTED the partnership on every mirrored row.
  // If either condition fails, we skip the draft so the operator doesn't see
  // a phantom UTR-less row for a collab that can't be paid yet. Mirrors the
  // collab-level gate in `submitPayments`. Keyed on collab_id.
  const payableStages = new Set(["Posted", "Delivered"]);
  const candidates = posts.filter(
    (p) =>
      p.post_id &&
      payableStages.has(p.workflow_status as string) &&
      !paymentsByPostId.has(p.post_id!),
  );

  let backfillEligible: typeof candidates = [];
  if (candidates.length > 0) {
    const candidateInfIds = [
      ...new Set(
        candidates
          .map((p) => (p as Record<string, unknown>).inf_id as string | null)
          .filter((v): v is string => !!v),
      ),
    ];
    // Track, per collab_id: whether it is locked, and the latest post_date
    // across its deliverables (used to set the draft due_date).
    const collabLocked = new Set<string>();
    const collabPostDate = new Map<string, string>();
    if (candidateInfIds.length > 0) {
      const { data: sibs } = await (supabase as any)
        .from("posts")
        .select(
          "inf_id, collab_number, collab_id, post_link, post_date, partnership_status",
        )
        .in("inf_id", candidateInfIds);
      for (const s of (sibs ?? []) as Array<{
        inf_id: string | null;
        collab_number: number | null;
        collab_id: string | null;
        post_link: string | null;
        post_date: string | null;
        partnership_status: string | null;
      }>) {
        if (!s.collab_id && s.collab_number == null) continue;
        const key = collabKeyOf(s as unknown as Record<string, unknown>);
        if (s.post_date) {
          const prev = collabPostDate.get(key);
          if (!prev || s.post_date > prev) collabPostDate.set(key, s.post_date);
        }
        if (!postingFormCompleted(s) || !creatorAcceptedPartnership(s)) {
          collabLocked.add(key);
        }
      }
    }
    backfillEligible = candidates.filter((p) => {
      const key = collabKeyOf(p as Record<string, unknown>);
      // Eligible only when every deliverable is posted (so a post_date exists)
      // and nothing locked the collab.
      return !collabLocked.has(key) && collabPostDate.has(key);
    });

    if (backfillEligible.length > 0) {
      const drafts = backfillEligible.map((p) => {
        const key = collabKeyOf(p as Record<string, unknown>);
        const collabDate = collabPostDate.get(key) ?? p.post_date ?? null;
        const due = paymentDueDateFor(collabDate);
        const pAny = p as Record<string, unknown>;
        return {
          post_id: p.post_id,
          deliverable_post_id: p.post_id,
          collab_id: pAny.collab_id ?? key,
          inf_id: pAny.inf_id ?? null,
          username: pAny.username ?? null,
          collab_number: pAny.collab_number ?? null,
          deliverable_index: pAny.deliverable_index ?? null,
          amount: Number(p.commercial_amount ?? 0),
          bank_name: pAny.bank_name ?? null,
          bank_number: pAny.bank_number ?? null,
          ifsc: pAny.ifsc ?? null,
          status: "Not Due",
          due_date: due,
          estimated_payable_date: nextPayableCycleDate(due),
          payment_advice_sent: false,
        };
      });
      // Partial-payments model dropped UNIQUE(post_id) (swapped for
      // UNIQUE(post_id, utr)), so onConflict:'post_id' is no longer valid. These
      // candidates already have ZERO payment rows (filtered against
      // paymentsByPostId above), so a plain insert is safe and preserves the
      // at-most-one-null-utr-draft-per-collab invariant.
      const { data: inserted, error: insErr } = await (supabase as any)
        .from("payments")
        .insert(drafts)
        .select("*");
      if (insErr)
        console.error("[accounts-hub] backfill insert failed:", insErr.message);
      for (const row of (inserted ?? []) as PaymentsRow[]) {
        if (!paymentsByPostId.has(row.post_id)) {
          paymentsByPostId.set(row.post_id, row);
        }
        const source = backfillEligible.find((p) => p.post_id === row.post_id);
        if (!source) continue;
        const sourceKey = collabKeyOf(source as Record<string, unknown>);
        const siblingIds = allDeliverables
          .filter(
            (deliverable) =>
              collabKeyOf(deliverable as Record<string, unknown>) === sourceKey,
          )
          .map((deliverable) => deliverable.post_id)
          .filter((id): id is string => Boolean(id));
        if (siblingIds.length > 0) {
          await (supabase as any)
            .from("posts")
            .update({ payment_status: "Not Due" })
            .in("post_id", siblingIds);
        }
      }
    }
  }

  // Heal dates on existing payment rows created before payable-cycle helpers
  // were wired up. Never manufacture a status here: only the strict eligible
  // draft paths above may create an open payment state.
  const needsHeal = posts.filter(
    (p) =>
      p.post_id &&
      p.post_date &&
      payableStages.has(p.workflow_status as string) &&
      paymentsByPostId.has(p.post_id!) &&
      !paymentsByPostId.get(p.post_id!)?.due_date,
  );
  for (const p of needsHeal) {
    const pay = paymentsByPostId.get(p.post_id!)!;
    const due = paymentDueDateFor(p.post_date);
    const est = nextPayableCycleDate(due);
    const patch: Record<string, unknown> = {
      due_date: due,
      estimated_payable_date: est,
    };
    const { error: healErr } = await (supabase as any)
      .from("payments")
      .update(patch)
      .eq("id", pay.id);
    if (healErr)
      console.error(
        `[accounts-hub] heal failed for ${pay.id}:`,
        healErr.message,
      );
    else paymentsByPostId.set(p.post_id!, { ...pay, ...patch } as PaymentsRow);
  }

  // Decorate a representative row with the partial-payments rollup. The
  // representative's `commercial_amount` already holds the collab agreed total
  // (summed above). paid-so-far is the sum of installment amounts; remainder is
  // the still-owed balance; _isPartial is true while 0 < paid < total.
  const decorate = (p: (typeof posts)[number]): AccountsRow => {
    // Accounts Hub only handles onboarded posts, so post_id is non-null here;
    // `?? ""` keeps the map lookups well-typed against the now-nullable column.
    const payment = paymentsByPostId.get(p.post_id ?? "") ?? null;
    const total = Number(p.commercial_amount ?? 0);
    const paidSoFar = paidSoFarByPostId.get(p.post_id ?? "") ?? 0;
    const remainder = Math.max(0, total - paidSoFar);
    const isPartial = paidSoFar > 0 && total > 0 && paidSoFar + 0.0001 < total;
    return {
      ...p,
      payment,
      _paidSoFar: paidSoFar,
      _remainder: remainder,
      _isPartial: isPartial,
    };
  };

  let rows: AccountsRow[] = posts.map(decorate);

  // Apply free-text search + status filter in memory (cross-join would have
  // been a nightmare in PostgREST; dataset is bounded by .limit(2000)).
  if (filters.q?.trim()) {
    const needle = filters.q.trim().toLowerCase();
    rows = rows.filter((r) => {
      const fields = [
        r.post_id,
        r.post_id_short,
        r.campaign?.campaign_id,
        r.campaign?.campaign_name,
        r.creator?.inf_name,
        r.creator?.username,
        r.payment?.utr,
      ];
      return fields.some((f) =>
        String(f ?? "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }
  if (filters.statusFilter) {
    const target = filters.statusFilter;
    rows = rows.filter((r) => (r.payment?.status ?? "") === target);
  }

  // KPIs — derived BEFORE filters so they always reflect the corpus, NOT the
  // filter view. Matches legacy behavior (filter bar shows count chip; KPIs
  // stay global).
  const corpus = posts.map(decorate);
  const kpi = computeKpi(corpus);

  return { rows, kpi };
}

function computeKpi(rows: AccountsRow[]): AccountsKpi {
  let postsDone = 0;
  let notDueCount = 0;
  let notDueSum = 0;
  let dueCount = 0;
  let dueSum = 0;
  let doneCount = 0;
  let doneSum = 0;
  let partialCount = 0;
  let partialOutstanding = 0;
  let totalPayable = 0;

  for (const r of rows) {
    if (!KPI_STAGES.has(String(r.workflow_status))) continue;
    postsDone++;
    const total = Number(r.commercial_amount ?? 0);

    // Partial takes precedence: a collab with a balance outstanding belongs in
    // the Partial / Outstanding bucket regardless of the latest row's status.
    if (r._isPartial) {
      totalPayable += total;
      partialCount++;
      partialOutstanding += Number(r._remainder ?? 0);
      continue;
    }

    const status = r.payment?.status ?? null;
    // A posted collab with no payment row is not payment-pending. It enters
    // the payable corpus only after every posting form is complete and the
    // creator has accepted the partnership, at which point a draft exists.
    if (!status) continue;
    totalPayable += total;
    switch (status) {
      case "Not Due":
        notDueCount++;
        notDueSum += total;
        break;
      case "Due":
        dueCount++;
        dueSum += total;
        break;
      case "Partial":
        // Defensive: status says Partial but no remainder computed (e.g. data
        // drift). Treat as outstanding with whatever balance we have.
        partialCount++;
        partialOutstanding += Number(r._remainder ?? total);
        break;
      case "Done":
        doneCount++;
        doneSum += total;
        break;
      default:
        totalPayable -= total;
    }
  }

  return {
    postsDone,
    notDue: { count: notDueCount, sum: notDueSum },
    due: { count: dueCount, sum: dueSum },
    done: { count: doneCount, sum: doneSum },
    partial: { count: partialCount, sum: partialOutstanding },
    totalPayable,
  };
}

/** Distinct campaigns for the filter dropdown. Cached 5 min. */
export const fetchAccountsFilterOptions = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .order("campaign_id", { ascending: false })
      .limit(200);
    return {
      campaigns: campaigns ?? [],
      statuses: ["Not Due", "Due", "Partial", "Done"] as const,
      adsRights: ["yes", "no"] as const,
    };
  },
  ["accounts-hub-filter-options"],
  { revalidate: 300, tags: ["payments", "posts", "campaigns"] },
);

const ADS_YES = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  return !["", "no", "n/a", "none", "0", "false"].includes(
    raw.trim().toLowerCase(),
  );
};

/**
 * Posts eligible for a new payment submit. Enforces collab-level readiness:
 *   1. Every deliverable in the collab must have a post_link (posting form submitted).
 *   2. The creator must have accepted the partnership (partnership_status='approved').
 *
 * Fetches all Posted/Delivered deliverables, groups by collab_id, and returns
 * ONE representative row per ready collab (payment is raised per collab_id).
 */
export async function fetchPayableEligiblePosts(): Promise<
  Array<{
    post_id: string;
    post_id_short: string | null;
    collab_id: string | null;
    inf_name: string | null;
    username: string | null;
    profile_pic: string | null;
    commercial_amount: number | null;
    campaign_id: string | null;
    workflow_status: string;
    ads_usage_rights: string | null;
    partnership_id: string | null;
    ad_partnership_valid: boolean | null;
    partnership_status: string | null;
  }>
> {
  const supabase = createServiceClient();
  // Fetch every collab row, including unfinished siblings, so a partially
  // posted collab cannot look ready merely because only Posted rows were read.
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(
      `
      post_id, post_id_short, commercial_amount, campaign_id, workflow_status,
      ads_usage_rights, partnership_id, ad_partnership_valid, partnership_status, deliverable_index,
      post_link, post_date, inf_id, collab_number, collab_id,
      creator:creators ( username, inf_name, profile_pic )
    `,
    )
    .not("post_id", "is", null)
    .not("collab_number", "is", null)
    .order("post_date", { ascending: false, nullsFirst: false })
    .limit(50_000);

  if (error) throw error;
  const rows = (data ?? []) as any[];

  // collab_id grouping key — prefer collab_id, fall back to inf_id||'-C'||cn,
  // then post_id (so a lone row still forms its own collab group).
  const keyOf = (r: any): string =>
    (r.collab_id as string | null) ??
    (r.inf_id ? `${r.inf_id}-C${r.collab_number ?? 1}` : (r.post_id as string));

  // Group deliverables by collab_id.
  const collabMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = keyOf(r);
    if (!collabMap.has(key)) collabMap.set(key, []);
    collabMap.get(key)!.push(r);
  }

  // Collab is payment-ready only when every posting form is complete and the
  // creator has accepted the partnership. Admin overrides do not count.
  const readyKeys = new Set<string>();
  for (const [key, deliverables] of collabMap) {
    const allInPostedStage = deliverables.every(
      (deliverable) =>
        deliverable.workflow_status === "Posted" ||
        deliverable.workflow_status === "Delivered",
    );
    if (allInPostedStage && isCollabPaymentEligible(deliverables)) {
      readyKeys.add(key);
    }
  }

  // Sum commercial_amount across all deliverables per collab_id — each row
  // stores the per-row split, not the original total.
  const collabTotal = new Map<string, number>();
  // Pick ONE representative row per collab_id (lowest post_id) — payment is
  // raised once per collab_id.
  const repByCollab = new Map<string, any>();
  for (const r of rows) {
    const key = keyOf(r);
    collabTotal.set(
      key,
      (collabTotal.get(key) ?? 0) + Number(r.commercial_amount ?? 0),
    );
    const cur = repByCollab.get(key);
    if (!cur || String(r.post_id ?? "") < String(cur.post_id ?? "")) {
      repByCollab.set(key, r);
    }
  }

  // Return one representative row per ready collab.
  return Array.from(repByCollab.entries())
    .filter(([key]) => readyKeys.has(key))
    .map(([key, r]) => ({
      post_id: r.post_id,
      post_id_short: r.post_id_short ?? null,
      // `key` already resolves the real collab_id (or legacy inf_id-Cn fallback).
      collab_id: (r.collab_id as string | null) ?? key ?? null,
      commercial_amount: collabTotal.get(key) ?? r.commercial_amount ?? null,
      campaign_id: r.campaign_id ?? null,
      workflow_status: r.workflow_status,
      ads_usage_rights: r.ads_usage_rights ?? null,
      partnership_id: r.partnership_id ?? null,
      ad_partnership_valid: r.ad_partnership_valid ?? null,
      partnership_status: r.partnership_status ?? null,
      inf_name: r.creator?.inf_name ?? null,
      username: r.creator?.username ?? null,
      profile_pic: r.creator?.profile_pic ?? null,
    }));
}
