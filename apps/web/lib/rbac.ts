import type { UserAccessRow } from "./supabase/types.gen";

/**
 * Pure permission map. Safe to import from client components (no server-only
 * dependencies). Server-side dynamic permission resolution against the
 * `access_roles` table lives in `rbac.server.ts`.
 *
 * As of 2026-05-27 roles + permissions are stored in `access_roles` +
 * `access_role_permissions`. This file keeps a static fallback so we still
 * return sensible answers when the actor object hasn't been hydrated with
 * its DB-derived scopes (e.g. unit tests, edge cases during migration).
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

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  admin: "Full administrative access — invite users, manage roles, edit everything",
  campaign_create: "Create + edit Campaigns",
  reachout_outbound: "Submit Outbound Reach Out form",
  reachout_inbound: "Submit Inbound Reach Out batch + CSV",
  onboarding_write: "Submit onboarding form + create Shopify order",
  posting_submit: "Mark a collab as Posted",
  accounts_write: "Log payments + edit Accounts Hub records",
  performance_view: "Read access to Cost Analytics, Compliance, Funnel, Internal Dashboard",
};

export const PERMISSION_KEYS: PermissionKey[] = Object.keys(
  PERMISSION_DESCRIPTIONS,
) as PermissionKey[];

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
): "Global Admin" | "User" | "Accounts Team" | "custom" {
  const r = (role ?? "").toLowerCase();
  if (["global admin", "owner level", "owner", "admin"].includes(r))
    return "Global Admin";
  if (r === "accounts team") return "Accounts Team";
  if (r === "user" || r === "team" || r === "member") return "User";
  return "custom";
}

const STATIC_GRANTS: Record<
  "Global Admin" | "User" | "Accounts Team",
  ReadonlySet<PermissionKey>
> = {
  "Global Admin": new Set<PermissionKey>([
    "admin",
    "campaign_create",
    "reachout_outbound",
    "reachout_inbound",
    "onboarding_write",
    "posting_submit",
    "accounts_write",
    "performance_view",
  ]),
  User: new Set<PermissionKey>([
    "campaign_create",
    "reachout_outbound",
    "reachout_inbound",
    "onboarding_write",
    "posting_submit",
    "performance_view",
  ]),
  "Accounts Team": new Set<PermissionKey>([
    "accounts_write",
    "performance_view",
  ]),
};

/**
 * Actor extended with the per-request resolved permission scopes (populated
 * by `getActor` against the DB). When `permissions` is present we trust the
 * DB; otherwise fall back to the static role map.
 */
export type ActorPermissions = UserAccessRow & {
  permissions?: string[];
};

export function hasPermission(
  actor: ActorPermissions,
  key: PermissionKey,
): boolean {
  if (actor.permissions && actor.permissions.length > 0) {
    if (actor.permissions.includes(key)) return true;
    if (actor.permissions.includes("admin") && key !== "admin") return true;
    return false;
  }

  // Fallback path — preserves prior behaviour for any code path that hasn't
  // hydrated permissions yet (legacy tests, transient states during migration).
  const role = normalizeRole(actor.role);
  if (role === "custom") return false; // unknown custom role w/o hydration -> deny
  const grants = STATIC_GRANTS[role];
  if (grants.has(key)) return true;
  return isAdminEmail(actor.email) && role === "Global Admin";
}
