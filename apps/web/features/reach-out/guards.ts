import "server-only";
import { isVoidedStatus } from "@/lib/workflow";

/**
 * A prior reach-out only blocks if it is still ACTIVE. Cancelled or
 * voided/Offboarded collabs are dead — they free the creator for
 * re-engagement (same as today's campaign guard: voiding frees the slot).
 */
function isActiveReachout(status: string | null): boolean {
  return String(status ?? "") !== "Cancelled" && !isVoidedStatus(status);
}

/** Reach-out cooldown: at most one active reach-out per creator per N days. */
export const REACHOUT_COOLDOWN_DAYS = 30;

export type ReachoutBlock = {
  /** User-facing sentence for the toast / row failure. */
  error: string;
  /** Short field-error label (shown under the Instagram link input). */
  hint: string;
};

/**
 * Reach-Out eligibility (2026-07-08). Replaces the old "existing creator →
 * Onboarding only" hard block: an existing creator CAN now be reached out again
 * (`submit_reachout` reuses their SIF), subject to two rules —
 *   • Cooldown  — at most one ACTIVE reach-out per creator per rolling
 *                 {@link REACHOUT_COOLDOWN_DAYS} days (across ALL campaigns).
 *   • Campaign  — never a second ACTIVE reach-out for the SAME campaign; the
 *                 creator is free to map to a different campaign next cycle.
 * Cancelled/voided reach-outs are ignored by both. Matches by handle (the key
 * `submit_reachout` resolves the creator on). Returns a {@link ReachoutBlock}
 * describing why it is blocked, or `null` when the reach-out is allowed.
 */
export async function checkReachoutAllowed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  username: string,
  campaignId: string,
): Promise<ReachoutBlock | null> {
  const since = new Date(Date.now() - REACHOUT_COOLDOWN_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // One read covers both rules: rows in THIS campaign (any date) OR any campaign
  // within the cooldown window. `username ilike X AND (same-campaign OR recent)`.
  const { data } = await supabase
    .from("posts")
    .select("workflow_status, reach_out_date, campaign_id")
    .ilike("username", username)
    .or(`campaign_id.eq.${campaignId},reach_out_date.gte.${since}`)
    .limit(50);
  const rows = (data ?? []) as Array<{
    workflow_status: string | null;
    reach_out_date: string | null;
    campaign_id: string | null;
  }>;

  // Campaign rule — already mapped to this campaign (active).
  if (
    rows.some(
      (p) => p.campaign_id === campaignId && isActiveReachout(p.workflow_status),
    )
  ) {
    return {
      error: "This creator is already in this campaign.",
      hint: "Already reached out in this campaign",
    };
  }

  // Cooldown rule — reached out (any campaign) within the last N days.
  if (
    rows.some(
      (p) =>
        isActiveReachout(p.workflow_status) &&
        p.reach_out_date != null &&
        p.reach_out_date >= since,
    )
  ) {
    return {
      error: `This creator was reached out in the last ${REACHOUT_COOLDOWN_DAYS} days. One reach-out per creator per ${REACHOUT_COOLDOWN_DAYS} days — wait out the cooldown, or map them to a different campaign next cycle.`,
      hint: `Reached out in the last ${REACHOUT_COOLDOWN_DAYS} days`,
    };
  }

  return null;
}
