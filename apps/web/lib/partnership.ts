/**
 * Partnership (Meta branded-content ad permission) — client-safe shared bits.
 *
 * The Meta permission is PER-CREATOR (account-level): one record per creator
 * under the Saadaa brand IGBA. `posts.partnership_status` mirrors the
 * normalized state onto every deliverable row of that creator so gates and
 * badges can read it without a live Meta call.
 *
 * Server-side fetch/send lives in lib/meta-partnership.ts (server-only);
 * DB stamping in lib/partnership-sync.ts.
 */

export type PartnershipState =
  | "approved"
  | "pending"
  | "rejected"
  | "revoked"
  | "none"
  | "unknown";

/** Map Meta's permission_status text → our normalized state.
 *
 * ORDER MATTERS: "Pending Approval" contains the substring "approv", so the
 * pending / rejected / revoked checks MUST run before the approved check —
 * otherwise a still-pending invite (request sent, awaiting creator) is
 * mis-read as "approved". Meta values: Approved / Pending Approval /
 * Rejected / Revoked ("Canceled" = the creator declined the request). */
export function toPartnershipState(
  raw: string | null | undefined,
): PartnershipState {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "none";
  if (s.includes("pending")) return "pending";
  if (s.includes("reject") || s.includes("declin") || s.includes("cancel"))
    return "rejected";
  if (s.includes("revok")) return "revoked";
  if (s.includes("approv")) return "approved";
  return "unknown";
}

/** Parse a stored posts.partnership_status value (already normalized, but
 * tolerate raw Meta strings from any manual backfill). Null → null. */
export function parseStoredPartnershipState(
  v: string | null | undefined,
): PartnershipState | null {
  if (v == null || String(v).trim() === "") return null;
  return toPartnershipState(v);
}

/** User-facing labels — keep identical on every surface (no internal jargon). */
export const PARTNERSHIP_STATE_LABELS: Record<PartnershipState, string> = {
  approved: "Partnership approved",
  pending: "Partnership invite pending",
  rejected: "Rejected by the creator — can resend",
  revoked: "Revoked by the creator — can resend",
  none: "No partnership yet",
  unknown: "Partnership status unavailable",
};

/**
 * Payment / ads gate — a deliverable's partnership counts as valid ONLY when
 * the creator has APPROVED the request (or an admin explicitly validated via
 * the inline Partnership Key override, which sets ad_partnership_valid).
 * A pending invite or a bare partnership_id no longer passes — the invite is
 * auto-sent at posting time, so key presence stopped meaning "approved".
 */
export function partnershipApproved(row: {
  partnership_status?: string | null;
  ad_partnership_valid?: boolean | null;
}): boolean {
  return (
    parseStoredPartnershipState(row.partnership_status) === "approved" ||
    row.ad_partnership_valid === true
  );
}
