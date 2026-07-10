import { z } from "zod";

export const OFFBOARDING_PENDING_STATUSES = ["On Board", "Order Sent"] as const;
export const OFFBOARDING_REASON_MIN = 10;
export const OFFBOARDING_REASON_MAX = 1000;

export const OffboardCreatorSchema = z.object({
  infId: z.string().trim().min(1, "Creator ID is required"),
  reason: z
    .string()
    .trim()
    .min(
      OFFBOARDING_REASON_MIN,
      `Add a clear reason with at least ${OFFBOARDING_REASON_MIN} characters`,
    )
    .max(
      OFFBOARDING_REASON_MAX,
      `Reason must be ${OFFBOARDING_REASON_MAX.toLocaleString("en-IN")} characters or less`,
    ),
});

export function todayIsoInIndia(now = new Date()): string {
  return now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

export function daysOverdue(deadline: string | null, today: string): number {
  if (!deadline) return 0;
  const dueMs = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(dueMs) || !Number.isFinite(todayMs)) return 0;
  return Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000));
}

export function isOffboardingCandidateRow(
  row: { workflow_status?: unknown; est_delivery?: unknown },
  today: string,
): boolean {
  const status = String(row.workflow_status ?? "").trim();
  const deadline = String(row.est_delivery ?? "").slice(0, 10);
  return (
    OFFBOARDING_PENDING_STATUSES.some((pending) => pending === status) &&
    /^\d{4}-\d{2}-\d{2}$/.test(deadline) &&
    deadline < today
  );
}
