"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { assertPermission } from "@/lib/rbac.server";
import { NOTIFICATION_TYPES, sendNotification } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/server";
import type { UserFormPayload } from "./types";

const VALID_ROLES = new Set([
  "Global Admin",
  "Admin",
  "User",
  "Accounts Team",
  "Campaign Owner",
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Absolute origin of the running deployment, derived from the request headers.
 * No NEXT_PUBLIC_SITE_URL exists; Vercel sets x-forwarded-host/proto, so this
 * resolves to the live prod domain in prod and localhost in dev.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Branded invitation email. CreatorHub is Google-OAuth-only (passwordless): an
 * invited user becomes active the moment they sign in with the Google account
 * matching their (already-inserted, active) user_access row — there is no
 * password to set and no accept token. So the invite email simply points them
 * to /login to sign in with Google. Best-effort: sendNotification never throws
 * and logs every attempt to email_logs. Returns whether the send succeeded.
 */
async function sendUserInviteEmail(opts: {
  email: string;
  name: string | null;
  role: string;
  inviterEmail: string;
}): Promise<boolean> {
  const loginUrl = `${await requestOrigin()}/login`;
  const safeName = escapeHtml(opts.name || "there");
  const safeRole = escapeHtml(opts.role);
  const safeEmail = escapeHtml(opts.email);

  const htmlBody = `
    <p style="margin:0 0 12px;">Hi ${safeName},</p>
    <p style="margin:0 0 14px;">You've been granted access to <strong>Saadaa CreatorHub</strong>, our influencer management platform.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px;font-size:0.86rem;">
      <tr>
        <td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;width:34%;">Email</td>
        <td style="border:1px solid #E7E2D2;padding:8px 12px;">${safeEmail}</td>
      </tr>
      <tr>
        <td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;">Role</td>
        <td style="border:1px solid #E7E2D2;padding:8px 12px;">${safeRole}</td>
      </tr>
    </table>
    <p style="margin:0 0 18px;">
      <a href="${loginUrl}" style="display:inline-block;background:#F0C61E;color:#2C2420;font-weight:800;padding:12px 26px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">Sign in with Google</a>
    </p>
    <p style="margin:0;color:#6E695E;font-size:0.82rem;">Sign in using the Google account for <strong>${safeEmail}</strong> — your access is tied to this address. If the button doesn't work, open <span style="color:#161513;">${escapeHtml(loginUrl)}</span>.</p>
  `;

  const result = await sendNotification({
    type: NOTIFICATION_TYPES.USER_INVITATION,
    to: opts.email,
    subject: "You've been invited to Saadaa CreatorHub",
    title: "Welcome to CreatorHub",
    subtitle: `Role: ${opts.role}`,
    htmlBody,
    plainBody: `Hi ${opts.name || "there"}, you've been granted access to Saadaa CreatorHub as ${opts.role}. Sign in with the Google account for ${opts.email} at ${loginUrl}`,
    replyTo: opts.inviterEmail,
  });
  return result.ok;
}

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

  let emailSent = false;
  if (isNew) {
    await logAudit({
      actorEmail: actor.email,
      targetEmail: email,
      action: "invite",
      after: upsertPayload,
    });
    if (active) {
      emailSent = await sendUserInviteEmail({
        email,
        name,
        role,
        inviterEmail: actor.email,
      });
    }
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
  return { ok: true, emailSent };
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

const CSV_ROLE_ALIASES: Record<
  string,
  "Global Admin" | "Admin" | "User" | "Accounts Team" | "Campaign Owner"
> = {
  admin: "Admin",
  "global admin": "Global Admin",
  owner: "Global Admin",
  user: "User",
  team: "User",
  member: "User",
  accounts: "Accounts Team",
  "accounts team": "Accounts Team",
  finance: "Accounts Team",
  "campaign owner": "Campaign Owner",
  campaign: "Campaign Owner",
};

export interface BulkInviteResult {
  ok: boolean;
  invited: number;
  updated: number;
  emailed: number;
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
      emailed: 0,
      failures: [],
      error: "No rows supplied",
    };
  }

  const supabase = createServiceClient();
  let invited = 0;
  let updated = 0;
  const failures: Array<{ email: string; error: string }> = [];
  // New + active invitees to email after the upsert loop (sent in parallel so a
  // large CSV doesn't serialise dozens of SMTP round-trips and time out).
  const toEmail: Array<{ email: string; name: string | null; role: string }> = [];

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
      toEmail.push({ email, name, role });
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

  // Send invite emails in parallel (best-effort; each logs to email_logs).
  let emailed = 0;
  if (toEmail.length > 0) {
    const sent = await Promise.allSettled(
      toEmail.map((r) =>
        sendUserInviteEmail({
          email: r.email,
          name: r.name,
          role: r.role,
          inviterEmail: actor.email,
        }),
      ),
    );
    emailed = sent.filter(
      (s) => s.status === "fulfilled" && s.value === true,
    ).length;
  }

  await logAudit({
    actorEmail: actor.email,
    targetEmail: actor.email,
    action: "csv_invite_batch",
    notes: `invited=${invited} updated=${updated} emailed=${emailed} failures=${failures.length}`,
  });

  revalidatePath("/admin/users");
  return { ok: true, invited, updated, emailed, failures };
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
