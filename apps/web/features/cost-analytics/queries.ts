import { createServiceClient } from "@/lib/supabase/server";
import type {
  CampaignTotalsRow,
  CostAnalyticsData,
  CostBreakdownRow,
  CostKpis,
  MonthSummaryRow,
  Tier,
  TierSummaryRow,
} from "./types";

/**
 * Legacy `getBudgetVsActuals` had two sources:
 *  - Budget: external "Influencer Tracker" spreadsheet.
 *  - Actuals: Creator Data sheet COMMERCIALS column for On Board / Posted /
 *    Delivered rows.
 *
 * New project: budget from `campaign_budget` table (synced from sheet by
 * MOM §3.1 migration), actuals from `posts.commercial_amount` for the same
 * status set, grouped by (month_label, campaign_id, tier).
 *
 * Tier mapping (matches legacy):
 *   < 10K     → Nano
 *   < 50K     → Micro
 *   < 300K    → Mid tier
 *   < 1M      → Macro
 *   ≥ 1M      → Mega
 */

const POSTS_SELECT = [
  "campaign_id",
  "workflow_status",
  "commercial_amount",
  "onboard_date",
  "reach_out_date",
  "deliverable_index",
  "inf_id",
  "username",
].join(",");

const ACTUAL_STATUSES = new Set([
  "on board",
  "order sent",
  "posted",
  "delivered",
]);

function tierForFollowers(followers: number | null | undefined): Tier {
  if (followers == null) return "Unknown";
  if (followers < 10_000) return "Nano";
  if (followers < 50_000) return "Micro";
  if (followers < 300_000) return "Mid tier";
  if (followers < 1_000_000) return "Macro";
  return "Mega";
}

function normalizeTier(raw: string | null): Tier {
  if (!raw) return "Unknown";
  const s = raw.trim().toLowerCase();
  if (s.includes("nano")) return "Nano";
  if (s.includes("micro")) return "Micro";
  if (s.includes("mid")) return "Mid tier";
  if (s.includes("macro")) return "Macro";
  if (s.includes("mega")) return "Mega";
  return "Unknown";
}

