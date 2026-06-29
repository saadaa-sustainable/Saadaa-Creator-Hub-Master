/**
 * Audit Log — a unified, read-only activity stream over CreatorHub's existing
 * audit tables (no new schema). Layout ported from the DAM project's Audit Log;
 * data + palette are CreatorHub's.
 *
 * Sources:
 *   • Sheet  — Sheet View cell edits, comments, row deletions/restores
 *   • User   — user / access / role changes (user_audit_log)
 *   • System — System Error Log entries (system_errors)
 *
 * (When the Approvals page ships, an `Approval` source over approval_logs is
 *  added here too.)
 */

export type AuditSource = "Sheet" | "User" | "System" | "Approval";

/** Drives the small coloured icon on the action line. */
export type AuditTone = "create" | "delete" | "change" | "resolve" | "neutral";

export interface AuditEntry {
  id: string;
  source: AuditSource;
  at: string | null; // ISO timestamp
  actor: string; // who did it (email / name)
  action: string; // human action label
  target: string; // what it touched (table · key)
  detail: string; // change summary / message
  tone: AuditTone;
}

export interface AuditLogData {
  entries: AuditEntry[]; // newest first
  counts: Record<AuditSource, number>;
  total: number;
}
