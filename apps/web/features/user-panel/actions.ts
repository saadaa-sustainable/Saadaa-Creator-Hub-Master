"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import type { UserFormPayload } from "./types";

const VALID_ROLES = new Set(["Global Admin", "User", "Accounts Team"]);

type AuditAction =
  | "invite"
  | "edit"
  | "role_change"
  | "activate"
  | "deactivate"
  | "delete"
  | "login"
  | "csv_invite_batch";

interface AuditInput {
  actorEmail: string;
  targetEmail: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  notes?: string | null;
}

async function logAudit(input: AuditInput): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await (supabase as any).from("user_audit_log").insert({
    actor_email: input.actorEmail.toLowerCase(),
    target_email: input.targetEmail.toLowerCase(),
    action: input.action,
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    notes: input.notes ?? null,
  });
  if (error) {
    console.error("[user-panel] audit insert failed:", error.message);
  }
}

export async function saveUser(payload: UserFormPayload) {
  const actor = await assertPermission("admin");

  const email = (payload.email ?? "").trim().toLowerCase();
  const name = (payload.name ?? "").trim() || null;
  const role = VALID_ROLES.has(payload.role) ? payload.role : "User";
  const active = payload.active !== false;
  const notes = (payload.notes ?? "").trim() || null;

  if (!email || !email.includes("@")) {
    return { ok: false, error: "Valid email required" };
  }

  const supabase = createServiceClient();

  const { data: existing } = await (supabase as any)
    .from("user_access")
    .select(
      "id, email, name, role, active, notes, invited_by, invited_at, last_login_at",
    )
    .eq("email", email)
    .maybeSingle();

  const isNew = !existing;
  const upsertPayload: Record<string, unknown> = {
    email,
    name,
    role,
    active,
    notes,
  };
  if (isNew) {
    upsertPayload.invited_by = actor.email;
    upsertPayload.invited_at = new Date().toISOString();
  }

  const { error } = await (supabase as any)
    .from("user_access")
    .upsert(upsertPayload, { onConflict: "email" });

  if (error) {
    console.error("[user-panel] saveUser:", error);
    return { ok: false, error: error.message };
  }

  if (isNew) {
    await logAudit({
      actorEmail: actor.email,
      targetEmail: email,
      action: "invite",
      after: upsertPayload,
    });
  } else {
    const before = {
      name: existing.name,
      role: existing.role,
      active: existing.active,
      notes: existing.notes,
    };
    const after = { name, role, active, notes };
    const changed = Object.keys(after).some(
      (k) => (before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k],
    );
    if (changed) {
      const action: AuditAction =
        before.role !== after.role
          ? "role_change"
          : before.active !== after.active
            ? after.active
              ? "activate"
              : "deactivate"
            : "edit";
      await logAudit({
        actorEmail: actor.email,
        targetEmail: email,
        action,
        before,
        after,
      });
    }
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${encodeURIComponent(email)}`);
  return { ok: true };
}

export async function deleteUser(email: string) {
  const actor = await assertPermission("admin");

  const target = (email ?? "").trim().toLowerCase();
  if (!target) return { ok: false, error: "Email required" };

  const supabase = createServiceClient();

  const { data: before } = await (supabase as any)
    .from("user_access")
    .select("email, name, role, active, notes")
    .eq("email", target)
    .maybeSingle();

  const { error } = await (supabase as any)
    .from("user_access")
    .delete()
    .eq("email", target);

  if (error) {
    console.error("[user-panel] deleteUser:", error);
    return { ok: false, error: error.message };
  }

  await logAudit({
    actorEmail: actor.email,
    targetEmail: target,
    action: "delete",
    before: before as Record<string, unknown> | null,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function toggleUserActive(email: string, active: boolean) {
  const actor = await assertPermission("admin");

  const target = (email ?? "").trim().toLowerCase();
  if (!target) return { ok: false, error: "Email required" };

  const supabase = createServiceClient();

  const { data: before } = await (supabase as any)
    .from("user_access")
    .select("email, active")
    .eq("email", target)
    .maybeSingle();

  const { error } = await (supabase as any)
    .from("user_access")
    .update({ active })
    .eq("email", target);

  if (error) {
    console.error("[user-panel] toggleUserActive:", error);
    return { ok: false, error: error.message };
  }

  await logAudit({
    actorEmail: actor.email,
    targetEmail: target,
    action: active ? "activate" : "deactivate",
    before: before ?? { active: !active },
    after: { active },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${encodeURIComponent(target)}`);
  return { ok: true };
}

