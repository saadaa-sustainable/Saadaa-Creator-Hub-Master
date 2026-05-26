import { redirect, notFound } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import {
  fetchUserAuditLog,
  fetchUserByEmail,
} from "@/features/user-panel/queries";
import { UserDetailBody } from "@/features/user-panel/user-detail-client";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "User Detail" };

interface RouteParams {
  email: string;
}

async function fetchActivityForUser(email: string) {
  const supabase = createServiceClient();
  const since = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString();
  })();

  const days = new Set<string>();
  const bump = (iso: string | null | undefined) => {
    if (!iso) return;
    days.add(String(iso).slice(0, 10));
  };

  const [postsRes, paymentsRes, commentsRes] = await Promise.all([
    (supabase as any)
      .from("posts")
      .select("onboarded_by, onboard_date, created_at")
      .eq("onboarded_by", email)
      .gte("created_at", since)
      .limit(2000),
    (supabase as any)
      .from("payments")
      .select("logged_by, created_at")
      .eq("logged_by", email)
      .gte("created_at", since)
      .limit(2000),
    (supabase as any)
      .from("cell_comments")
      .select("author_email, created_at")
      .eq("author_email", email)
      .gte("created_at", since)
      .limit(2000),
  ]);

  for (const p of (postsRes.data ?? []) as Array<{
    onboard_date: string | null;
    created_at: string | null;
  }>) {
    bump(p.onboard_date ?? p.created_at);
  }
  for (const p of (paymentsRes.data ?? []) as Array<{
    created_at: string | null;
  }>) {
    bump(p.created_at);
  }
  for (const c of (commentsRes.data ?? []) as Array<{
    created_at: string | null;
  }>) {
    bump(c.created_at);
  }

  return Array.from(days).sort();
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "admin")) redirect("/dashboard");

  const resolved = await params;
  const email = decodeURIComponent(resolved.email ?? "").toLowerCase();
  if (!email) notFound();

  const user = await fetchUserByEmail(email);
  if (!user) notFound();

  const [activityDays, events, grantedScopes] = await Promise.all([
    fetchActivityForUser(email),
    fetchUserAuditLog(email),
    fetchGrantedScopes(user.role),
  ]);

  return (
    <div className="onboarding-stage user-panel-stage">
      <PageHeader icon={Users} title={user.name ?? user.email} knowMore="user-panel" />
      <UserDetailBody
        user={{ ...user, activity_days: activityDays, activity_count: activityDays.length }}
        events={events}
        grantedScopes={grantedScopes}
      />
    </div>
  );
}

async function fetchGrantedScopes(roleName: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data: roleRow } = await (supabase as any)
    .from("access_roles")
    .select("id")
    .eq("name", roleName)
    .maybeSingle();
  if (!roleRow?.id) return [];
  const { data: perms } = await (supabase as any)
    .from("access_role_permissions")
    .select("scope, granted")
    .eq("role_id", roleRow.id);
  return ((perms ?? []) as Array<{ scope: string; granted: boolean }>)
    .filter((p) => p.granted)
    .map((p) => p.scope);
}
