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

export interface ErrorPortalSummary {
  high: number; // critical
  medium: number; // warnings
  low: number; // info
  apiFails: number; // system_errors of type ig_fetch / apify_fail
  missingEmail: number;
}

export interface ErrorPortalData {
  summary: ErrorPortalSummary;
  health: DataHealth;
  violations: AuditViolation[]; // open audit findings
  systemErrors: SystemErrorRow[]; // unresolved rows from system_errors
  missingEmails: MissingEmailRow[];
  lastScannedAt: string;
}
