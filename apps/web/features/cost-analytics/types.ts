/**
 * Cost Analytics — mirrors legacy `getBudgetVsActuals` schema 1:1
 * (legacy-gas/InfluencerBackend.js:11938-12177). Budget from new
 * `campaign_budget` Supabase table (replaces external Tracker spreadsheet),
 * actuals from `posts.commercial_amount` per (month, campaign, tier).
 */

export type Tier = "Nano" | "Micro" | "Mid tier" | "Macro" | "Mega" | "Unknown";

export interface CostRowBase {
  budgetCreators: number;
  actualCreators: number;
  budgetCost: number;
  actualCost: number;
  totalWithGarments: number;
  variance: number; // actual - budget (positive = over budget)
  utilPct: number; // round(actual / budget * 100)
}

export interface CostBreakdownRow extends CostRowBase {
  month: string;
  campaignId: string;
  campaignName: string;
  tier: Tier;
  collabType: string;
  garmentCost: number; // total_with_garments - budgetCost
}

/** One budget version inside a campaign's expandable division. */
export interface CampaignVersionRow {
  versionNumber: number;
  kind: "initial" | "carry_forward" | "top_up";
  /** Short month label, matching the table months (e.g. "Jul 2026"). */
  month: string;
  amount: number;
  status: string;
  /** Expected charged against this version's month (null while pending). */
  expectedAgainst: number | null;
  remaining: number | null;
  note: string | null;
  gapReason: string | null;
}

export interface CampaignTotalsRow extends CostRowBase {
  campaignId: string;
  campaignName: string;
  campaignNum: number | null;
  garmentCost: number;
  /** The campaign's V0/V1/V2… chain — powers the version-level division. */
  versions?: CampaignVersionRow[];
}

export interface MonthSummaryRow extends CostRowBase {
  month: string;
}

export interface TierSummaryRow extends CostRowBase {
  tier: Tier;
}

export interface CostKpis extends CostRowBase {}

export interface CostAnalyticsData {
  kpis: CostKpis;
  months: string[]; // sorted DESC by date
  monthSummary: MonthSummaryRow[];
  rows: CostBreakdownRow[]; // full per-campaign-tier-month rows
  tierSummary: TierSummaryRow[];
  campaignTotals: CampaignTotalsRow[]; // per-campaign rollup (uses campaigns.total_budget)
  alerts: {
    overBudget: CampaignTotalsRow[]; // top campaigns where actual > budget
    underUtilised: CampaignTotalsRow[]; // top campaigns at <50% utilisation
  };
}
