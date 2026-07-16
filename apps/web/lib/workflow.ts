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

/**
 * True when a `post_link` value is an actual content URL (Instagram reel/post,
 * YouTube Short, etc.) rather than a status note the sheet parked in the same
 * column. The migrated Influencer Tracker uses LINK TO POST as a free-text
 * cell — most rows hold a URL, but ghosted creators carry the literal word
 * "Ghosted" and some rows hold notes ("not picking up…", "Story posted"). A
 * bare non-URL string is NOT a post: counting it inflates "posted" and steals
 * from the GHOSTED bucket. Accept http(s) links and scheme-less
 * instagram.com/youtube URLs; reject everything else. NULL-safe.
 */
export function isContentLink(link: string | null | undefined): boolean {
  if (typeof link !== "string") return false;
  return /(?:https?:\/\/|(?:www\.)?(?:instagram\.com|youtube\.com|youtu\.be))/i.test(
    link.trim(),
  );
}

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
export const OVERDUE_FALLBACK_DAYS = 15;
const DAY_MS = 86_400_000;

/**
 * Overdue anchor rule (2026-07-16): a collab counts overdue only when its
 * PROMISED date has passed — est_delivery when one was set (overdue from the
 * day AFTER it), else the legacy >15-days-since-reach-out fallback for rows
 * that never recorded an est date. Callers must already have excluded
 * posted/ghosted rows. Shared by the Funnel/Internal tiles, the rows-drawer
 * Overdue chip, and the Onboarding/Posting stage KPIs — keep them identical.
 */
export function isPastDue(
  estDelivery: unknown,
  reachOut: unknown,
  now: number = Date.now(),
): boolean {
  const est = estDelivery ? new Date(String(estDelivery)).getTime() : NaN;
  if (!Number.isNaN(est)) return now >= est + DAY_MS;
  const reach = reachOut ? new Date(String(reachOut)).getTime() : NaN;
  if (Number.isNaN(reach)) return false;
  return (now - reach) / DAY_MS > OVERDUE_FALLBACK_DAYS;
}

export function isOnboardedActive(status: string | null | undefined): boolean {
  return (
    status === "On Board" ||
    status === "Order Sent" ||
    status === "Posted" ||
    status === "Delivered"
  );
}
