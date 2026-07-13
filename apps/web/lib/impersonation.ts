import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getActor } from "./auth";
import { hasPermission, type ActorPermissions } from "./rbac";
import { createServiceClient } from "./supabase/server";

/**
 * "Act as" (impersonation) — a Global Admin can act as another active team
 * member: My Dashboard shows the member's numbers and every workflow write
 * (reach out logged_by, onboarding onboarded_by, posting posted_by) is
 * attributed to the member. The real admin is recorded in user_audit_log at
 * start/stop.
 *
 * State lives in an httpOnly SESSION cookie holding the target's email —
 * cleared on browser close, on Exit, and ignored entirely for non-admins or
 * inactive targets (stale cookies fail safe to "myself").
 */
export const ACT_AS_COOKIE = "ch-act-as";

export interface ActingAs {
  email: string;
  name: string;
  role: string | null;
}

/**
 * Resolve the impersonation target. Null = acting as yourself.
 * Never trusts the cookie alone: the caller must be a Global Admin and the
 * target must be an active user_access row that isn't the caller.
 */
export const getActingAs = cache(async (): Promise<ActingAs | null> => {
  const actor = await getActor();
  if (!actor) return null;

  const jar = await cookies();
  const target = (jar.get(ACT_AS_COOKIE)?.value ?? "").trim().toLowerCase();
  if (!target || target === (actor.email ?? "").toLowerCase()) return null;
  if (!hasPermission(actor, "admin")) return null;

  const service = createServiceClient();
  const { data } = await (service as any)
    .from("user_access")
    .select("email, name, role, active")
    .eq("email", target)
    .maybeSingle();
  if (!data?.active) return null;

  return {
    email: data.email as string,
    name: (data.name || data.email) as string,
    role: (data.role ?? null) as string | null,
  };
});

/**
 * Attribution identity for workflow writes. When acting-as, the stamped name
 * is the impersonated member (matching how the member's own submits are
 * attributed); otherwise the signed-in actor's display identity.
 */
export async function attributionName(actor: ActorPermissions): Promise<string> {
  const acting = await getActingAs();
  return acting?.name ?? (actor.name || actor.email);
}

/** Active team members a Global Admin can act as (everyone active but them). */
export async function listActingTargets(
  actor: ActorPermissions,
): Promise<ActingAs[]> {
  if (!hasPermission(actor, "admin")) return [];
  const service = createServiceClient();
  const { data } = await (service as any)
    .from("user_access")
    .select("email, name, role, active")
    .eq("active", true)
    .order("name", { ascending: true });
  const self = (actor.email ?? "").toLowerCase();
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => String(r.email ?? "").toLowerCase() !== self)
    .map((r) => ({
      email: String(r.email),
      name: String(r.name || r.email),
      role: (r.role ?? null) as string | null,
    }));
}
