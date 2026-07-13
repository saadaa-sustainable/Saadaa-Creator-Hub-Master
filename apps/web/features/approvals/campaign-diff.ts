/**
 * Campaign-edit before/after diff builder — shared by the pending-card query
 * (features/approvals/queries.ts) and the history detail action
 * (features/approvals/actions.ts).
 *
 * request_payload is FLAT camelCase (campaignEditRequestPayload). before_payload
 * is the NESTED snapshot `{ campaign: <snake_case campaigns row>, budgetRows }`
 * (features/campaigns/actions.ts editCampaign) — so a payload key's before
 * value lives at before_payload.campaign.<column>. Flat before keys are also
 * honoured in case a future writer stores the snapshot flat.
 */

export interface CampaignChange {
  label: string;
  before: string | null;
  after: string;
}

export const CAMPAIGN_PAYLOAD_LABELS: Record<string, string> = {
  campaignName: "Campaign Name",
  keyMessage: "Key Message",
  totalBudget: "Total Budget (₹)",
  numCreators: "No. of Creators",
  startDate: "Start Date",
  endDate: "End Date",
  briefLink: "Brief Link",
  internalBrief: "Internal Brief Link",
  internalBriefLink: "Internal Brief Link",
  status: "Status",
};

const CAMPAIGN_BEFORE_COLUMNS: Record<string, string> = {
  campaignName: "campaign_name",
  keyMessage: "key_message",
  totalBudget: "total_budget",
  numCreators: "no_of_creators",
  startDate: "start_date",
  endDate: "end_date",
  briefLink: "brief_link",
  internalBrief: "internal_brief_link",
  internalBriefLink: "internal_brief_link",
  status: "status",
};

function campaignBeforeValue(
  beforePayload: Record<string, unknown>,
  key: string,
): string | null {
  const flat = beforePayload[key];
  if (flat != null && typeof flat !== "object") return String(flat);
  const row = beforePayload.campaign;
  if (row && typeof row === "object") {
    const col = CAMPAIGN_BEFORE_COLUMNS[key];
    const v = col ? (row as Record<string, unknown>)[col] : undefined;
    if (v != null && typeof v !== "object") return String(v);
  }
  return null;
}

/** Changed fields only (when a before snapshot exists); scalars only. */
export function buildCampaignChanges(
  payload: Record<string, unknown>,
  beforePayload: Record<string, unknown>,
): CampaignChange[] {
  return (
    Object.entries(payload)
      // Scalars only — budgetRows (array) can't render in a before/after row.
      .filter(
        ([, v]) =>
          v != null && typeof v !== "object" && String(v).trim() !== "",
      )
      .map(([k, v]) => ({
        label: CAMPAIGN_PAYLOAD_LABELS[k] ?? k,
        before: campaignBeforeValue(beforePayload, k),
        after: String(v),
      }))
      // Show only real differences when a before snapshot exists.
      .filter((c) => c.before == null || c.before !== c.after)
  );
}
