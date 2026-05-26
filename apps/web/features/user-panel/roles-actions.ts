"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { PERMISSION_KEYS } from "@/lib/rbac";
import type { AccessRoleFormPayload, AccessRoleSummary } from "./types";

const VALID_SCOPES = new Set(PERMISSION_KEYS as string[]);
const SYSTEM_ROLE_NAMES = new Set(["Global Admin", "User", "Accounts Team"]);

export async function listRoles(): Promise<AccessRoleSummary[]> {
  await assertPermission("admin");
  const supabase = createServiceClient();

  const { data: summaries, error } = await (supabase as any)
    .from("access_role_summary")
    .select("*")
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("[roles] listRoles summary failed:", error);
    return [];
  }

  const rows = (summaries ?? []) as Array<Omit<AccessRoleSummary, "scopes">>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: perms } = await (supabase as any)
    .from("access_role_permissions")
    .select("role_id, scope, granted")
    .in("role_id", ids);

  const scopesByRole = new Map<string, string[]>();
  for (const p of (perms ?? []) as Array<{
    role_id: string;
    scope: string;
    granted: boolean;
  }>) {
    if (!p.granted) continue;
    if (!scopesByRole.has(p.role_id)) scopesByRole.set(p.role_id, []);
    scopesByRole.get(p.role_id)!.push(p.scope);
  }

  return rows.map((r) => ({
    ...r,
    scopes: scopesByRole.get(r.id) ?? [],
  }));
}

function normalizeScopes(input: string[]): string[] {
  return Array.from(
    new Set(
      input
        .map((s) => (s ?? "").trim())
        .filter((s) => s.length > 0 && VALID_SCOPES.has(s)),
    ),
  );
}

export async function createRole(payload: AccessRoleFormPayload) {
  const actor = await assertPermission("admin");

  const name = (payload.name ?? "").trim();
  if (!name) return { ok: false, error: "Role name is required" };
  if (SYSTEM_ROLE_NAMES.has(name))
    return { ok: false, error: "Cannot redefine a system role" };

  const description = (payload.description ?? "").trim() || null;
  const color = (payload.color ?? "").trim() || null;
  const scopes = normalizeScopes(payload.scopes ?? []);

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("access_roles")
    .insert({
      name,
      description,
      color,
      is_system: false,
      created_by: actor.email,
    })
    .select("id, name")
    .single();

  if (error) {
    console.error("[roles] createRole insert failed:", error);
    return { ok: false, error: error.message };
  }

  if (scopes.length > 0) {
    const rows = scopes.map((scope) => ({
      role_id: data.id,
      scope,
      granted: true,
    }));
    const { error: permErr } = await (supabase as any)
      .from("access_role_permissions")
      .insert(rows);
    if (permErr) {
      console.error("[roles] createRole permission insert failed:", permErr);
    }
  }

  revalidatePath("/admin/users");
  return { ok: true, id: data.id };
}

export async function updateRole(payload: AccessRoleFormPayload) {
  const actor = await assertPermission("admin");
  if (!payload.id) return { ok: false, error: "Role id required" };

  const supabase = createServiceClient();

  const { data: existing, error: existsErr } = await (supabase as any)
    .from("access_roles")
    .select("id, name, is_system")
    .eq("id", payload.id)
    .maybeSingle();
  if (existsErr || !existing) {
    return { ok: false, error: "Role not found" };
  }

  const newName = (payload.name ?? "").trim();
  const renameAttempt = existing.name !== newName;

  if (existing.is_system && renameAttempt) {
    return { ok: false, error: "Cannot rename a system role" };
  }
  if (!existing.is_system && !newName) {
    return { ok: false, error: "Role name is required" };
  }
  if (renameAttempt && SYSTEM_ROLE_NAMES.has(newName)) {
    return { ok: false, error: "Name reserved for a system role" };
  }

  const patch: Record<string, unknown> = {
    description: (payload.description ?? "").trim() || null,
    color: (payload.color ?? "").trim() || null,
  };
  if (!existing.is_system) patch.name = newName;

  const { error: updateErr } = await (supabase as any)
    .from("access_roles")
    .update(patch)
    .eq("id", existing.id);

  if (updateErr) {
    console.error("[roles] updateRole failed:", updateErr);
    return { ok: false, error: updateErr.message };
  }

  // If role got renamed, propagate to user_access.role
  if (!existing.is_system && renameAttempt) {
    await (supabase as any)
      .from("user_access")
      .update({ role: newName })
      .eq("role", existing.name);
  }

  // Replace permission scopes
  const scopes = normalizeScopes(payload.scopes ?? []);
  await (supabase as any)
    .from("access_role_permissions")
    .delete()
    .eq("role_id", existing.id);

  if (scopes.length > 0) {
    const rows = scopes.map((scope) => ({
      role_id: existing.id,
      scope,
      granted: true,
    }));
    const { error: insErr } = await (supabase as any)
      .from("access_role_permissions")
      .insert(rows);
    if (insErr) {
      console.error("[roles] updateRole perm insert failed:", insErr);
    }
  }

  // Log to user_audit_log so every user assigned to this role surfaces the
  // permission change in their detail page audit feed.
  const { data: affectedUsers } = await (supabase as any)
    .from("user_access")
    .select("email")
    .eq("role", existing.is_system ? existing.name : newName);

  for (const u of (affectedUsers ?? []) as Array<{ email: string }>) {
    await (supabase as any).from("user_audit_log").insert({
      actor_email: actor.email,
      target_email: u.email,
      action: "edit",
      after_json: { role_scopes: scopes },
      notes: `Role "${existing.is_system ? existing.name : newName}" permissions updated`,
    });
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteRole(id: string) {
  await assertPermission("admin");
  if (!id) return { ok: false, error: "Role id required" };

  const supabase = createServiceClient();
  const { data: existing } = await (supabase as any)
    .from("access_roles")
    .select("id, name, is_system")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Role not found" };
  if (existing.is_system)
    return { ok: false, error: "System roles cannot be deleted" };

  // Block deletion if users still assigned.
  const { count: userCount } = await (supabase as any)
    .from("user_access")
    .select("email", { count: "exact", head: true })
    .eq("role", existing.name);

  if ((userCount ?? 0) > 0) {
    return {
      ok: false,
      error: `Reassign the ${userCount} user${userCount === 1 ? "" : "s"} currently using this role first.`,
    };
  }

  const { error } = await (supabase as any)
    .from("access_roles")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[roles] deleteRole failed:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/users");
  return { ok: true };
}
