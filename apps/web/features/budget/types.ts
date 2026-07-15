import type {
  BudgetVersion,
  VersionKind,
  VersionStatus,
} from "@/lib/budget-versions";

export type { BudgetVersion, VersionKind, VersionStatus };

/** A campaign_budget tier line attached to a version (V0 + approved top-ups). */
export interface TierLine {
  id: number;
  tier: string | null;
  collab_type: string | null;
  num_influencers: number | null;
  avg_comp: number | null;
  total_cost: number | null;
  min_garments: number | null;
  max_garments: number | null;
  est_garment_cost: number | null;
  total_with_garments: number | null;
}

export interface BudgetVersionRow extends BudgetVersion {
  campaignName: string | null;
  /** Tier lines funded by this version (may be empty for carry-forwards). */
  tierLines: TierLine[];
  /** Pending top-ups carry their draft lines in `lines` jsonb. */
  draftLines: TierLine[];
}

/** One campaign inside one month — versions + the month's money math. */
export interface CampaignMonthGroup {
  campaignId: string;
  campaignName: string | null;
  versions: BudgetVersionRow[];
  /** Σ approved/closed version amounts this month. */
  allocated: number;
  /** Expected spend committed by this month's onboardings. */
  utilized: number;
  remaining: number;
  overBudget: boolean;
  pendingAmount: number;
}

export interface BudgetMonth {
  key: string; // YYYY-MM-01
  label: string; // "July 2026"
  groups: CampaignMonthGroup[];
  kpi: {
    allocated: number;
    utilized: number;
    remaining: number;
    pendingAmount: number;
    pendingCount: number;
  };
}

export interface BudgetPageData {
  months: BudgetMonth[];
  /** Newest month first — the default selected tab. */
  defaultMonth: string | null;
}
