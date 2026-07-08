import { createServiceClient } from "@/lib/supabase/server";
import { isVoidedStatus } from "@/lib/workflow";
import type { FunnelData, FunnelMetrics, FunnelPeriodBucket } from "./types";

const POSTS_SELECT = [
  "reach_out_date",
  "post_date",
  "workflow_status",
  "collab_type",
  "order_status",
  "onboarded_by",
  "logged_by",
  "campaign_id",
  "deliverable_index",
  "post_link",
].join(",");

const MIN_DATE = new Date("2020-01-01").getTime();
const OVERDUE_DAYS = 15;
const DAY_MS = 86_400_000;

function emptyMetrics(): FunnelMetrics {
  return { r: 0, o: 0, b: 0, d: 0, p: 0, g: 0, pend: 0, overdue: 0 };
}

function emptyFunnelData(): FunnelData {
  return {
    totals: emptyMetrics(),
    byMonth: [],
    byWeek: [],
    teams: [],
    byMonthTeam: {},
    byWeekTeam: {},
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

/**
 * ISO-8601 week label "YYYY-Www". Monday start, Thursday anchor.
 * Direct port of legacy `_isoWeek` (InfluencerBackend.js:11661-11675).
 */
function isoWeekKey(d: Date): string {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Move to Thursday of the current ISO week.
  const dayNum = (dt.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  // First Thursday of the year.
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * DAY_MS));
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function sortMonthKeysDesc(a: string, b: string): number {
  const am = new Date(`${a} 01`).getTime();
  const bm = new Date(`${b} 01`).getTime();
  return bm - am;
}

function sortWeekKeysDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function statusKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param tableName  Posts corpus to read. Defaults to the live `posts` table so
 *                   the Funnel tab is unchanged. Historic Analytics passes
 *                   `historic_posts_dash` to funnel the migrated archive.
 */
export async function fetchFunnelData(
  tableName = "posts",
): Promise<FunnelData> {
  const supabase = createServiceClient();

  const { data, error } = await (supabase as any)
    .from(tableName)
    .select(POSTS_SELECT)
    .limit(50_000);

  if (error) {
    console.error("[funnel] posts query failed:", error);
    return emptyFunnelData();
  }

  // Voided (offboarded) collabs are excluded from the funnel.
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(
    (p) => !isVoidedStatus(p.workflow_status as string | null),
  );
  const now = Date.now();

  const totals: FunnelMetrics = emptyMetrics();
  const byMonth = new Map<string, FunnelMetrics>();
  const byWeek = new Map<string, FunnelMetrics>();
  const byMonthTeam: Record<string, Record<string, FunnelMetrics>> = {};
  const byWeekTeam: Record<string, Record<string, FunnelMetrics>> = {};
  const teamsSet = new Set<string>();

  function bumpTeamBucket(
    map: Record<string, Record<string, FunnelMetrics>>,
    periodKey: string,
    team: string,
    delta: Partial<FunnelMetrics>,
  ) {
    if (!map[periodKey]) map[periodKey] = {};
    if (!map[periodKey][team]) map[periodKey][team] = emptyMetrics();
    addMetrics(map[periodKey][team], delta);
  }

  for (const row of rows) {
    const status = statusKey(row.workflow_status);
    const collab = statusKey(row.collab_type);
    const orderStatus = statusKey(row.order_status);
    // Team = row owner (sheet CALLOUT BY = logged_by, always set). onboarded_by
    // is only set on onboarded rows since 2026-07-08, so keying on it here
    // under-counted every team member (Vijaydeep 228 vs ~2,052 reach-outs).
    const team = String(row.logged_by ?? row.onboarded_by ?? "").trim();
    const isParent =
      row.deliverable_index == null || Number(row.deliverable_index) === 1;
    if (team) teamsSet.add(team);

    const reachDate = parseDate(row.reach_out_date);
    const postDate = parseDate(row.post_date);
    // "Posted" = the creator published content = a LINK TO POST exists (the
    // sheet's truth), OR the workflow reached Posted/Delivered. post_date alone
    // under-counts — many posted rows carry a link/status but no date recorded.
    const hasLink =
      typeof row.post_link === "string" && row.post_link.trim() !== "";
    const isPostedRow =
      hasLink ||
      status.includes("posted") ||
      status.includes("delivered") ||
      !!postDate;

    // ── Reach-out cohort metrics — PARENT-ONLY (one collab = 1) ─────────
    // r, o, b, d, g, pend, overdue all bucket the collab, not its deliverables.
    if (reachDate && isParent) {
      const isOnboarded = status !== "" && status !== "reach out";
      const isGhost = status.includes("ghost");
      const isBarter = collab === "barter";
      const isDelivered = orderStatus === "delivered";
      const isPosted = isPostedRow;
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
        bumpTeamBucket(byMonthTeam, mKey, team, delta);
        bumpTeamBucket(byWeekTeam, wKey, team, delta);
      }
    }

    // ── Posted metric — PER-DELIVERABLE (each posted deliverable counts) ──
    // Counted by isPostedRow (link/status/date), bucketed by post_date when
    // present, else the reach-out date so link-without-date rows still land in
    // a team/month bucket (the per-team headline sums those buckets).
    const postBucketDate = postDate ?? reachDate;
    if (isPostedRow && postBucketDate) {
      const delta: Partial<FunnelMetrics> = { p: 1 };
      addMetrics(totals, delta);

      const mKey = monthKey(postBucketDate);
      const wKey = isoWeekKey(postBucketDate);
      if (!byMonth.has(mKey)) byMonth.set(mKey, emptyMetrics());
      if (!byWeek.has(wKey)) byWeek.set(wKey, emptyMetrics());
      addMetrics(byMonth.get(mKey)!, delta);
      addMetrics(byWeek.get(wKey)!, delta);

      if (team) {
        bumpTeamBucket(byMonthTeam, mKey, team, delta);
        bumpTeamBucket(byWeekTeam, wKey, team, delta);
      }
    }
  }

  const monthBuckets: FunnelPeriodBucket[] = [...byMonth.keys()]
    .sort(sortMonthKeysDesc)
    .map((key) => ({ key, label: key, metrics: byMonth.get(key)! }));

  const weekBuckets: FunnelPeriodBucket[] = [...byWeek.keys()]
    .sort(sortWeekKeysDesc)
    .map((key) => ({ key, label: key, metrics: byWeek.get(key)! }));

  return {
    totals,
    byMonth: monthBuckets,
    byWeek: weekBuckets,
    teams: [...teamsSet].sort(),
    byMonthTeam,
    byWeekTeam,
    generatedAt: new Date().toISOString(),
  };
}
