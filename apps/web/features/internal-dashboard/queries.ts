import { createServiceClient } from "@/lib/supabase/server";
import type { FunnelMetrics, FunnelPeriodBucket } from "@/features/funnel/types";
import type { InternalDashboardData } from "./types";

/**
 * Internal Dashboard data — extends the funnel response with per-campaign
 * breakdowns. Mirrors legacy `getDashboardMetrics` response shape exactly.
 * Reuses funnel's date/period helpers but adds campaign axis.
 */

const POSTS_SELECT = [
  "reach_out_date",
  "post_date",
  "workflow_status",
  "collab_type",
  "order_status",
  "onboarded_by",
  "campaign_id",
  "deliverable_index",
].join(",");

const MIN_DATE = new Date("2020-01-01").getTime();
const OVERDUE_DAYS = 15;
const DAY_MS = 86_400_000;

function emptyMetrics(): FunnelMetrics {
  return { r: 0, o: 0, b: 0, d: 0, p: 0, g: 0, pend: 0, overdue: 0 };
}

function emptyData(): InternalDashboardData {
  return {
    totals: emptyMetrics(),
    byMonth: [],
    byWeek: [],
    teams: [],
    byMonthTeam: {},
    byWeekTeam: {},
    byMonthCampaign: {},
    byWeekCampaign: {},
    generatedAt: new Date().toISOString(),
  };
}

function addMetrics(a: FunnelMetrics, b: Partial<FunnelMetrics>): void {
  if (b.r) a.r += b.r;
  if (b.o) a.o += b.o;
  if (b.b) a.b += b.b;
  if (b.d) a.d += b.d;
  if (b.p) a.p += b.p;
  if (b.g) a.g += b.g;
  if (b.pend) a.pend += b.pend;
  if (b.overdue) a.overdue += b.overdue;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const t = new Date(String(value)).getTime();
  if (!Number.isFinite(t) || t < MIN_DATE) return null;
  return new Date(t);
}

function monthKey(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function isoWeekKey(d: Date): string {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * DAY_MS));
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function sortMonthKeysDesc(a: string, b: string): number {
  return new Date(`${b} 01`).getTime() - new Date(`${a} 01`).getTime();
}

function statusKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function fetchInternalDashboardData(): Promise<InternalDashboardData> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(POSTS_SELECT)
    .limit(10_000);
  if (error) {
    console.error("[internal-dashboard] posts query failed:", error);
    return emptyData();
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const now = Date.now();

  const totals = emptyMetrics();
  const byMonth = new Map<string, FunnelMetrics>();
  const byWeek = new Map<string, FunnelMetrics>();
  const byMonthTeam: Record<string, Record<string, FunnelMetrics>> = {};
  const byWeekTeam: Record<string, Record<string, FunnelMetrics>> = {};
  const byMonthCampaign: Record<string, Record<string, FunnelMetrics>> = {};
  const byWeekCampaign: Record<string, Record<string, FunnelMetrics>> = {};
  const teamsSet = new Set<string>();

  function bumpTeam(
    map: Record<string, Record<string, FunnelMetrics>>,
    periodKey: string,
    key: string,
    delta: Partial<FunnelMetrics>,
  ) {
    if (!map[periodKey]) map[periodKey] = {};
    if (!map[periodKey][key]) map[periodKey][key] = emptyMetrics();
    addMetrics(map[periodKey][key], delta);
  }

  for (const row of rows) {
    const status = statusKey(row.workflow_status);
    const collab = statusKey(row.collab_type);
    const orderStatus = statusKey(row.order_status);
    const team = String(row.onboarded_by ?? "").trim();
    const campaign = String(row.campaign_id ?? "").trim();
    const isParent =
      row.deliverable_index == null || Number(row.deliverable_index) === 1;
    if (team) teamsSet.add(team);

    const reachDate = parseDate(row.reach_out_date);
    const postDate = parseDate(row.post_date);

    // Parent-only cohort metrics (matches funnel rule).
    if (reachDate && isParent) {
      const isOnboarded = status !== "" && status !== "reach out";
      const isGhost = status.includes("ghost");
      const isBarter = collab === "barter";
      const isDelivered = orderStatus === "delivered";
      const isPosted = !!postDate;
      const isPend = isOnboarded && !isPosted && !isGhost;
      const daysSinceReach = (now - reachDate.getTime()) / DAY_MS;
      const isOverdue = isPend && daysSinceReach > OVERDUE_DAYS;

      const delta: Partial<FunnelMetrics> = {
        r: 1,
        ...(isOnboarded ? { o: 1 } : null),
        ...(isBarter ? { b: 1 } : null),
        ...(isDelivered ? { d: 1 } : null),
        ...(isGhost ? { g: 1 } : null),
        ...(isPend ? { pend: 1 } : null),
        ...(isOverdue ? { overdue: 1 } : null),
      };
      addMetrics(totals, delta);

      const mKey = monthKey(reachDate);
      const wKey = isoWeekKey(reachDate);
      if (!byMonth.has(mKey)) byMonth.set(mKey, emptyMetrics());
      if (!byWeek.has(wKey)) byWeek.set(wKey, emptyMetrics());
      addMetrics(byMonth.get(mKey)!, delta);
      addMetrics(byWeek.get(wKey)!, delta);

      if (team) {
        bumpTeam(byMonthTeam, mKey, team, delta);
        bumpTeam(byWeekTeam, wKey, team, delta);
      }
      if (campaign) {
        bumpTeam(byMonthCampaign, mKey, campaign, delta);
        bumpTeam(byWeekCampaign, wKey, campaign, delta);
      }
    }

    // Posted bucketed by post_date (per-deliverable).
    if (postDate) {
      const delta: Partial<FunnelMetrics> = { p: 1 };
      addMetrics(totals, delta);
      const mKey = monthKey(postDate);
      const wKey = isoWeekKey(postDate);
      if (!byMonth.has(mKey)) byMonth.set(mKey, emptyMetrics());
      if (!byWeek.has(wKey)) byWeek.set(wKey, emptyMetrics());
      addMetrics(byMonth.get(mKey)!, delta);
      addMetrics(byWeek.get(wKey)!, delta);
      if (team) {
        bumpTeam(byMonthTeam, mKey, team, delta);
        bumpTeam(byWeekTeam, wKey, team, delta);
      }
      if (campaign) {
        bumpTeam(byMonthCampaign, mKey, campaign, delta);
        bumpTeam(byWeekCampaign, wKey, campaign, delta);
      }
    }
  }

  const monthBuckets: FunnelPeriodBucket[] = [...byMonth.keys()]
    .sort(sortMonthKeysDesc)
    .map((key) => ({ key, label: key, metrics: byMonth.get(key)! }));
  const weekBuckets: FunnelPeriodBucket[] = [...byWeek.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: key, metrics: byWeek.get(key)! }));

  return {
    totals,
    byMonth: monthBuckets,
    byWeek: weekBuckets,
    teams: [...teamsSet].sort(),
    byMonthTeam,
    byWeekTeam,
    byMonthCampaign,
    byWeekCampaign,
    generatedAt: new Date().toISOString(),
  };
}
