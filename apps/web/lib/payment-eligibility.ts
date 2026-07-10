import { parseStoredPartnershipState } from "./partnership";

export interface PaymentEligibilityDeliverable {
  post_link?: string | null;
  post_date?: string | null;
  partnership_status?: string | null;
}

/** A posting form is complete only when both its live URL and post date exist. */
export function postingFormCompleted(
  row: PaymentEligibilityDeliverable,
): boolean {
  return Boolean((row.post_link ?? "").trim() && row.post_date);
}

/**
 * Payment requires the creator's real partnership acceptance. An admin key or
 * ad_partnership_valid override is intentionally not accepted by this gate.
 */
export function creatorAcceptedPartnership(
  row: PaymentEligibilityDeliverable,
): boolean {
  return parseStoredPartnershipState(row.partnership_status) === "approved";
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
