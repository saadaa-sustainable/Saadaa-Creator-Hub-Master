/**
 * User Panel — mirrors legacy `getUserPanelData / saveUserAccess /
 * deleteUserAccess` working against the `user_access` table, plus the
 * enterprise upgrades shipped 2026-05-27 (audit log, last active, invited
 * metadata, activity sparkline).
 */

export type AccessRole = "Global Admin" | "User" | "Accounts Team";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
  last_active_at: string | null;
  invited_by: string | null;
  invited_at: string | null;
  notes: string | null;
  /** Calendar dates (yyyy-MM-dd) the user touched anything in the last 30 days. */
  activity_days?: string[];
  /** Aggregate touch count over the last 30 days. */
  activity_count?: number;
}

export interface UserPanelKpis {
  total: number;
  active: number;
  admins: number;
  accounts: number;
  pendingInvites: number;
  lastActiveToday: number;
}

export interface UserPanelData {
  users: UserRow[];
  kpis: UserPanelKpis;
}

export interface UserFormPayload {
  email: string;
  name: string;
  role: AccessRole;
  active: boolean;
  notes?: string;
}

export interface AccessRoleSummary {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  color: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  granted_count: number;
  user_count: number;
  scopes: string[]; // granted permission scopes
}

export interface AccessRoleFormPayload {
  id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  scopes: string[]; // granted scopes
}

export interface UserAuditEvent {
  id: number;
  actor_email: string;
  target_email: string;
  action:
    | "invite"
    | "edit"
    | "role_change"
    | "activate"
    | "deactivate"
    | "delete"
    | "login"
    | "csv_invite_batch";
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
}
