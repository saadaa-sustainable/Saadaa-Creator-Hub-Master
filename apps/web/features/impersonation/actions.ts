"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { createServiceClient } from "@/lib/supabase/server";
import { ACT_AS_COOKIE } from "@/lib/impersonation";

type ActResult = { success: boolean; error?: string; name?: string };

/**
 * Start acting as another team member (Global Admin only). Validates the
 * target server-side — the client's member list is never trusted — then sets
 * the session cookie and writes an audit trail entry as the REAL admin.
 */
export async function startActingAs(email: string): Promise<ActResult> {
  const actor = await requireActor();
  if (!hasPermission(actor, "admin")) {
    return {
      success: false,
      error: "Only Global Admins can act as a team member.",
    };
  }

  const target = (email ?? "").trim().toLowerCase();
  if (!target) return { success: false, error: "Pick a team member." };
  if (target === (actor.email ?? "").toLowerCase()) {
    return stopActingAs();
  }

  const service = createServiceClient();
  const { data } = await (service as any)
    .from("user_access")
    .select("email, name, role, active")
    .eq("email", target)
    .maybeSingle();
  if (!data?.active) {
    return { success: false, error: "Team member not found or inactive." };
  }

  const jar = await cookies();
  // Session cookie (no maxAge) — impersonation never survives a closed browser.
  jar.set(ACT_AS_COOKIE, target, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  await (service as any).from("user_audit_log").insert({
    actor_email: (actor.email ?? "").toLowerCase(),
    target_email: target,
    action: "act_as_start",
    after_json: { acting_as: data.name || data.email },
  });

  revalidatePath("/", "layout");
  return { success: true, name: (data.name || data.email) as string };
}

/** Stop acting as a team member — back to yourself. */
export async function stopActingAs(): Promise<ActResult> {
  const actor = await requireActor();

  const jar = await cookies();
  const target = (jar.get(ACT_AS_COOKIE)?.value ?? "").trim().toLowerCase();
  jar.delete(ACT_AS_COOKIE);

  if (target) {
    const service = createServiceClient();
    await (service as any).from("user_audit_log").insert({
      actor_email: (actor.email ?? "").toLowerCase(),
      target_email: target,
      action: "act_as_stop",
    });
  }

  revalidatePath("/", "layout");
  return { success: true };
}
