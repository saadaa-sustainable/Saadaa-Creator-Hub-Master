import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import {
  nextPayableCycleDate,
  paymentDueDateFor,
} from "@/lib/payable-cycle";
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
): Promise<{ rows: AccountsRow[]; kpi: AccountsKpi }> {
  const supabase = createServiceClient();

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
      deliverable_index,
      content_type,
      nomenclature,
      collab_type,
      commercial_amount,
      barter_amount,
      ads_usage_rights,
      partnership_id,
      ad_partnership_valid,
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
      creator:creators  ( inf_id, username, inf_name, profile_pic, category, followers, verification )
    `,
    )
    .in("workflow_status", PAYABLE_STAGES)
    // Parent deliverables only — child rows do not own a payment row.
    .or("deliverable_index.is.null,deliverable_index.eq.1");

  if (filters.campaign) {
    postsQuery = postsQuery.eq("campaign_id", filters.campaign);
  }
  if (filters.adsRights === "yes") {
    postsQuery = postsQuery.not("ads_usage_rights", "is", null);
    postsQuery = postsQuery.not("ads_usage_rights", "in", "(\"\",no,No,NO)");
  } else if (filters.adsRights === "no") {
    postsQuery = postsQuery.or(
      "ads_usage_rights.is.null,ads_usage_rights.in.(\"\",no,No,NO)",
    );
  }

  const { data: postsRaw, error: postsErr } = await postsQuery
    .order("reach_out_date", { ascending: false, nullsFirst: false })
    .limit(2000);

  if (postsErr) throw postsErr;
  const posts = (postsRaw ?? []) as Array<
    Omit<AccountsRow, "payment"> & {
      campaign: AccountsRow["campaign"];
      creator: AccountsRow["creator"];
    }
  >;

  // Overlay payments — pull every payment whose post_id is in this batch,
  // then bucket by post_id and pick the latest row per post.
  const postIds = posts
    .map((p) => p.post_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  let paymentsByPostId = new Map<string, PaymentsRow>();
  if (postIds.length > 0) {
    const { data: paymentsRaw, error: payErr } = await (supabase as any)
      .from("payments")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: false });
    if (payErr) {
      console.error(
        "[accounts-hub] payments fetch failed:",
        payErr.message,
      );
    }
    for (const row of (paymentsRaw ?? []) as PaymentsRow[]) {
      // We want the LATEST row per post_id. Iterating in created_at desc, so
      // first hit wins.
      if (!paymentsByPostId.has(row.post_id)) {
        paymentsByPostId.set(row.post_id, row);
      }
    }
  }

  // Backfill: Posted/Delivered parent posts that have no payment row yet.
  // Mirrors legacy backfillDraftPayments. No-op after initial run.
  const payableStages = new Set(["Posted", "Delivered"]);
  const needsBackfill = posts.filter(
    (p) =>
      p.post_id &&
      p.post_date &&
      payableStages.has(p.workflow_status as string) &&
      !paymentsByPostId.has(p.post_id!),
  );
  if (needsBackfill.length > 0) {
    const drafts = needsBackfill.map((p) => {
      const due = paymentDueDateFor(p.post_date);
      const pAny = p as Record<string, unknown>;
      return {
        post_id: p.post_id,
        deliverable_post_id: p.post_id,
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
    const { data: inserted, error: insErr } = await (supabase as any)
      .from("payments")
      .upsert(drafts, { onConflict: "post_id", ignoreDuplicates: true })
      .select("*");
    if (insErr)
      console.error("[accounts-hub] backfill upsert failed:", insErr.message);
    for (const row of (inserted ?? []) as PaymentsRow[]) {
      if (!paymentsByPostId.has(row.post_id)) {
        paymentsByPostId.set(row.post_id, row);
      }
    }
  }

  // Heal existing payment rows where due_date is null (created before payable-cycle
  // helpers were wired up). Also sets status to Not Due when null.
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
    const patch: Record<string, unknown> = { due_date: due, estimated_payable_date: est };
    if (!pay.status) patch.status = "Not Due";
    const { error: healErr } = await (supabase as any)
      .from("payments")
      .update(patch)
      .eq("id", pay.id);
    if (healErr)
      console.error(`[accounts-hub] heal failed for ${pay.id}:`, healErr.message);
    else
      paymentsByPostId.set(p.post_id!, { ...pay, ...patch } as PaymentsRow);
  }

  let rows: AccountsRow[] = posts.map((p) => ({
    ...p,
    payment: paymentsByPostId.get(p.post_id) ?? null,
  }));

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
        String(f ?? "").toLowerCase().includes(needle),
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
  const corpus = posts.map((p) => ({
    ...p,
    payment: paymentsByPostId.get(p.post_id) ?? null,
  }));
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
  let totalPayable = 0;

  for (const r of rows) {
    if (!KPI_STAGES.has(String(r.workflow_status))) continue;
    postsDone++;
    const amount = Number(
      r.payment?.amount ?? r.commercial_amount ?? 0,
    );
    totalPayable += amount;

    const status = r.payment?.status ?? null;
    switch (status) {
      case "Not Due":
        notDueCount++;
        notDueSum += amount;
        break;
      case "Due":
        dueCount++;
        dueSum += amount;
        break;
      case "Done":
        doneCount++;
        doneSum += amount;
        break;
      default:
        notDueCount++;
        notDueSum += amount;
    }
  }

  return {
    postsDone,
    notDue: { count: notDueCount, sum: notDueSum },
    due: { count: dueCount, sum: dueSum },
    done: { count: doneCount, sum: doneSum },
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
      statuses: ["Not Due", "Due", "Done"] as const,
      adsRights: ["yes", "no"] as const,
    };
  },
  ["accounts-hub-filter-options"],
  { revalidate: 300, tags: ["payments", "posts", "campaigns"] },
);

/**
 * Posts eligible for a new payment submit — Posted/Delivered + post_link set.
 * Mirrors legacy `getPayableEligiblePosts`. Used by the inline submit form
 * dropdown to keep operators from accidentally paying On Board rows.
 */
export async function fetchPayableEligiblePosts(): Promise<
  Array<{
    post_id: string;
    post_id_short: string | null;
    inf_name: string | null;
    username: string | null;
    profile_pic: string | null;
    commercial_amount: number | null;
    campaign_id: string | null;
    workflow_status: string;
    ads_usage_rights: string | null;
    partnership_id: string | null;
    ad_partnership_valid: boolean | null;
  }>
> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(
      `
      post_id, post_id_short, commercial_amount, campaign_id, workflow_status,
      ads_usage_rights, partnership_id, ad_partnership_valid, deliverable_index,
      post_link,
      creator:creators ( username, inf_name, profile_pic )
    `,
    )
    .in("workflow_status", ["Posted", "Delivered"])
    .or("deliverable_index.is.null,deliverable_index.eq.1")
    .not("post_link", "is", null)
    .order("post_date", { ascending: false, nullsFirst: false })
    .limit(2000);

  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    post_id: r.post_id,
    post_id_short: r.post_id_short ?? null,
    commercial_amount: r.commercial_amount ?? null,
    campaign_id: r.campaign_id ?? null,
    workflow_status: r.workflow_status,
    ads_usage_rights: r.ads_usage_rights ?? null,
    partnership_id: r.partnership_id ?? null,
    ad_partnership_valid: r.ad_partnership_valid ?? null,
    inf_name: r.creator?.inf_name ?? null,
    username: r.creator?.username ?? null,
    profile_pic: r.creator?.profile_pic ?? null,
  }));
}
