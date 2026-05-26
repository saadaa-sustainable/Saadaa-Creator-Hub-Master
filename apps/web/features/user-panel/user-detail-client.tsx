"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  History,
  Mail,
  Pencil,
  Shield,
  Sparkles,
  Trash2,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { deleteUser, toggleUserActive } from "./actions";
import type { UserAuditEvent, UserRow } from "./types";
import { PERMISSION_DESCRIPTIONS, PERMISSION_KEYS } from "@/lib/rbac";
import { ActivitySparkline } from "./activity-sparkline";

interface PermissionGrant {
  scope: string;
  description: string;
  granted: boolean;
}

function initials(input: string): string {
  const parts = input
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABEL: Record<string, { label: string; tone: string; icon: LucideIcon }> = {
  invite: { label: "Invited", tone: "bg-[--accent]/15 text-text-primary", icon: Mail },
  edit: { label: "Edited", tone: "bg-bg-muted text-text-secondary", icon: Pencil },
  role_change: { label: "Role changed", tone: "bg-warning-bg text-warning", icon: Shield },
  activate: { label: "Activated", tone: "bg-success-bg text-success", icon: CheckCircle2 },
  deactivate: { label: "Deactivated", tone: "bg-bg-muted text-text-secondary", icon: Clock },
  delete: { label: "Deleted", tone: "bg-danger-bg text-danger", icon: Trash2 },
  login: { label: "Logged in", tone: "bg-bg-muted text-text-secondary", icon: Sparkles },
  csv_invite_batch: {
    label: "Bulk CSV invite",
    tone: "bg-[--accent]/15 text-text-primary",
    icon: ClipboardList,
  },
};

export function UserDetailBody({
  user,
  events,
  grantedScopes,
}: {
  user: UserRow;
  events: UserAuditEvent[];
  grantedScopes: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const grantedSet = useMemo(() => new Set(grantedScopes), [grantedScopes]);
  const permissions: PermissionGrant[] = PERMISSION_KEYS.map((key) => ({
    scope: key,
    description: PERMISSION_DESCRIPTIONS[key],
    granted: grantedSet.has(key),
  }));
  const grantedCount = grantedScopes.length;
  const lastLogin = user.last_active_at ?? user.last_login_at;

  const summary = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      map.set(e.action, (map.get(e.action) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const handleToggle = () => {
    startTransition(async () => {
      const res = await toggleUserActive(user.email, !user.active);
      if (res.ok) {
        toast.success(`${user.email} ${!user.active ? "activated" : "deactivated"}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to toggle status");
      }
    });
  };

  const handleDelete = () => {
    if (!confirm(`Remove ${user.email}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteUser(user.email);
      if (res.ok) {
        toast.success(`Removed ${user.email}`);
        router.push("/admin/users");
      } else {
        toast.error(res.error ?? "Failed to delete");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-[0.7rem] font-extrabold text-text-secondary hover:text-text-primary w-fit"
      >
        <ArrowLeft size={12} aria-hidden /> Back to all users
      </Link>

      {/* Identity card */}
      <section className="rounded-2xl bg-bg-white border border-border p-3.5 sm:p-5 flex flex-col gap-3">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <span className="inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-bg-muted text-text-primary font-extrabold text-[0.9rem] sm:text-[1rem] shrink-0 border border-border">
            {initials(user.name || user.email)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.95rem] sm:text-[1.05rem] font-extrabold text-text-primary truncate leading-tight">
              {user.name || user.email.split("@")[0]}
            </h2>
            <p className="text-[0.66rem] sm:text-[0.74rem] text-text-tertiary truncate">
              {user.email}
            </p>
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.52rem] sm:text-[0.55rem] font-extrabold border whitespace-nowrap",
                  user.role === "Global Admin"
                    ? "bg-warning-bg text-warning border-warning/20"
                    : user.role === "Accounts Team"
                      ? "bg-[#E0F2F1] text-[#0f766e] border-[#0f766e]/20"
                      : "bg-success-bg text-success border-success/20",
                )}
              >
                {user.role}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.52rem] sm:text-[0.55rem] font-extrabold border",
                  user.active
                    ? "bg-success-bg text-success border-success/20"
                    : "bg-bg-muted text-text-tertiary border-border",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-1.5 w-1.5 rounded-full",
                    user.active ? "bg-success" : "bg-text-tertiary",
                  )}
                />
                {user.active ? "Active" : "Inactive"}
              </span>
              {!user.last_login_at && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.52rem] sm:text-[0.55rem] font-extrabold bg-warning-bg text-warning border border-warning/20">
                  <Clock size={9} aria-hidden /> Pending
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions wrap to their own row — keeps the name from getting
            squeezed by the buttons on narrow viewports. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleToggle}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1 px-2.5 h-8 rounded-full bg-bg-white text-text-primary text-[0.62rem] font-extrabold border border-border hover:bg-bg-muted active:scale-[0.97] disabled:opacity-60"
          >
            {user.active ? "Deactivate" : "Activate"}
          </button>
          <Link
            href={`/admin/users?focus=${encodeURIComponent(user.email)}`}
            className="inline-flex items-center justify-center gap-1 px-2.5 h-8 rounded-full bg-[--accent] text-text-primary text-[0.62rem] font-extrabold border border-[--accent] hover:brightness-95 active:scale-[0.97]"
          >
            <Pencil size={10} aria-hidden /> Edit
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1 px-2.5 h-8 rounded-full bg-danger-bg text-danger text-[0.62rem] font-extrabold border border-danger/30 hover:bg-danger/10 active:scale-[0.97] disabled:opacity-60"
          >
            <Trash2 size={10} aria-hidden /> Delete
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[0.65rem]">
          <div>
            <div className="text-text-tertiary uppercase tracking-[0.06em] font-extrabold text-[0.52rem]">
              Last active
            </div>
            <div className="font-extrabold text-text-primary tabular">
              {relTime(lastLogin)}
            </div>
          </div>
          <div>
            <div className="text-text-tertiary uppercase tracking-[0.06em] font-extrabold text-[0.52rem]">
              Joined
            </div>
            <div className="font-extrabold text-text-primary tabular">
              {relTime(user.created_at)}
            </div>
          </div>
          <div>
            <div className="text-text-tertiary uppercase tracking-[0.06em] font-extrabold text-[0.52rem]">
              Invited by
            </div>
            <div className="font-extrabold text-text-primary tabular truncate">
              {user.invited_by ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-text-tertiary uppercase tracking-[0.06em] font-extrabold text-[0.52rem]">
              Permissions
            </div>
            <div className="font-extrabold text-text-primary tabular">
              {grantedCount}/{permissions.length} scopes
            </div>
          </div>
        </div>

        {user.notes && (
          <div
            className="rounded-xl px-3 py-2 text-[0.72rem] text-text-secondary"
            style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <strong className="text-text-primary">Notes:</strong> {user.notes}
          </div>
        )}
      </section>

      {/* Activity */}
      <section className="rounded-2xl bg-bg-white border border-border p-4 sm:p-5 flex flex-col gap-3">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <Sparkles size={14} className="text-[--accent]" aria-hidden />
            <h3 className="text-[0.95rem] font-extrabold text-text-primary">
              30-day activity
            </h3>
          </div>
          <span className="text-[0.62rem] text-text-tertiary tabular">
            {user.activity_count ?? 0} touch
            {user.activity_count === 1 ? "" : "es"}
          </span>
        </header>
        <ActivitySparkline
          days={user.activity_days ?? []}
          width={520}
          height={28}
          className="w-full max-w-full"
        />
        {(user.activity_count ?? 0) === 0 && (
          <p className="text-[0.66rem] text-text-tertiary">
            No measurable activity in the last 30 days. Activity is captured
            from posts onboarded, payments logged, and Sheet View comments.
          </p>
        )}
      </section>

      {/* Permissions matrix */}
      <section className="rounded-2xl bg-bg-white border border-border p-4 sm:p-5 flex flex-col gap-3">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <Shield size={14} className="text-text-secondary" aria-hidden />
            <h3 className="text-[0.95rem] font-extrabold text-text-primary">
              Permissions
            </h3>
          </div>
          <span className="text-[0.62rem] text-text-tertiary">
            Effective from role <strong>{user.role}</strong>
          </span>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {permissions.map((perm) => (
            <div
              key={perm.scope}
              className={cn(
                "rounded-xl border p-2.5 flex items-start gap-2 transition-colors",
                perm.granted
                  ? "border-success/30 bg-success-bg/40"
                  : "border-border bg-bg-surface/40 opacity-70",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.55rem] font-extrabold mt-0.5",
                  perm.granted
                    ? "bg-success text-bg-white"
                    : "bg-bg-muted text-text-tertiary",
                )}
                aria-hidden
              >
                {perm.granted ? "✓" : "—"}
              </span>
              <div className="min-w-0">
                <div className="text-[0.72rem] font-extrabold text-text-primary truncate">
                  {perm.scope}
                </div>
                <div className="text-[0.6rem] text-text-tertiary">
                  {perm.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Audit log */}
      <section className="rounded-2xl bg-bg-white border border-border p-4 sm:p-5 flex flex-col gap-3">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <History size={14} className="text-text-secondary" aria-hidden />
            <h3 className="text-[0.95rem] font-extrabold text-text-primary">
              Audit log
            </h3>
          </div>
          {summary.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {summary.map(([action, count]) => {
                const meta = ACTION_LABEL[action];
                return (
                  <span
                    key={action}
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.55rem] font-extrabold border border-transparent",
                      meta?.tone ?? "bg-bg-muted text-text-secondary",
                    )}
                  >
                    {meta?.label ?? action} · {count}
                  </span>
                );
              })}
            </div>
          )}
        </header>
        {events.length === 0 ? (
          <p className="text-[0.7rem] text-text-tertiary">
            No audit events recorded yet. Future invites, role changes, and
            status flips will appear here.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((event) => {
              const meta = ACTION_LABEL[event.action];
              const Icon = meta?.icon ?? UserCircle2;
              return (
                <li
                  key={event.id}
                  className="rounded-xl border border-border bg-bg-white p-3 flex items-start gap-2.5"
                >
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0",
                      meta?.tone ?? "bg-bg-muted text-text-secondary",
                    )}
                  >
                    <Icon size={12} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.78rem] font-extrabold text-text-primary">
                      {meta?.label ?? event.action}
                      {event.actor_email && (
                        <span className="ml-1 font-bold text-text-tertiary">
                          by {event.actor_email}
                        </span>
                      )}
                    </div>
                    <div className="text-[0.62rem] text-text-tertiary tabular">
                      {absoluteTime(event.created_at)} · {relTime(event.created_at)}
                    </div>
                    {(event.before_json || event.after_json) && (
                      <DiffPreview before={event.before_json} after={event.after_json} />
                    )}
                    {event.notes && (
                      <div className="text-[0.62rem] text-text-tertiary mt-1">
                        {event.notes}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function DiffPreview({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const beforeMap = before ?? {};
  const afterMap = after ?? {};
  const keys = Array.from(
    new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]),
  ).filter((k) => beforeMap[k] !== afterMap[k]);
  if (keys.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {keys.map((k) => (
        <li
          key={k}
          className="text-[0.62rem] text-text-tertiary tabular inline-flex items-center gap-1"
        >
          <span className="font-bold text-text-secondary">{k}:</span>
          <span className="line-through opacity-70">
            {String(beforeMap[k] ?? "—")}
          </span>
          <ChevronRight size={9} className="opacity-60" aria-hidden />
          <span className="font-extrabold text-text-primary">
            {String(afterMap[k] ?? "—")}
          </span>
        </li>
      ))}
    </ul>
  );
}
