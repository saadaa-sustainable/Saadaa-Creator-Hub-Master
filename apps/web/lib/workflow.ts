/**
 * Workflow-status helpers shared across views.
 *
 * A collab moved to Offboarding is VOIDED — we are not continuing with the
 * creator for that collab. A voided collab must disappear from every
 * operational + analytics surface (boards, kanban cards, dashboards, the
 * Accounts Hub due list) so its leftover balance can never be paid. It stays
 * visible ONLY in the Offboarding stage itself and in the raw Sheet View.
 *
 * `Offboarding` is kept alongside `Offboarded` for transition safety (an older
 * label that may still exist on legacy rows).
 */
export const VOIDED_STATUSES = ["Offboarded", "Offboarding"] as const;

/** True when a workflow_status marks a voided (offboarded) collab. NULL-safe. */
export function isVoidedStatus(status: string | null | undefined): boolean {
  return status === "Offboarded" || status === "Offboarding";
}

/**
 * Drop voided rows from a list of records carrying a `workflow_status`. NULL /
 * undefined statuses are kept (a blank status is an active Reach Out row).
 */
export function excludeVoided<T extends { workflow_status?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((r) => !isVoidedStatus(r.workflow_status));
}

/**
 * Statuses that count as "onboarded and still active" — a creator who has been
 * onboarded for a campaign and has NOT been voided/offboarded or cancelled.
 * This is the set the campaign creator-cap counts against (cap = onboarding
 * cap, 2026-06-10): reach-out is unlimited, but only `cap` creators can be
 * onboarded. A creator leaving this set (e.g. offboarded → voided) frees a slot
 * so a pending reach-out can be onboarded in their place.
 */
export const ONBOARDED_ACTIVE_STATUSES = [
  "On Board",
  "Order Sent",
  "Posted",
  "Delivered",
] as const;

/** True when a workflow_status counts toward the campaign onboarding cap. */
export function isOnboardedActive(status: string | null | undefined): boolean {
  return (
    status === "On Board" ||
    status === "Order Sent" ||
    status === "Posted" ||
    status === "Delivered"
  );
}
