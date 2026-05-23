/**
 * Payable cycle + due-date helpers — port of legacy
 * InfluencerBackend.js#_nextPayableCycleDate_ and #_paymentDueDays_.
 *
 * Saadaa pays influencers on the 15th and the 30th of each month
 * (per memory `project_payable_cycle_dates`). Configurable here if the
 * cadence ever changes — keep this file as the single source of truth.
 */

export const PAYMENT_DUE_DAYS = 30;
/** Sorted, deduped cycle days within a month (1-30 only — Feb caveat below). */
export const PAYABLE_CYCLE_DAYS = [15, 30] as const;

/**
 * Parse a yyyy-MM-dd ISO date string into a Date at IST midnight.
 * Returns null when input is empty / unparseable.
 */
function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = String(value)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthZeroIdx: number): number {
  return new Date(Date.UTC(year, monthZeroIdx + 1, 0)).getUTCDate();
}

/**
 * Given a due date, return the next cycle pay-out date on/after it as an
 * ISO yyyy-MM-dd string. Mirrors legacy `_nextPayableCycleDate_`.
 *
 * Rules:
 * - If due_day ≤ 15  → cycle = 15th of due month.
 * - If 15 < due_day ≤ 30 → cycle = 30th of due month (clamp to last day for Feb).
 * - If due_day > 30 → cycle = 15th of next month.
 */
export function nextPayableCycleDate(
  due: Date | string | null | undefined,
): string | null {
  const dueDate = due instanceof Date ? due : parseIsoDate(due);
  if (!dueDate) return null;
  const year = dueDate.getUTCFullYear();
  const month = dueDate.getUTCMonth();
  const day = dueDate.getUTCDate();

  for (const cycle of PAYABLE_CYCLE_DAYS) {
    if (day <= cycle) {
      const clamped = Math.min(cycle, lastDayOfMonth(year, month));
      return toIsoDate(new Date(Date.UTC(year, month, clamped)));
    }
  }
  // Past the last cycle in this month — roll to first cycle of next month.
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const first = PAYABLE_CYCLE_DAYS[0];
  const clamped = Math.min(first, lastDayOfMonth(nextYear, nextMonth));
  return toIsoDate(new Date(Date.UTC(nextYear, nextMonth, clamped)));
}

/**
 * Compute due_date for a post that just flipped to Posted.
 * due_date = post_date + PAYMENT_DUE_DAYS (legacy 30-day default).
 */
export function paymentDueDateFor(
  postDate: Date | string | null | undefined,
): string | null {
  const base = postDate instanceof Date ? postDate : parseIsoDate(postDate);
  if (!base) return null;
  const due = new Date(base);
  due.setUTCDate(due.getUTCDate() + PAYMENT_DUE_DAYS);
  return toIsoDate(due);
}

/**
 * Match-status enum (computed live; no DB column).
 * Mirrors legacy submitPayments :9695-9700 + getPaymentLedger :9773-9778.
 */
export type MatchStatus =
  | "Matched with Creator Hub"
  | "Not Matched with Creator Hub"
  | "Unverified";

export function computeMatchStatus(
  entered: number | null | undefined,
  commercial: number | null | undefined,
): MatchStatus {
  const a = Number(entered ?? 0);
  const b = Number(commercial ?? 0);
  if (a <= 0 || b <= 0) return "Unverified";
  return a === b
    ? "Matched with Creator Hub"
    : "Not Matched with Creator Hub";
}

/** Convenience: ISO yyyy-MM-dd of today in IST. */
export function todayIstIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
