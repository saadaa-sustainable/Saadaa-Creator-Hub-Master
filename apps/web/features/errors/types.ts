/**
 * Error Portal — mirrors legacy `runErrorAudit` + `system_errors` table.
 *
 * Sources:
 *  - Live audit over posts/payments/creators/shopify_orders (5 rule violations).
 *  - system_errors table (logSystemError_ sink) for runtime failures.
 *  - posts query for missing collab emails.
 */

export type ErrorSeverity = "HIGH" | "MEDIUM" | "LOW";

export type AuditType =
  | "INVALID_POST_ID"
  | "DUPLICATE_UTR"
  | "PAYMENT_BEFORE_POSTING"
  | "MISSING_BANK_DETAILS"
  | "MISSING_TRACKING";

export interface AuditViolation {
  type: AuditType;
  severity: ErrorSeverity;
  details: string;
  key?: string | null; // identifying post/payment id
}

export interface SystemErrorRow {
  id: number;
  type: string;
  key: string | null;
  message: string;
  source: string | null;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface MissingEmailRow {
  post_id: string;
  inf_id: string | null;
  /** Stamped collab_id, or fallback inf_id||'-C'||collab_number for legacy rows. */
  collab_id: string | null;
  inf_name: string | null;
  username: string | null;
  campaign_id: string | null;
  workflow_status: string;
  onboard_date: string | null;
}

/**
 * A collab email the send gate refused to send (missing brief / T&C / CC) or
 * that failed at SMTP. Sourced from `system_errors` type
 * `collab_email_blocked` / `collab_email_send_failed`, enriched from posts.
 * `post_id` drives the Error Portal "Send again" retry.
 */
export interface BlockedEmailRow {
  post_id: string;
  collab_id: string | null;
  inf_name: string | null;
  username: string | null;
  campaign_id: string | null;
  workflow_status: string | null;
  /** The reason the send was blocked / failed (system_errors.message). */
  reason: string;
  /** system_errors row kind — distinguishes a hard block from an SMTP failure. */
  kind: "blocked" | "send_failed";
  created_at: string;
}

export interface DataHealth {
  reachOut: number;
  onBoard: number;
  posted: number;
  delivered: number;
  missingBank: number;
  missingEmail: number;
  missingTracking: number;
  missingOrder: number;
  missingPostLink: number;
  paymentsDue: number;
  totalPaidOut: number;
  totalCreators: number;
}

export interface GarmentFlagRow {
  id: string;
  postId: string | null;
  message: string;
  createdAt: string | null;
  username: string | null;
  infName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  orderId: string | null;
  garmentQty: number | null;
  maxAllowed: number | null;
}

export interface ErrorPortalSummary {
  high: number; // critical
  medium: number; // warnings
  low: number; // info
  apiFails: number; // system_errors of type ig_fetch / apify_fail
  missingEmail: number;
  // Reach Out Meta lookup issues, split so the team can triage each separately:
  metaFetchFails: number; // API itself failed (rate-limit / network / token) — type meta_fetch_failed
  metaProfileUnavailable: number; // API worked but the profile is unavailable (personal/dead/deactivated) — type meta_profile_unavailable
  blockedEmails: number; // collab emails blocked/failed the gate — retry from portal
  garmentFlags: number; // orders exceeding the campaign's max garment quantity
}

export interface ErrorPortalData {
  summary: ErrorPortalSummary;
  health: DataHealth;
  violations: AuditViolation[]; // open audit findings
  systemErrors: SystemErrorRow[]; // unresolved rows from system_errors
  missingEmails: MissingEmailRow[];
  blockedEmails: BlockedEmailRow[]; // gate-blocked / SMTP-failed collab emails
  garmentFlags: GarmentFlagRow[]; // garment_limit_exceeded, enriched from posts
  lastScannedAt: string;
}
