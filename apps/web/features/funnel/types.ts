/**
 * Funnel View — mirrors legacy `getDashboardMetrics` schema 1:1
 * (legacy-gas/InfluencerBackend.js:11588-11919).
 *
 * 8 metrics per period bucket:
 *  r        — rows with reach_out_date in period
 *  o        — onboarded (workflow_status moved past "Reach Out")
 *  b        — barter (collab_type === "Barter")
 *  d        — delivered (order_status === "Delivered")
 *  p        — posted (post_date in period — DIFFERENT bucket than r/o)
 *  g        — ghosted (workflow_status.includes("ghost"))
 *  pend     — onboarded && !posted && !ghosted
 *  overdue  — pend && (today - reach_out_date) > 15 days
 *
 * Dual-bucketing rule: reach-out cohort metrics bucket by reach_out_date,
 * post metric (p) buckets by post_date — they may land in different periods.
 */

export interface FunnelMetrics {
  r: number;
  o: number;
  b: number;
  d: number;
  p: number;
  g: number;
  pend: number;
  overdue: number;
}

export type FunnelPeriodMode = "month" | "week";

export interface FunnelPeriodBucket {
  key: string; // "May 2026" or "2026-W21"
  label: string; // display label
  metrics: FunnelMetrics;
}

export interface FunnelData {
  totals: FunnelMetrics;
  byMonth: FunnelPeriodBucket[]; // sorted DESC (most recent first)
  byWeek: FunnelPeriodBucket[]; // sorted DESC
  teams: string[]; // distinct lifecycle owners across logged/onboarded/posted_by
  byMonthTeam: Record<string, Record<string, FunnelMetrics>>;
  byWeekTeam: Record<string, Record<string, FunnelMetrics>>;
  generatedAt: string;
}

export interface FunnelFilters {
  period?: FunnelPeriodMode;
  team?: string;
}