const CSV_ROLE_ALIASES: Record<string, "Global Admin" | "User" | "Accounts Team"> = {
  admin: "Global Admin",
  "global admin": "Global Admin",
  owner: "Global Admin",
  user: "User",
  team: "User",
  member: "User",
  accounts: "Accounts Team",
  "accounts team": "Accounts Team",
  finance: "Accounts Team",
};

export interface BulkInviteResult {
  ok: boolean;
  invited: number;
  updated: number;
  failures: Array<{ email: string; error: string }>;
  error?: string;
}

export async function bulkInviteUsers(input: {
  rows: Array<{ email: string; name?: string; role?: string; notes?: string }>;
}): Promise<BulkInviteResult> {
  const actor = await assertPermission("admin");

  const inputRows = Array.isArray(input.rows) ? input.rows : [];
  if (inputRows.length === 0) {
    return {
      ok: false,
      invited: 0,
      updated: 0,
      failures: [],
      error: "No rows supplied",
    };
  }

  const supabase = createServiceClient();
  let invited = 0;
  let updated = 0;
  const failures: Array<{ email: string; error: string }> = [];

  const existingEmails = new Set<string>();
  {
    const { data } = await (supabase as any)
      .from("user_access")
      .select("email")
      .in(
        "email",
        inputRows.map((r) => (r.email ?? "").trim().toLowerCase()),
      );
    for (const r of (data ?? []) as Array<{ email: string }>) {
      existingEmails.add(r.email.toLowerCase());
    }
  }

  for (const row of inputRows) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      failures.push({ email: row.email ?? "(blank)", error: "Invalid email" });
      continue;
    }
    const name = (row.name ?? "").trim() || null;
    const roleRaw = (row.role ?? "").trim().toLowerCase();
    const role = CSV_ROLE_ALIASES[roleRaw] ?? "User";
    const notes = (row.notes ?? "").trim() || null;
    const isNew = !existingEmails.has(email);

    const payload: Record<string, unknown> = {
      email,
      name,
      role,
      active: true,
      notes,
    };
    if (isNew) {
      payload.invited_by = actor.email;
      payload.invited_at = new Date().toISOString();
    }

    const { error } = await (supabase as any)
      .from("user_access")
      .upsert(payload, { onConflict: "email" });

    if (error) {
      failures.push({ email, error: error.message });
      continue;
    }

    if (isNew) {
      invited++;
    } else {
      updated++;
    }
    await logAudit({
      actorEmail: actor.email,
      targetEmail: email,
      action: isNew ? "invite" : "edit",
      after: payload,
      notes: "CSV bulk invite",
    });
  }

  await logAudit({
    actorEmail: actor.email,
    targetEmail: actor.email,
    action: "csv_invite_batch",
    notes: `invited=${invited} updated=${updated} failures=${failures.length}`,
  });

  revalidatePath("/admin/users");
  return { ok: true, invited, updated, failures };
}

/**
 * Bump last_login_at + last_active_at when an authenticated user hits the
 * app. Called from middleware/auth lib (best-effort, never blocks).
 */
export async function recordUserActivity(email: string): Promise<void> {
  const target = (email ?? "").trim().toLowerCase();
  if (!target) return;
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  await (supabase as any)
    .from("user_access")
    .update({ last_login_at: now, last_active_at: now })
    .eq("email", target);
}
