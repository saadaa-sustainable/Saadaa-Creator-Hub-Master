import { isVoidedStatus } from "@/lib/workflow";

export interface ReachoutEligibilityRow {
  id: number;
  workflow_status: string | null;
  reach_out_date: string | null;
  campaign_id: string | null;
}

export function reachoutConflict(
  rows: ReachoutEligibilityRow[],
  campaignId: string,
  since: string,
  excludedRowIds: number[] = [],
): "same-campaign" | "cooldown" | null {
  const excluded = new Set(excludedRowIds);
  const active = rows.filter(
    (row) =>
      !excluded.has(row.id) &&
      String(row.workflow_status ?? "") !== "Cancelled" &&
      !isVoidedStatus(row.workflow_status),
  );
  if (active.some((row) => row.campaign_id === campaignId)) {
    return "same-campaign";
  }
  return active.some(
    (row) => row.reach_out_date != null && row.reach_out_date >= since,
  )
    ? "cooldown"
    : null;
}
