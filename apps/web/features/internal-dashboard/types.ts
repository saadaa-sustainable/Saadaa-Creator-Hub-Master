/**
 * Internal Dashboard — same backend response as Funnel View (legacy
 * `getDashboardMetrics`). Adds per-campaign breakdown which legacy renders
 * in its own panel.
 */

import type { FunnelData, FunnelMetrics } from "@/features/funnel/types";

export type { FunnelMetrics } from "@/features/funnel/types";

export interface CampaignBreakdownRow {
  campaign: string;
  metrics: FunnelMetrics;
}

export interface InternalDashboardData extends FunnelData {
  byMonthCampaign: Record<string, Record<string, FunnelMetrics>>;
  byWeekCampaign: Record<string, Record<string, FunnelMetrics>>;
}
