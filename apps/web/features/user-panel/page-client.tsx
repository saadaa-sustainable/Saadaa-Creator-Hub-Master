"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Activity,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Filter,
  History,
  Inbox,
  LayoutGrid,
  List as ListIcon,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { deleteUser, saveUser, toggleUserActive } from "./actions";
import { deleteRole } from "./roles-actions";
import { RoleEditorModal, useScopesPreview } from "./role-editor-modal";
import type {
  AccessRole,
  AccessRoleSummary,
  UserPanelData,
  UserRow,
} from "./types";
import { ActivitySparkline } from "./activity-sparkline";
import { CsvInviteModal } from "./csv-invite-modal";

const SYSTEM_ROLE_FALLBACK: AccessRole[] = [
  "User",
  "Global Admin",
  "Accounts Team",
];
type ViewMode = "cards" | "table";
type LastActiveFilter = "" | "today" | "week" | "month" | "stale" | "never";

const LAST_ACTIVE_LABEL: Record<LastActiveFilter, string> = {
  "": "All activity",
  today: "Active today",
  week: "Active 7 days",
  month: "Active 30 days",
  stale: "Inactive 30+ days",
  never: "Never logged in",
};

function inDaysWindow(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 86400000;
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
  if (Number.isNaN(t)) return String(iso);
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

function roleAccent(role: string, roles: AccessRoleSummary[]): string {
  const match = roles.find((r) => r.name === role);
  if (match?.color) return match.color;
  if (role === "Global Admin") return "#F0C61E";
  if (role === "Accounts Team") return "#0F766E";
  if (role === "User") return "#4F7C4D";
  return "#7B4FBF";
}

function roleAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 70%, 55%) 0%, hsl(${(hue + 35) % 360}, 65%, 40%) 100%)`;
}

// ─────────────────────────────────────────────────────────────────────────────

export function UserPanelBody({
  data,
  roles,
}: {
  data: UserPanelData;
  roles: AccessRoleSummary[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [lastActive, setLastActive] = useState<LastActiveFilter>("");
  const [modalUser, setModalUser] = useState<UserRow | "new" | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [editingRole, setEditingRole] = useState<
    AccessRoleSummary | "new" | null
  >(null);

  const roleOptions = useMemo(() => {
    if (roles.length === 0) return SYSTEM_ROLE_FALLBACK as string[];
    return roles.map((r) => r.name);
  }, [roles]);

  // Mobile defaults to cards; desktop defaults to table for density.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setViewMode(mq.matches ? "cards" : "table");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    if (!focus) return;
    const match = data.users.find(
      (u) => u.email.toLowerCase() === focus.toLowerCase(),
    );
    if (match) setModalUser(match);
  }, [data.users]);

  const normalizedQuery = search.trim().toLowerCase();

  const filteredUsers = useMemo(
    () =>
      data.users.filter((u) => {
        if (roleFilter && u.role !== roleFilter) return false;
        if (statusFilter === "active" && !u.active) return false;
        if (statusFilter === "inactive" && u.active) return false;
        if (lastActive === "today") {
          const t = u.last_active_at ?? u.last_login_at;
          if (!t || !inDaysWindow(t, 1)) return false;
        } else if (lastActive === "week") {
          const t = u.last_active_at ?? u.last_login_at;
          if (!t || !inDaysWindow(t, 7)) return false;
        } else if (lastActive === "month") {
          const t = u.last_active_at ?? u.last_login_at;
          if (!t || !inDaysWindow(t, 30)) return false;
        } else if (lastActive === "stale") {
          const t = u.last_active_at ?? u.last_login_at;
          if (t && inDaysWindow(t, 30)) return false;
        } else if (lastActive === "never") {
          if (u.last_login_at) return false;
        }
        if (normalizedQuery) {
          const hay = `${u.email} ${u.name ?? ""} ${u.notes ?? ""}`.toLowerCase();
          if (!hay.includes(normalizedQuery)) return false;
        }
        return true;
      }),
    [data.users, roleFilter, statusFilter, lastActive, normalizedQuery],
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
      <HeroBand kpis={data.kpis} totalRoles={roles.length} />

      <TabBar
        tab={tab}
        onChange={setTab}
        userCount={data.users.length}
        roleCount={roles.length}
      />

      {tab === "users" ? (
        <>
          <StickyToolbar
            search={search}
            roleFilter={roleFilter}
            statusFilter={statusFilter}
            lastActive={lastActive}
            roleOptions={roleOptions}
            viewMode={viewMode}
            refreshing={refreshing}
            onSearch={setSearch}
            onRole={setRoleFilter}
            onStatus={setStatusFilter}
            onLastActive={setLastActive}
            onViewMode={setViewMode}
            onRefresh={() => {
              setRefreshing(true);
              router.refresh();
              setTimeout(() => setRefreshing(false), 600);
            }}
            onInvite={() => setModalUser("new")}
            onCsv={() => setCsvOpen(true)}
            filteredCount={filteredUsers.length}
            totalCount={data.users.length}
          />

          {filteredUsers.length === 0 ? (
            <EmptyUsers onInvite={() => setModalUser("new")} />
          ) : viewMode === "table" ? (
            <UserTable
              users={filteredUsers}
              roles={roles}
              onEdit={(u) => setModalUser(u)}
              onDeleted={() => router.refresh()}
              onToggle={() => router.refresh()}
            />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {filteredUsers.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  roles={roles}
                  onEdit={() => setModalUser(u)}
                  onDeleted={() => router.refresh()}
                  onToggle={() => router.refresh()}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <RolesPanel
          roles={roles}
          onCreate={() => setEditingRole("new")}
          onEdit={(r) => setEditingRole(r)}
          onChanged={() => router.refresh()}
        />
      )}

      {modalUser && (
        <UserModal
          user={modalUser === "new" ? null : modalUser}
          roleOptions={roleOptions}
          roles={roles}
          onClose={() => setModalUser(null)}
          onSaved={() => {
            setModalUser(null);
            router.refresh();
          }}
        />
      )}

      {csvOpen && <CsvInviteModal onClose={() => setCsvOpen(false)} />}

      {editingRole && (
        <RoleEditorModal
          role={editingRole === "new" ? null : editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={() => {
            setEditingRole(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO — gradient identity band + 6 KPIs in a glossy strip
// ─────────────────────────────────────────────────────────────────────────────

function HeroBand({
  kpis,
  totalRoles,
}: {
  kpis: UserPanelData["kpis"];
  totalRoles: number;
}) {
  const stats: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    tone: string;
    hint?: string;
  }> = [
    { label: "Members", value: kpis.total, icon: Users, tone: "#3B6FD4" },
    { label: "Active", value: kpis.active, icon: UserCheck, tone: "#4F7C4D" },
    { label: "Admins", value: kpis.admins, icon: ShieldCheck, tone: "#F0C61E" },
    {
      label: "Accounts",
      value: kpis.accounts,
      icon: Banknote,
      tone: "#0F766E",
    },
    {
      label: "Pending",
      value: kpis.pendingInvites,
      icon: Clock,
      tone: "#B57514",
    },
    {
      label: "Online today",
      value: kpis.lastActiveToday,
      icon: Zap,
      tone: "#C0392B",
    },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-border"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,252,248,0.95) 0%, rgba(245,241,236,0.85) 100%)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(240,198,30,0.55) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-20 -left-12 w-72 h-72 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(123,79,191,0.35) 0%, transparent 70%)",
        }}
      />
      <div className="relative px-3 sm:px-6 py-3.5 sm:py-6 flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span
              className="inline-flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl shrink-0"
              style={{
                background: "var(--accent)",
                boxShadow: "0 6px 16px -6px rgba(240,198,30,0.6)",
              }}
              aria-hidden
            >
              <Users size={18} className="text-text-primary" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[1.1rem] sm:text-[1.4rem] font-extrabold text-text-primary tracking-tight leading-tight">
                Team & access
              </h1>
              <p className="text-[0.65rem] sm:text-[0.72rem] text-text-tertiary mt-0.5">
                {kpis.total} members · {totalRoles} role
                {totalRoles === 1 ? "" : "s"} ·{" "}
                <span className="font-bold text-text-secondary">
                  Saadaa workspace
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="group rounded-xl sm:rounded-2xl p-2 sm:p-3 flex flex-col gap-1 sm:gap-1.5 transition-all hover:-translate-y-0.5"
              style={{
                background: "rgba(255,252,248,0.85)",
                border: "1px solid var(--color-border)",
                boxShadow: "0 1px 0 rgba(22,21,19,0.04)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg shrink-0 transition-transform group-hover:scale-110"
                  style={{ background: `${s.tone}1A`, color: s.tone }}
                  aria-hidden
                >
                  <s.icon size={12} />
                </span>
              </div>
              <div className="text-[1.15rem] sm:text-[1.4rem] font-extrabold text-text-primary tabular leading-none">
                {s.value}
              </div>
              <div className="text-[0.52rem] sm:text-[0.58rem] uppercase tracking-[0.08em] font-extrabold text-text-tertiary truncate">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB BAR
// ─────────────────────────────────────────────────────────────────────────────

function TabBar({
  tab,
  onChange,
  userCount,
  roleCount,
}: {
  tab: "users" | "roles";
  onChange: (tab: "users" | "roles") => void;
  userCount: number;
  roleCount: number;
}) {
  const items: Array<{
    id: "users" | "roles";
    label: string;
    icon: LucideIcon;
    count: number;
  }> = [
    { id: "users", label: "Members", icon: Users, count: userCount },
    {
      id: "roles",
      label: "Roles & Permissions",
      icon: ShieldCheck,
      count: roleCount,
    },
  ];
  return (
    <div
      className="inline-flex gap-1 self-start rounded-2xl border border-border p-1"
      style={{ background: "rgba(255,252,248,0.85)" }}
      role="tablist"
      aria-label="User panel sections"
    >
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[0.74rem] font-extrabold transition-all",
              active
                ? "bg-text-primary text-bg-white shadow-md"
                : "text-text-secondary hover:bg-bg-muted",
            )}
          >
            <it.icon size={13} aria-hidden />
            {it.label}
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-4 px-1.5 rounded-full text-[0.6rem] font-extrabold tabular",
                active
                  ? "bg-bg-white/20 text-bg-white border border-bg-white/30"
                  : "bg-bg-muted text-text-secondary border border-border",
              )}
            >
              {it.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STICKY TOOLBAR
// ─────────────────────────────────────────────────────────────────────────────

function StickyToolbar(props: {
  search: string;
  roleFilter: string;
  statusFilter: string;
  lastActive: LastActiveFilter;
  roleOptions: string[];
  viewMode: ViewMode;
  refreshing: boolean;
  filteredCount: number;
  totalCount: number;
  onSearch: (v: string) => void;
  onRole: (v: string) => void;
  onStatus: (v: string) => void;
  onLastActive: (v: LastActiveFilter) => void;
  onViewMode: (v: ViewMode) => void;
  onRefresh: () => void;
  onInvite: () => void;
  onCsv: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="onboarding-filter-card">
        <div className="onboarding-filter-grid">
          <label className="onboarding-filter-field acc-filter-search">
            <span>
              <Search size={10} aria-hidden /> Search
            </span>
            <input
              type="text"
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
              placeholder="Name, email or notes…"
              className="onboarding-filter-select"
            />
          </label>
          <label className="onboarding-filter-field">
            <span>
              <Shield size={10} aria-hidden /> Role
            </span>
            <select
              value={props.roleFilter}
              onChange={(e) => props.onRole(e.target.value)}
              className="onboarding-filter-select"
            >
              <option value="">All Roles</option>
              {props.roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="onboarding-filter-field">
            <span>
              <Filter size={10} aria-hidden /> Status
            </span>
            <select
              value={props.statusFilter}
              onChange={(e) => props.onStatus(e.target.value)}
              className="onboarding-filter-select"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="onboarding-filter-field">
            <span>
              <Clock size={10} aria-hidden /> Last Active
            </span>
            <select
              value={props.lastActive}
              onChange={(e) =>
                props.onLastActive(e.target.value as LastActiveFilter)
              }
              className="onboarding-filter-select"
            >
              {(Object.keys(LAST_ACTIVE_LABEL) as LastActiveFilter[]).map((k) => (
                <option key={k} value={k}>
                  {LAST_ACTIVE_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Separate action row — sits under the filter card, wraps inline.
          Keeps the filter grid as a clean 2x2 on mobile per the stage
          consistency rule. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <ViewToggle viewMode={props.viewMode} onChange={props.onViewMode} />
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.refreshing}
          className={cn(
            "inline-flex items-center justify-center gap-1 px-2.5 h-8 rounded-full text-[0.62rem] font-extrabold bg-bg-white text-text-secondary border border-border transition-all",
            props.refreshing
              ? "opacity-70 cursor-wait"
              : "hover:bg-bg-muted active:scale-[0.97]",
          )}
        >
          <RefreshCw
            size={11}
            aria-hidden
            className={props.refreshing ? "animate-spin" : ""}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <button
          type="button"
          onClick={props.onCsv}
          className="inline-flex items-center justify-center gap-1 px-2.5 h-8 rounded-full text-[0.62rem] font-extrabold bg-bg-white text-text-primary border border-border hover:bg-bg-muted transition-all"
        >
          <UploadCloud size={11} aria-hidden /> CSV
        </button>
        <button
          type="button"
          onClick={props.onInvite}
          className="ml-auto inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 h-10 rounded-full text-[0.78rem] sm:text-[0.82rem] font-extrabold text-bg-white shadow-lg transition-all hover:scale-[1.04] active:scale-[0.96]"
          style={{
            background:
              "linear-gradient(180deg, #2D2620 0%, #161513 100%)",
            boxShadow:
              "0 6px 16px -4px rgba(22,21,19,0.45), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(240,198,30,0.35)",
          }}
        >
          <UserPlus size={14} aria-hidden /> Invite member
        </button>
      </div>

      <p className="text-[0.58rem] text-text-tertiary px-1">
        Showing{" "}
        <strong className="text-text-primary">{props.filteredCount}</strong> of{" "}
        {props.totalCount} members
      </p>
    </div>
  );
}

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-border overflow-hidden h-8"
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "table"}
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 text-[0.62rem] font-extrabold transition-colors",
          viewMode === "table"
            ? "bg-text-primary text-bg-white"
            : "bg-bg-white text-text-secondary hover:bg-bg-muted",
        )}
      >
        <ListIcon size={11} aria-hidden />
        <span className="hidden sm:inline">Table</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "cards"}
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 text-[0.62rem] font-extrabold border-l border-border transition-colors",
          viewMode === "cards"
            ? "bg-text-primary text-bg-white"
            : "bg-bg-white text-text-secondary hover:bg-bg-muted",
        )}
      >
        <LayoutGrid size={11} aria-hidden />
        <span className="hidden sm:inline">Cards</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER TABLE (default desktop)
// ─────────────────────────────────────────────────────────────────────────────

function UserTable({
  users,
  roles,
  onEdit,
  onDeleted,
  onToggle,
}: {
  users: UserRow[];
  roles: AccessRoleSummary[];
  onEdit: (user: UserRow) => void;
  onDeleted: () => void;
  onToggle: () => void;
}) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const act = async (
    user: UserRow,
    op: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingEmail(user.email);
    const res = await op();
    setPendingEmail(null);
    if (res.ok) {
      toast.success(success);
    } else {
      toast.error(res.error ?? "Action failed");
    }
  };

  return (
    <div
      className="rounded-2xl border border-border overflow-x-auto"
      style={{ background: "rgba(255,252,248,0.92)" }}
    >
      <table className="w-full text-[0.74rem]">
        <thead
          className="text-text-tertiary text-[0.58rem] uppercase tracking-[0.08em] font-extrabold sticky top-0 z-10"
          style={{ background: "rgba(245,241,236,0.95)" }}
        >
          <tr>
            <th className="text-left px-3.5 py-2.5">Member</th>
            <th className="text-left px-3 py-2.5">Role</th>
            <th className="text-left px-3 py-2.5">Status</th>
            <th className="text-left px-3 py-2.5">Last Active</th>
            <th className="text-left px-3 py-2.5">30-Day Activity</th>
            <th className="text-left px-3 py-2.5">Invited By</th>
            <th className="text-right px-3.5 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, idx) => {
            const isPending = pendingEmail === u.email;
            const accent = roleAccent(u.role, roles);
            const pendingInvite = u.active && !u.last_login_at;
            return (
              <tr
                key={u.id}
                className="group border-t border-border/60 transition-colors hover:bg-bg-surface/60"
                style={{
                  background:
                    idx % 2 === 0 ? "transparent" : "rgba(245,241,236,0.18)",
                }}
              >
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[0.72rem] font-extrabold text-bg-white shrink-0 shadow-md"
                      style={{ background: roleAvatarGradient(u.email) }}
                    >
                      {initials(u.name || u.email)}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border-2 border-bg-white",
                          u.active ? "bg-success" : "bg-text-tertiary",
                        )}
                      />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/users/${encodeURIComponent(u.email)}`}
                        className="block font-extrabold text-text-primary truncate hover:text-[--accent] transition-colors"
                      >
                        {u.name || u.email.split("@")[0]}
                      </Link>
                      <span className="block text-[0.6rem] text-text-tertiary truncate">
                        {u.email}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <RoleChip role={u.role} color={accent} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        act(
                          u,
                          () => toggleUserActive(u.email, !u.active),
                          `${u.email} ${!u.active ? "activated" : "deactivated"}`,
                        ).then(onToggle)
                      }
                      disabled={isPending}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.56rem] font-extrabold border w-fit transition-colors",
                        u.active
                          ? "bg-success-bg text-success border-success/30 hover:bg-success-bg/80"
                          : "bg-bg-muted text-text-tertiary border-border hover:bg-bg-muted/60",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-1.5 w-1.5 rounded-full",
                          u.active ? "bg-success animate-pulse" : "bg-text-tertiary",
                        )}
                      />
                      {u.active ? "Active" : "Inactive"}
                    </button>
                    {pendingInvite && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.5rem] font-extrabold bg-warning-bg text-warning border border-warning/30 w-fit">
                        <Clock size={8} aria-hidden /> Awaiting login
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular text-text-secondary">
                  {relTime(u.last_active_at ?? u.last_login_at)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="inline-flex items-center gap-1.5">
                    <ActivitySparkline
                      days={u.activity_days ?? []}
                      width={92}
                      height={18}
                    />
                    <span className="text-text-secondary tabular font-bold text-[0.66rem]">
                      {u.activity_count ?? 0}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[0.66rem] text-text-tertiary truncate max-w-[160px]">
                  {u.invited_by ? (
                    <span title={u.invited_at ?? ""}>{u.invited_by}</span>
                  ) : (
                    <span className="opacity-60">—</span>
                  )}
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <RowActions
                    user={u}
                    pending={isPending}
                    onEdit={() => onEdit(u)}
                    onDelete={async () => {
                      if (!confirm(`Remove ${u.email}? This cannot be undone.`))
                        return;
                      await act(
                        u,
                        () => deleteUser(u.email),
                        `Removed ${u.email}`,
                      );
                      onDeleted();
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  user,
  pending,
  onEdit,
  onDelete,
}: {
  user: UserRow;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  return (
    <div
      className="relative inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Link
        href={`/admin/users/${encodeURIComponent(user.email)}`}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:bg-bg-muted hover:text-text-primary transition-colors"
        title="Open profile"
      >
        <ClipboardList size={13} aria-hidden />
      </Link>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:bg-bg-muted hover:text-text-primary transition-colors"
        title="Edit"
      >
        <Pencil size={13} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:bg-bg-muted hover:text-text-primary transition-colors"
        title="More"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {open && (
        <div
          className="absolute right-0 top-9 min-w-[160px] rounded-xl border border-border p-1 z-30"
          style={{
            background: "var(--color-bg-white, #FFFFFF)",
            boxShadow:
              "0 16px 40px -12px rgba(22,21,19,0.28), 0 0 0 1px rgba(0,0,0,0.04)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            disabled={pending}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-[0.72rem] font-extrabold text-danger hover:bg-danger-bg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Trash2 size={11} aria-hidden /> Delete member
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER CARD (mobile + cards mode)
// ─────────────────────────────────────────────────────────────────────────────

function UserCard({
  user,
  roles,
  onEdit,
  onDeleted,
  onToggle,
}: {
  user: UserRow;
  roles: AccessRoleSummary[];
  onEdit: () => void;
  onDeleted: () => void;
  onToggle: (active: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const accent = roleAccent(user.role, roles);
  const pendingInvite = user.active && !user.last_login_at;

  const handleDelete = () => {
    if (!confirm(`Remove ${user.email}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteUser(user.email);
      if (res.ok) {
        toast.success(`Removed ${user.email}`);
        onDeleted();
      } else {
        toast.error(res.error ?? "Failed to delete");
      }
    });
  };

  const handleToggle = () => {
    startTransition(async () => {
      const next = !user.active;
      const res = await toggleUserActive(user.email, next);
      if (res.ok) {
        toast.success(`${user.email} ${next ? "activated" : "deactivated"}`);
        onToggle(next);
      } else {
        toast.error(res.error ?? "Failed to toggle status");
      }
    });
  };

  return (
    <article
      className="group relative rounded-2xl border border-border p-2.5 sm:p-3.5 flex flex-col gap-2 sm:gap-2.5 min-w-0 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{
        background: "rgba(255,252,248,0.94)",
        boxShadow: "0 1px 0 rgba(22,21,19,0.04)",
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
        style={{ background: accent }}
      />

      <header className="flex items-start gap-2 min-w-0">
        <span
          className="relative inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl text-[0.7rem] sm:text-[0.74rem] font-extrabold text-bg-white shrink-0 shadow-sm"
          style={{ background: roleAvatarGradient(user.email) }}
        >
          {initials(user.name || user.email)}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border-2 border-bg-white",
              user.active ? "bg-success" : "bg-text-tertiary",
            )}
          />
        </span>
        <div className="flex-1 min-w-0">
          <Link
            href={`/admin/users/${encodeURIComponent(user.email)}`}
            className="block text-[0.78rem] sm:text-[0.85rem] font-extrabold text-text-primary truncate leading-tight hover:text-[--accent]"
          >
            {user.name || user.email.split("@")[0]}
          </Link>
          <span className="block text-[0.56rem] sm:text-[0.6rem] text-text-tertiary truncate">
            {user.email}
          </span>
          <div className="mt-1">
            <RoleChip role={user.role} color={accent} />
          </div>
        </div>
      </header>

      {/* 2×2 stat grid — mirrors posting card mobile pattern */}
      <div className="grid grid-cols-2 gap-1.5 text-[0.56rem] sm:text-[0.6rem]">
        <Stat label="Status">
          <button
            type="button"
            onClick={handleToggle}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.52rem] font-extrabold border transition-colors w-fit",
              user.active
                ? "bg-success-bg text-success border-success/30"
                : "bg-bg-muted text-text-tertiary border-border",
            )}
          >
            <span
              className={cn(
                "inline-flex h-1.5 w-1.5 rounded-full",
                user.active ? "bg-success animate-pulse" : "bg-text-tertiary",
              )}
            />
            {user.active ? "Active" : "Inactive"}
          </button>
        </Stat>
        <Stat label="Last seen">
          <span className="font-bold text-text-primary tabular truncate block">
            {relTime(user.last_active_at ?? user.last_login_at)}
          </span>
        </Stat>
        <Stat label="30-day">
          <div className="inline-flex items-center gap-1 min-w-0">
            <ActivitySparkline
              days={user.activity_days ?? []}
              width={42}
              height={12}
            />
            <span className="font-bold text-text-primary tabular">
              {user.activity_count ?? 0}
            </span>
          </div>
        </Stat>
        <Stat label={pendingInvite ? "Invite" : "Joined"}>
          {pendingInvite ? (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[0.5rem] font-extrabold border w-fit"
              style={{
                background: "rgba(181,117,20,0.12)",
                color: "var(--color-warning-text, #B57514)",
                borderColor: "rgba(181,117,20,0.3)",
              }}
            >
              <Clock size={8} aria-hidden /> Pending
            </span>
          ) : (
            <span className="font-bold text-text-primary tabular">
              {relTime(user.created_at)}
            </span>
          )}
        </Stat>
      </div>

      {user.notes && (
        <p className="hidden sm:block text-[0.62rem] text-text-secondary leading-snug line-clamp-2 px-2 py-1 rounded-lg bg-bg-surface/60 border border-border/60">
          {user.notes}
        </p>
      )}

      <footer className="flex items-center gap-1.5 mt-auto">
        <Link
          href={`/admin/users/${encodeURIComponent(user.email)}`}
          className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg border border-border bg-bg-white text-text-primary text-[0.62rem] font-extrabold hover:bg-bg-muted/40 transition-colors"
          title="Profile"
        >
          <ClipboardList size={10} aria-hidden />
          <span className="hidden sm:inline">Profile</span>
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center justify-center gap-1 h-8 px-2 rounded-lg border border-border bg-bg-white text-text-primary text-[0.62rem] font-extrabold hover:bg-bg-muted/40 transition-colors"
          title="Edit"
        >
          <Pencil size={10} aria-hidden />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-danger/30 bg-danger-bg text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
          title="Delete"
        >
          <Trash2 size={10} aria-hidden />
        </button>
      </footer>
    </article>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-text-tertiary uppercase tracking-[0.06em] font-extrabold text-[0.52rem] mb-0.5">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function RoleChip({ role, color }: { role: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.56rem] font-extrabold border whitespace-nowrap"
      style={{
        background: `${color}1A`,
        color: color,
        borderColor: `${color}40`,
      }}
    >
      <ShieldCheck size={9} aria-hidden />
      {role}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

function EmptyUsers({ onInvite }: { onInvite: () => void }) {
  return (
    <section className="rounded-3xl bg-bg-white border border-dashed border-border p-10 text-center">
      <div className="relative inline-flex mb-3">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: "rgba(240,198,30,0.4)" }}
        />
        <span
          className="relative inline-flex h-14 w-14 items-center justify-center rounded-full border"
          style={{
            background: "rgba(255,252,248,0.85)",
            borderColor: "rgba(240,198,30,0.4)",
          }}
        >
          <Inbox size={22} className="text-[--accent]" aria-hidden />
        </span>
      </div>
      <p className="text-[0.95rem] font-extrabold text-text-primary mb-1">
        No matches
      </p>
      <p className="text-[0.7rem] text-text-tertiary max-w-[280px] mx-auto mb-3">
        Try clearing the filters or invite someone new to start populating the
        team.
      </p>
      <button
        type="button"
        onClick={onInvite}
        className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl text-[0.78rem] font-extrabold bg-text-primary text-bg-white hover:scale-[1.03] active:scale-[0.97] transition-all"
      >
        <UserPlus size={14} aria-hidden /> Invite a teammate
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLES PANEL
// ─────────────────────────────────────────────────────────────────────────────

function RolesPanel({
  roles,
  onCreate,
  onEdit,
  onChanged,
}: {
  roles: AccessRoleSummary[];
  onCreate: () => void;
  onEdit: (role: AccessRoleSummary) => void;
  onChanged: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleDelete = async (role: AccessRoleSummary) => {
    if (role.is_system) return;
    if (
      !confirm(
        `Delete role "${role.name}"? Users still assigned to it must be moved off first.`,
      )
    )
      return;
    setPendingId(role.id);
    const res = await deleteRole(role.id);
    setPendingId(null);
    if (res.ok) {
      toast.success(`Deleted role "${role.name}"`);
      onChanged();
    } else {
      toast.error(res.error ?? "Failed to delete role");
    }
  };

  return (
    <section className="flex flex-col gap-3 sm:gap-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[1rem] font-extrabold text-text-primary inline-flex items-center gap-2">
            <Shield size={14} className="text-text-secondary" aria-hidden /> Roles &
            permissions
          </h2>
          <p className="text-[0.68rem] text-text-tertiary mt-0.5 max-w-[640px]">
            Define which stages each role can touch. System roles can be tuned
            but not deleted. Custom roles flow into invite flows, the user edit
            modal, and the permission gates server-side.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 h-10 rounded-xl text-[0.76rem] font-extrabold bg-text-primary text-bg-white hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus size={14} aria-hidden /> Create role
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {roles.length === 0 && (
          <div className="col-span-full rounded-2xl bg-bg-white border border-dashed border-border p-6 text-center">
            <ShieldCheck
              size={24}
              className="mx-auto text-text-tertiary mb-2"
              aria-hidden
            />
            <p className="text-[0.78rem] font-extrabold text-text-primary mb-1">
              No roles yet
            </p>
            <p className="text-[0.66rem] text-text-tertiary">
              Once the migration is applied the three system roles seed in.
            </p>
          </div>
        )}
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            isPending={pendingId === role.id}
            onEdit={() => onEdit(role)}
            onDelete={() => handleDelete(role)}
          />
        ))}
      </div>
    </section>
  );
}

function RoleCard({
  role,
  isPending,
  onEdit,
  onDelete,
}: {
  role: AccessRoleSummary;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const accent = role.color || "#7B4FBF";
  const preview = useScopesPreview(role.scopes);

  return (
    <article
      className="group relative rounded-2xl border border-border p-3.5 flex flex-col gap-2.5 min-w-0 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{
        background: "rgba(255,252,248,0.94)",
        borderLeft: `4px solid ${accent}`,
        boxShadow: "0 1px 0 rgba(22,21,19,0.04)",
      }}
    >
      <header className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <h3 className="text-[0.95rem] font-extrabold text-text-primary truncate inline-flex items-center gap-1.5">
            {role.name}
            {role.is_system ? (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[0.5rem] font-extrabold border"
                style={{
                  background: "rgba(240,198,30,0.16)",
                  borderColor: "rgba(240,198,30,0.35)",
                  color: "var(--color-text-primary)",
                }}
                title="Seeded system role — cannot be deleted"
              >
                <Lock size={8} aria-hidden /> System
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[0.5rem] font-extrabold border border-border bg-bg-muted text-text-secondary"
                title="Custom role"
              >
                <Sparkles size={8} aria-hidden /> Custom
              </span>
            )}
          </h3>
          {role.description && (
            <p className="text-[0.66rem] text-text-tertiary mt-0.5 leading-snug line-clamp-2">
              {role.description}
            </p>
          )}
        </div>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0 transition-transform group-hover:scale-110"
          style={{ background: `${accent}1F`, color: accent }}
          aria-hidden
        >
          <ShieldCheck size={15} />
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 text-[0.62rem]">
        <div>
          <div className="text-text-tertiary uppercase tracking-[0.06em] font-extrabold text-[0.52rem]">
            Permissions
          </div>
          <div className="font-extrabold text-text-primary tabular">
            {role.granted_count}/8
          </div>
        </div>
        <div>
          <div className="text-text-tertiary uppercase tracking-[0.06em] font-extrabold text-[0.52rem]">
            Assigned
          </div>
          <div className="font-extrabold text-text-primary tabular">
            {role.user_count} user{role.user_count === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <p
        className="text-[0.62rem] leading-snug px-2 py-1.5 rounded-lg truncate"
        style={{
          background: "var(--color-bg-surface)",
          color: "var(--color-text-secondary)",
        }}
        title={role.scopes.join(", ")}
      >
        {preview}
      </p>

      <footer className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-lg border border-border bg-bg-white text-text-primary text-[0.7rem] font-extrabold hover:bg-bg-muted/40 transition-colors"
        >
          <Pencil size={11} aria-hidden /> {role.is_system ? "Tune" : "Edit"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={role.is_system || isPending}
          className={cn(
            "inline-flex items-center justify-center gap-1 h-9 px-2.5 rounded-lg border text-[0.7rem] font-extrabold transition-colors",
            role.is_system
              ? "border-border bg-bg-muted text-text-tertiary cursor-not-allowed"
              : "border-danger/30 bg-danger-bg text-danger hover:bg-danger/10",
            isPending && "opacity-60",
          )}
        >
          {role.is_system ? <Lock size={11} aria-hidden /> : <Trash2 size={11} aria-hidden />}
          {role.is_system ? "Locked" : "Delete"}
        </button>
      </footer>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER MODAL
// ─────────────────────────────────────────────────────────────────────────────

function UserModal({
  user,
  roleOptions,
  roles,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  roleOptions: string[];
  roles: AccessRoleSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!user;
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<string>(
    user?.role ?? roleOptions[0] ?? "User",
  );
  const [active, setActive] = useState(user?.active ?? true);
  const [notes, setNotes] = useState(user?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const selectedRoleSummary = roles.find((r) => r.name === role);
  const accent = roleAccent(role, roles);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Valid email required");
      return;
    }
    startTransition(async () => {
      const res = await saveUser({
        email,
        name,
        role: role as AccessRole,
        active,
        notes,
      });
      if (res.ok) {
        toast.success(editing ? "User updated" : "User invited");
        onSaved();
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    });
  };

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding" onClick={onClose}>
      <form
        className="modal-panel modal-panel--onboarding ob-overview-modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            {editing ? (
              <Pencil size={15} aria-hidden />
            ) : (
              <UserPlus size={15} aria-hidden />
            )}
            <h2 className="font-semibold">
              {editing ? "Edit member" : "Invite new member"}
            </h2>
            {editing && (
              <span className="chip text-[10px] tabular truncate max-w-[160px]">
                {user!.email}
              </span>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="modal-body ob-overview-body" style={{ gap: 14 }}>
          {/* Identity preview band */}
          <div
            className="rounded-2xl p-3 flex items-center gap-3 min-w-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,252,248,0.95) 0%, rgba(245,241,236,0.9) 100%)",
              border: "1px solid var(--color-border)",
            }}
          >
            <span
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-[0.92rem] font-extrabold text-bg-white shrink-0 shadow-md"
              style={{ background: roleAvatarGradient(email || "new") }}
            >
              {initials(name || email || "?")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.85rem] font-extrabold text-text-primary truncate">
                {name || email.split("@")[0] || "New member"}
              </div>
              <div className="text-[0.62rem] text-text-tertiary truncate">
                {email || "Pending email"}
              </div>
              <div className="mt-1">
                <RoleChip role={role} color={accent} />
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Email *
            </span>
            <input
              type="email"
              required
              disabled={editing}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@saadaa.in"
              className="form-control"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="form-control"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
                Role *
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="form-control"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
                Status
              </span>
              <select
                value={active ? "true" : "false"}
                onChange={(e) => setActive(e.target.value === "true")}
                className="form-control"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          </div>

          {selectedRoleSummary && (
            <div
              className="rounded-xl px-3 py-2 text-[0.66rem] leading-snug flex items-start gap-2"
              style={{
                background: `${accent}10`,
                border: `1px solid ${accent}30`,
                color: "var(--color-text-secondary)",
              }}
            >
              <ShieldCheck
                size={12}
                aria-hidden
                style={{ color: accent }}
                className="mt-0.5 shrink-0"
              />
              <span>
                <strong className="text-text-primary">
                  {selectedRoleSummary.name}
                </strong>{" "}
                grants {selectedRoleSummary.granted_count}/8 scopes
                {selectedRoleSummary.description
                  ? ` · ${selectedRoleSummary.description}`
                  : ""}
              </span>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Notes
            </span>
            <textarea
              rows={3}
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the next admin should know (department, contract end, etc.)"
              className="form-control"
              style={{ resize: "none", lineHeight: 1.5 }}
            />
          </label>

          {editing && (
            <p className="text-[0.62rem] text-text-tertiary tabular leading-snug">
              Joined {relTime(user!.created_at)}
              {user!.invited_by ? ` · invited by ${user!.invited_by}` : ""}
              {user!.last_login_at
                ? ` · last login ${relTime(user!.last_login_at)}`
                : " · never logged in"}
            </p>
          )}
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={cn("btn-primary-cta", pending && "is-loading")}
          >
            {pending ? (
              <Activity size={14} className="animate-spin" />
            ) : editing ? (
              <CheckCircle2 size={14} aria-hidden />
            ) : (
              <UserPlus size={14} aria-hidden />
            )}
            <span>
              {pending
                ? "Saving…"
                : editing
                  ? "Save Changes"
                  : "Send Invite"}
            </span>
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
