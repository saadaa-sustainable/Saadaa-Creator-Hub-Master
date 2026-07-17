import { createServiceClient } from "@/lib/supabase/server";
import type {
  UserAuditEvent,
  UserPanelData,
  UserPanelKpis,
  UserRow,
} from "./types";

function normalizeRole(role: string | null | undefined): string {
  const raw = (role ?? "").trim();
  const r = raw.toLowerCase();
  // Legacy variants only — real role names (Admin, Global Admin, Accounts
  // Team, Campaign Owner, custom roles) pass through verbatim. The old
  // collapse of "admin" → "Global Admin" hid the Admin/Global Admin split.
  if (["owner level", "owner"].includes(r)) return "Global Admin";
  if (r === "admin") return "Admin";
  if (r === "global admin") return "Global Admin";
  if (r === "accounts team") return "Accounts Team";
  return raw || "User";
}

function todayInIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function daysAgoIso(days: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString();
}

export async function fetchUserPanelData(): Promise<UserPanelData> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("user_access")
    .select(
      "id, email, name, role, active, created_at, last_login_at, last_active_at, invited_by, invited_at, notes",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[user-panel] query failed:", error);
    return {
      users: [],
      kpis: {
        total: 0,
        active: 0,
        admins: 0,
        accounts: 0,
        pendingInvites: 0,
        lastActiveToday: 0,
      },
    };
  }

  const usersRaw = ((data ?? []) as UserRow[]).map((u) => ({
    ...u,
    role: normalizeRole(u.role),
  }));

  // 30-day activity touchpoints — pull recent posts.onboarded_by + payments
  // + cell_comments and bucket by (email, yyyy-MM-dd).
  const since = daysAgoIso(30);
  const activityMap = new Map<string, Set<string>>(); // email → Set<day>

  const bump = (email: string | null | undefined, iso: string | null | undefined) => {
    if (!email || !iso) return;
    const day = String(iso).slice(0, 10);
    const key = email.toLowerCase();
    if (!activityMap.has(key)) activityMap.set(key, new Set());
    activityMap.get(key)!.add(day);
  };

  const [postsRes, paymentsRes, commentsRes] = await Promise.all([
    (supabase as any)
      .from("posts")
      .select("onboarded_by, onboard_date, created_at")
      .gte("created_at", since)
      .limit(5000),
    (supabase as any)
      .from("payments")
      .select("logged_by, created_at")
      .gte("created_at", since)
      .limit(5000),
    (supabase as any)
      .from("cell_comments")
      .select("author_email, created_at")
      .gte("created_at", since)
      .limit(5000),
  ]);

  for (const p of (postsRes.data ?? []) as Array<{
    onboarded_by: string | null;
    onboard_date: string | null;
    created_at: string | null;
  }>) {
    bump(p.onboarded_by, p.onboard_date ?? p.created_at);
  }
  for (const p of (paymentsRes.data ?? []) as Array<{
    logged_by: string | null;
    created_at: string | null;
  }>) {
    bump(p.logged_by, p.created_at);
  }
  for (const c of (commentsRes.data ?? []) as Array<{
    author_email: string | null;
    created_at: string | null;
  }>) {
    bump(c.author_email, c.created_at);
  }

  const today = todayInIst();
  const users = usersRaw.map((u) => {
    const days = Array.from(activityMap.get(u.email.toLowerCase()) ?? []).sort();
    return {
      ...u,
      activity_days: days,
      activity_count: days.length,
    };
  });

  const kpis: UserPanelKpis = {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter(
      (u) => u.role === "Global Admin" || u.role === "Admin",
    ).length,
    accounts: users.filter((u) => u.role === "Accounts Team").length,
    pendingInvites: users.filter((u) => u.active && !u.last_login_at).length,
    lastActiveToday: users.filter((u) => {
      const last = u.last_active_at ?? u.last_login_at;
      if (!last) return false;
      return last.slice(0, 10) === today;
    }).length,
  };

  return { users, kpis };
}

export async function fetchUserAuditLog(
  targetEmail: string,
  limit = 50,
): Promise<UserAuditEvent[]> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("user_audit_log")
    .select(
      "id, actor_email, target_email, action, before_json, after_json, notes, created_at",
    )
    .eq("target_email", targetEmail.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[user-panel] audit log query failed:", error);
    return [];
  }
  return (data ?? []) as UserAuditEvent[];
}

export async function fetchUserByEmail(email: string): Promise<UserRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("user_access")
    .select(
      "id, email, name, role, active, created_at, last_login_at, last_active_at, invited_by, invited_at, notes",
    )
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[user-panel] fetchUserByEmail:", error);
    return null;
  }
  if (!data) return null;
  const u = data as UserRow;
  return { ...u, role: normalizeRole(u.role) };
}