function monthFromDate(value: unknown): string | null {
  if (!value) return null;
  const t = new Date(String(value));
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function statusKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function emptyData(): CostAnalyticsData {
  return {
    kpis: emptyRow(),
    months: [],
    monthSummary: [],
    rows: [],
    tierSummary: [],
    campaignTotals: [],
    alerts: { overBudget: [], underUtilised: [] },
  };
}

function emptyRow() {
  return {
    budgetCreators: 0,
    actualCreators: 0,
    budgetCost: 0,
    actualCost: 0,
    totalWithGarments: 0,
    variance: 0,
    utilPct: 0,
  };
}

function finalize<T extends ReturnType<typeof emptyRow>>(row: T): T {
  row.variance = row.actualCost - row.budgetCost;
  row.utilPct =
    row.budgetCost > 0 ? Math.round((row.actualCost / row.budgetCost) * 100) : 0;
  return row;
}

export async function fetchCostAnalyticsData(): Promise<CostAnalyticsData> {
  const supabase = createServiceClient();

  // ── Campaigns table — authoritative name + total_budget per campaign ────
  const { data: campaignsData, error: campaignsErr } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, campaign_name, total_budget, campaign_num")
    .limit(2000);

  if (campaignsErr) {
    console.error("[cost-analytics] campaigns query failed:", campaignsErr);
    return emptyData();
  }

  const campaignsMap = new Map<
    string,
    {
      campaign_id: string;
      campaign_name: string;
      total_budget: number;
      campaign_num: number | null;
    }
  >();
  for (const c of (campaignsData ?? []) as Array<{
    campaign_id: string | null;
    campaign_name: string | null;
    total_budget: number | null;
    campaign_num: number | null;
  }>) {
    const id = String(c.campaign_id ?? "").trim();
    if (!id) continue;
    campaignsMap.set(id, {
      campaign_id: id,
      campaign_name: String(c.campaign_name ?? "").trim() || id,
      total_budget: Number(c.total_budget ?? 0),
      campaign_num: c.campaign_num ?? null,
    });
  }

  // ── Budget rows from campaign_budget table ──────────────────────────────
  const { data: budgetRows, error: budgetErr } = await (supabase as any)
    .from("campaign_budget")
    .select(
      "campaign_id, month_label, tier, collab_type, campaign_name, num_influencers, avg_comp, total_cost, total_with_garments",
    )
    .limit(2000);

  if (budgetErr) {
    console.error("[cost-analytics] budget query failed:", budgetErr);
    return emptyData();
  }

  // ── Posts (parent only) for actuals ─────────────────────────────────────
  const { data: postsData, error: postsErr } = await (supabase as any)
    .from("posts")
    .select(POSTS_SELECT)
    .limit(10_000);

  if (postsErr) {
    console.error("[cost-analytics] posts query failed:", postsErr);
    return emptyData();
  }

  const posts = (postsData ?? []) as Array<Record<string, unknown>>;

  // Pull creators to map inf_id → followers/category for tier resolution.
  const infIds = [
    ...new Set(
      posts
        .map((p) => String(p.inf_id ?? "").trim())
        .filter((id) => id.length > 0),
    ),
  ];

  const creatorTierMap = new Map<string, Tier>();
  if (infIds.length > 0) {
    const { data: creators } = await (supabase as any)
      .from("creators")
      .select("inf_id, followers, category")
      .in("inf_id", infIds)
      .limit(2000);
    for (const c of (creators ?? []) as Array<{
      inf_id: string | null;
      followers: number | null;
      category: string | null;
    }>) {
      const id = String(c.inf_id ?? "").trim();
      if (!id) continue;
      const t =
        normalizeTier(c.category) !== "Unknown"
          ? normalizeTier(c.category)
          : tierForFollowers(c.followers);
      creatorTierMap.set(id, t);
    }
  }

  // ── Key: month||campaignId||tier (collab_type tracked but not in key) ───
  type Key = string;
  const rowMap = new Map<Key, CostBreakdownRow>();
  const monthSet = new Set<string>();

  function rowKey(month: string, campaignId: string, tier: Tier): Key {
    return `${month}||${campaignId}||${tier}`;
  }

  function getOrCreate(
    month: string,
    campaignId: string,
    tier: Tier,
    collabType: string,
    campaignName?: string,
  ): CostBreakdownRow {
    const k = rowKey(month, campaignId, tier);
    const existing = rowMap.get(k);
    if (existing) {
      if (collabType && !existing.collabType.includes(collabType)) {
        existing.collabType = existing.collabType
          ? `${existing.collabType} + ${collabType}`
          : collabType;
      }
      if (campaignName && !existing.campaignName) {
        existing.campaignName = campaignName;
      }
      return existing;
    }
    const fallbackName =
      campaignName ?? campaignsMap.get(campaignId)?.campaign_name ?? campaignId;
    const row: CostBreakdownRow = {
      month,
      campaignId,
      campaignName: fallbackName,
      tier,
      collabType,
      garmentCost: 0,
      ...emptyRow(),
    };
    rowMap.set(k, row);
    monthSet.add(month);
    return row;
  }

  // Aggregate budgets (keyed by campaign_id, with campaign_name pulled from
  // campaigns table for consistency).
  for (const b of (budgetRows ?? []) as Array<Record<string, unknown>>) {
    const month = String(b.month_label ?? "").trim();
    const campaignId = String(b.campaign_id ?? "").trim();
    if (!month || !campaignId) continue;
    const campaignName =
      campaignsMap.get(campaignId)?.campaign_name ??
      (String(b.campaign_name ?? "").trim() || campaignId);
    const tier = normalizeTier(b.tier as string | null);
    const collabType = String(b.collab_type ?? "").trim();
    const row = getOrCreate(month, campaignId, tier, collabType, campaignName);
    row.budgetCreators += Number(b.num_influencers ?? 0);
    row.budgetCost += Number(b.total_cost ?? 0);
    row.totalWithGarments += Number(b.total_with_garments ?? 0);
    row.garmentCost +=
      Number(b.total_with_garments ?? 0) - Number(b.total_cost ?? 0);
  }

  // Aggregate actuals.
  //
  // commercial_amount is equal-split across all deliverables of a collab
  // (parent + children sum to the originally-agreed total). So actualCost
  // sums commercial_amount across ALL rows. actualCreators still counts
  // parent rows only (one creator per collab, not per deliverable).
  for (const p of posts) {
    const status = statusKey(p.workflow_status);
    if (!ACTUAL_STATUSES.has(status)) continue;
    const month =
      monthFromDate(p.onboard_date) ?? monthFromDate(p.reach_out_date);
    if (!month) continue;
    const campaignId = String(p.campaign_id ?? "").trim();
    if (!campaignId) continue;
    const infId = String(p.inf_id ?? "").trim();
    const tier = creatorTierMap.get(infId) ?? "Unknown";
    const row = getOrCreate(month, campaignId, tier, "");
    const isParent =
      p.deliverable_index == null || Number(p.deliverable_index) === 1;
    if (isParent) row.actualCreators += 1;
    row.actualCost += Number(p.commercial_amount ?? 0);
  }

  // Finalize derived fields on every row.
  const allRows = [...rowMap.values()].map(finalize);

  // Sort rows: month DESC, campaign A→Z, tier order.
  const tierOrder: Record<Tier, number> = {
    Nano: 0,
    Micro: 1,
    "Mid tier": 2,
    Macro: 3,
    Mega: 4,
    Unknown: 5,
  };
  allRows.sort((a, b) => {
    const am = new Date(`${a.month} 01`).getTime();
    const bm = new Date(`${b.month} 01`).getTime();
    if (bm !== am) return bm - am;
    if (a.campaignName !== b.campaignName)
      return a.campaignName.localeCompare(b.campaignName);
    return tierOrder[a.tier] - tierOrder[b.tier];
  });

  // ── Month summary rollup ───────────────────────────────────────────────
  const monthMap = new Map<string, MonthSummaryRow>();
  for (const r of allRows) {
    const m = monthMap.get(r.month) ?? { month: r.month, ...emptyRow() };
    m.budgetCreators += r.budgetCreators;
    m.actualCreators += r.actualCreators;
    m.budgetCost += r.budgetCost;
    m.actualCost += r.actualCost;
    m.totalWithGarments += r.totalWithGarments;
    monthMap.set(r.month, m);
  }
  const monthSummary = [...monthMap.values()].map(finalize);
  monthSummary.sort(
    (a, b) =>
      new Date(`${b.month} 01`).getTime() -
      new Date(`${a.month} 01`).getTime(),
  );

  // ── Tier summary rollup ────────────────────────────────────────────────
  const tierMap = new Map<Tier, TierSummaryRow>();
  for (const r of allRows) {
    const t = tierMap.get(r.tier) ?? { tier: r.tier, ...emptyRow() };
    t.budgetCreators += r.budgetCreators;
    t.actualCreators += r.actualCreators;
    t.budgetCost += r.budgetCost;
    t.actualCost += r.actualCost;
    t.totalWithGarments += r.totalWithGarments;
    tierMap.set(r.tier, t);
  }
  const tierSummary = [...tierMap.values()].map(finalize);
  tierSummary.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

  // ── Campaign Totals (one row per campaign — uses campaigns.total_budget
  //    as authoritative budget so campaigns without per-tier breakdown still
  //    contribute to the KPI strip and alerts) ──────────────────────────────
  const campaignTotalsMap = new Map<string, CampaignTotalsRow>();
  for (const c of campaignsMap.values()) {
    campaignTotalsMap.set(c.campaign_id, {
      campaignId: c.campaign_id,
      campaignName: c.campaign_name,
      campaignNum: c.campaign_num,
      garmentCost: 0,
      ...emptyRow(),
      budgetCost: c.total_budget,
    });
  }
  for (const r of allRows) {
    const t = campaignTotalsMap.get(r.campaignId);
    if (!t) continue;
    t.budgetCreators += r.budgetCreators;
    t.actualCreators += r.actualCreators;
    t.actualCost += r.actualCost;
    t.totalWithGarments += r.totalWithGarments;
    t.garmentCost += r.garmentCost;
    // If campaigns.total_budget was 0/missing, fall back to per-tier sum.
    // We still expose total_with_garments separately for the "incl. garments"
    // KPI line.
    if (t.budgetCost === 0) t.budgetCost += r.budgetCost;
  }
  const campaignTotals = [...campaignTotalsMap.values()].map(finalize);
  campaignTotals.sort((a, b) => (b.budgetCost || 0) - (a.budgetCost || 0));

  // ── KPIs — use campaigns.total_budget as primary budget total ──────────
  const kpis: CostKpis = emptyRow();
  for (const t of campaignTotals) {
    kpis.budgetCreators += t.budgetCreators;
    kpis.actualCreators += t.actualCreators;
    kpis.budgetCost += t.budgetCost;
    kpis.actualCost += t.actualCost;
    kpis.totalWithGarments += t.totalWithGarments;
  }
  finalize(kpis);

  // ── Alerts (top variance risks) ────────────────────────────────────────
  const overBudget = campaignTotals
    .filter((t) => t.variance > 0)
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 5);
  const underUtilised = campaignTotals
    .filter((t) => t.budgetCost > 0 && t.utilPct < 50)
    .sort((a, b) => a.utilPct - b.utilPct)
    .slice(0, 5);

  return {
    kpis,
    months: [...monthSet].sort(
      (a, b) =>
        new Date(`${b} 01`).getTime() - new Date(`${a} 01`).getTime(),
    ),
    monthSummary,
    rows: allRows,
    tierSummary,
    campaignTotals,
    alerts: { overBudget, underUtilised },
  };
}
