import { cache } from "react";
import { createClient, createServiceClient } from "./supabase/server";
import type { UserAccessRow } from "./supabase/types.gen";
import type { ActorPermissions } from "./rbac";

/**
 * Cached per-request lookup of the active user + their user_access row.
 * Safe to call from layouts and pages — React `cache` dedupes within one request.
 *
 * Side effect: bumps `last_login_at` (when null) and `last_active_at` (debounced
 * to once every 5 minutes) on a best-effort background update. Failures are
 * swallowed so they never block authentication.
 */
export const getActor = cache(async (): Promise<ActorPermissions | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data } = await supabase
    .from("user_access")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  const row = data as any;
  if (!row || !row.active) return null;

  // Hydrate the actor's permission scopes from the access_roles +
  // access_role_permissions tables. Falls back gracefully when the migration
  // hasn't applied yet (lookup error → empty array → static-grant fallback
  // kicks in inside hasPermission).
  let permissions: string[] = [];
  try {
    const service = createServiceClient();
    const { data: roleRow } = await (service as any)
      .from("access_roles")
      .select("id")
      .eq("name", row.role)
      .maybeSingle();
    if (roleRow?.id) {
      const { data: perms } = await (service as any)
        .from("access_role_permissions")
        .select("scope, granted")
        .eq("role_id", roleRow.id);
      permissions = ((perms ?? []) as Array<{ scope: string; granted: boolean }>)
        .filter((p) => p.granted)
        .map((p) => p.scope);
    }
  } catch (err) {
    console.warn("[auth] permission hydration failed:", err);
  }

  void touchUserActivity(row).catch((err) => {
    console.warn("[auth] touchUserActivity failed:", err);
  });

  return { ...row, permissions } as ActorPermissions;
});

async function touchUserActivity(row: Record<string, unknown>): Promise<void> {
  const email = String(row.email ?? "").toLowerCase();
  if (!email) return;
  const nowMs = Date.now();
  const lastActiveIso = row.last_active_at as string | null | undefined;
  const lastActiveMs = lastActiveIso ? Date.parse(lastActiveIso) : 0;
  const fiveMinutes = 5 * 60 * 1000;
  const needsBump =
    !row.last_login_at || Number.isNaN(lastActiveMs) || nowMs - lastActiveMs > fiveMinutes;
  if (!needsBump) return;

  const service = createServiceClient();
  const patch: Record<string, unknown> = {
    last_active_at: new Date(nowMs).toISOString(),
  };
  if (!row.last_login_at) {
    patch.last_login_at = patch.last_active_at;
  }
  await (service as any).from("user_access").update(patch).eq("email", email);

  if (!row.last_login_at) {
    await (service as any).from("user_audit_log").insert({
      actor_email: email,
      target_email: email,
      action: "login",
      after_json: { last_login_at: patch.last_active_at },
    });
  }
}

export async function requireActor(): Promise<ActorPermissions> {
  const actor = await getActor();
  if (!actor) throw new Error("Not authenticated or access revoked");
  return actor;
}
