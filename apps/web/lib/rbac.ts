import type { UserAccessRow } from "./supabase/types.gen";

/**
 * Pure permission map. Safe to import from client components (no server-only
 * dependencies). The server-side `assertPermission` lives in `rbac.server.ts`.
 */

export type PermissionKey =
  | "campaign_create"
  | "reachout_outbound"
  | "reachout_inbound"
  | "onboarding_write"
  | "posting_submit"
  | "accounts_write"
  | "performance_view"
  | "admin";

const ADMIN_EMAILS = new Set([
  "devesh@saadaa.in",
  "mahesh@saadaa.in",
  "tanvi@saadaa.in",
  "shrishti@saadaa.in",
]);

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.has(email.toLowerCase());
}

function normalizeRole(
  role: string | null | undefined,
): "Global Admin" | "User" | "Accounts Team" {
  const r = (role ?? "").toLowerCase();
  if (["global admin", "owner level", "owner", "admin"].includes(r))
    return "Global Admin";
  if (r === "accounts team") return "Accounts Team";
  return "User";
}

export function hasPermission(
  actor: UserAccessRow,
  key: PermissionKey,
): boolean {
  const role = normalizeRole(actor.role);
  const admin = isAdminEmail(actor.email) && role !== "Accounts Team";

  switch (key) {
    case "admin":
      return admin || role === "Global Admin";
    case "accounts_write":
      return admin || role === "Global Admin" || role === "Accounts Team";
    case "campaign_create":
    case "reachout_outbound":
    case "reachout_inbound":
    case "onboarding_write":
    case "posting_submit":
    case "performance_view":
      return role !== "Accounts Team";
    default:
      return false;
  }
}
