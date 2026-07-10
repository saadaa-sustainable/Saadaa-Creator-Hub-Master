import { parseStoredPartnershipState } from "./partnership";

export interface PaymentEligibilityDeliverable {
  post_link?: string | null;
  post_date?: string | null;
  partnership_status?: string | null;
  /** Timestamp stamped when the creator's partnership was approved (auto-fetch). */
  partnership_approved_at?: string | null;
}

/** A posting form is complete only when both its live URL and post date exist. */
export function postingFormCompleted(
  row: PaymentEligibilityDeliverable,
): boolean {
  return Boolean((row.post_link ?? "").trim() && row.post_date);
}

/**
 * Payment requires the creator's real partnership acceptance:
 *   - the current state is `approved`, OR
 *   - a `partnership_approved_at` timestamp was recorded (the auto-fetched
 *     acceptance) and the creator has not SINCE backed out.
 *
 * A `pending` / `rejected` / `revoked` current state never counts, even with a
 * stale approval timestamp. The admin `ad_partnership_valid` override and bare
 * partnership-key presence are intentionally NOT accepted here (the key is
 * stored at invite time, before acceptance).
 */
export function creatorAcceptedPartnership(
  row: PaymentEligibilityDeliverable,
): boolean {
  const state = parseStoredPartnershipState(row.partnership_status);
  if (state === "pending" || state === "rejected" || state === "revoked") {
    return false;
  }
  return state === "approved" || Boolean(row.partnership_approved_at);
}

/** Saadaa pays per collab, so every deliverable must satisfy both gates. */
export function isCollabPaymentEligible(
  deliverables: readonly PaymentEligibilityDeliverable[],
): boolean {
  return (
    deliverables.length > 0 &&
    deliverables.every(
      (row) => postingFormCompleted(row) && creatorAcceptedPartnership(row),
    )
  );
}

/** Open payment states. Null/blank means the collab is not payment-ready yet. */
export function isPaymentPendingStatus(
  status: string | null | undefined,
): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  return (
    normalized === "not due" || normalized === "due" || normalized === "partial"
  );
}
