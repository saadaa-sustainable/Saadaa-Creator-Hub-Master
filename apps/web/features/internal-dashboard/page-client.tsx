"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  Filter,
  Instagram,
  RefreshCw,
  Send,
  Sparkles,
  Trophy,
  Truck,
  UserCheck,
  Users,
  Rows3,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { HeroKpi, InfoDot } from "@/features/dashboard/bento-kit";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FunnelChart } from "@/features/funnel/funnel-chart";
import { TeamRowsDrawer } from "@/features/team-rows/team-rows-drawer";
import type { FunnelMetrics } from "@/features/funnel/types";
import type { InternalDashboardData } from "./types";

const EMPTY: FunnelMetrics = {
  r: 0,
  o: 0,
  b: 0,
  d: 0,
  p: 0,
  g: 0,
  pend: 0,
  overdue: 0,
};

type PeriodMode = "month" | "week";

const TEAM_COLORS = [
  "#3B6FD4",
  "#7B4FBF",
  "#B54F7A",
  "#E8A020",
  "#4F7C4D",
  "#06B6D4",
  "#C0392B",
  "#9A9384",
];

export function InternalDashboardBody({
  data,
  source = "live",
}: {
  data: InternalDashboardData;
  source?: "historic" | "live";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PeriodMode>("month");
  const [month, setMonth] = useState<string>("");
  const [week, setWeek] = useState<string>("");
  const [team, setTeam] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [rowsOpen, setRowsOpen] = useState(false);

  const monthOptions = useMemo(
    () => data.byMonth.map((b) => b.key),
    [data.byMonth],
  );
  const weekOptions = useMemo(
    () => data.byWeek.map((b) => b.key),
    [data.byWeek],
  );

  // Apply filters to compute totals + per-team + per-campaign.
  const scoped = useMemo(() => {
    const isMonth = mode === "month";
    const periodKey = isMonth ? month : week;
    const buckets = isMonth ? data.byMonth : data.byWeek;
    const teamMap = isMonth ? data.byMonthTeam : data.byWeekTeam;
    const campMap = isMonth ? data.byMonthCampaign : data.byWeekCampaign;

    // Totals across all buckets or just the selected period.
    const baseBuckets = periodKey
      ? buckets.filter((b) => b.key === periodKey)
      : buckets;

    const totals: FunnelMetrics = { ...EMPTY };
    for (const b of baseBuckets) addMetrics(totals, b.metrics);

    // Apply team filter on totals if set.
    const filteredTotals: FunnelMetrics = team
      ? (() => {
          const acc: FunnelMetrics = { ...EMPTY };
          for (const b of baseBuckets) {
            const m = teamMap[b.key]?.[team];
            if (m) addMetrics(acc, m);
          }
          return acc;
        })()
      : totals;

    // Per-team rollup for leaderboard.
    const teamRollup = new Map<string, FunnelMetrics>();
    for (const b of baseBuckets) {
      const entry = teamMap[b.key] ?? {};
      for (const [t, m] of Object.entries(entry)) {
        if (team && t !== team) continue;
        if (!teamRollup.has(t)) teamRollup.set(t, { ...EMPTY });
        addMetrics(teamRollup.get(t)!, m);
      }
    }

    // Per-campaign rollup.
    const campaignRollup = new Map<string, FunnelMetrics>();
    for (const b of baseBuckets) {
      const entry = campMap[b.key] ?? {};
      for (const [c, m] of Object.entries(entry)) {
        if (!campaignRollup.has(c)) campaignRollup.set(c, { ...EMPTY });
        addMetrics(campaignRollup.get(c)!, m);
      }
    }

    return {
      totals: filteredTotals,
      periodBuckets: baseBuckets,
      teamRollup: [...teamRollup.entries()]
        .map(([user, metrics]) => ({ user, metrics }))
        .sort((a, b) => scoreOf(b.metrics) - scoreOf(a.metrics)),
      campaignRollup: [...campaignRollup.entries()]
        .map(([campaign, metrics]) => ({ campaign, metrics }))
        .sort((a, b) => scoreOf(b.metrics) - scoreOf(a.metrics)),
    };
  }, [data, mode, month, week, team]);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden sm:gap-5">
      <FilterRow
        mode={mode}
        month={month}
        week={week}
        team={team}
        monthOptions={monthOptions}
        weekOptions={weekOptions}
        teams={data.teams}
        onModeChange={setMode}
        onMonthChange={setMonth}
        onWeekChange={setWeek}
        onTeamChange={setTeam}
        onViewRows={() => setRowsOpen(true)}
        onRefresh={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 600);
        }}
        refreshing={refreshing}
      />
      {rowsOpen && (
        <TeamRowsDrawer
          team={team}
          teams={data.teams}
          source={source}
          onClose={() => setRowsOpen(false)}
        />
      )}

      <KpiStrip totals={scoped.totals} />

      {/* ── Bento layout — desktop 12-col mosaic, mobile 1-col stack ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bento-stagger">
        <div className="lg:col-span-8 min-w-0">
          <FunnelChart totals={scoped.totals} />
        </div>
        <div className="lg:col-span-4 min-w-0">
          <ActivityMix totals={scoped.totals} />
        </div>

        <div className="lg:col-span-7 min-w-0">
          <TeamLeaderboard rows={scoped.teamRollup} />
        </div>
        <div className="lg:col-span-5 min-w-0">
          <StageHealth totals={scoped.totals} />
        </div>

        <div className="lg:col-span-12 min-w-0">
          <PeriodPerformanceTable
            mode={mode}
            buckets={scoped.periodBuckets}
            month={month}
            week={week}
          />
        </div>

        <div className="lg:col-span-6 min-w-0">
          <TeamMatrix rows={scoped.teamRollup} colors={TEAM_COLORS} />
        </div>
        <div className="lg:col-span-6 min-w-0">
          <CampaignPerformance rows={scoped.campaignRollup} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter row — shared shell
// ─────────────────────────────────────────────────────────────────────────────

function FilterRow({
  mode,
  month,
  week,
  team,
  monthOptions,
  weekOptions,
  teams,
  onModeChange,
  onMonthChange,
  onWeekChange,
  onTeamChange,
  onViewRows,
  onRefresh,
  refreshing,
}: {
  mode: PeriodMode;
  month: string;
  week: string;
  team: string;
  monthOptions: string[];
  weekOptions: string[];
  teams: string[];
  onModeChange: (m: PeriodMode) => void;
  onMonthChange: (v: string) => void;
  onWeekChange: (v: string) => void;
  onTeamChange: (v: string) => void;
  onViewRows: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="onboarding-filter-card">
      <div className="onboarding-filter-grid">
        <label className="onboarding-filter-field">
          <span className="inline-flex items-center gap-1">
            <Calendar size={10} aria-hidden /> Period
          </span>
          <SearchableSelect
            value={mode}
            onChange={(v) => onModeChange(v as PeriodMode)}
            options={[
              { value: "month", label: "Monthly" },
              { value: "week", label: "Weekly (ISO)" },
            ]}
            placeholder="Monthly"
            searchPlaceholder="Search…"
          />
        </label>
        {mode === "month" ? (
          <label className="onboarding-filter-field">
            <span className="inline-flex items-center gap-1">
              <Filter size={10} aria-hidden /> Month
            </span>
            <SearchableSelect
              value={month}
              onChange={onMonthChange}
              options={[
                { value: "", label: "All months" },
                ...monthOptions.map((m) => ({ value: m, label: m })),
              ]}
              placeholder="All months"
              searchPlaceholder="Search months…"
            />
          </label>
        ) : (
          <label className="onboarding-filter-field">
            <span className="inline-flex items-center gap-1">
              <Filter size={10} aria-hidden /> Week
            </span>
            <SearchableSelect
              value={week}
              onChange={onWeekChange}
              options={[
                { value: "", label: "All weeks" },
                ...weekOptions.map((w) => ({ value: w, label: w })),
              ]}
              placeholder="All weeks"
              searchPlaceholder="Search weeks…"
            />
          </label>
        )}
        <label className="onboarding-filter-field">
          <span className="inline-flex items-center gap-1">
            <Users size={10} aria-hidden /> Team
          </span>
          <SearchableSelect
            value={team}
            onChange={onTeamChange}
            options={[
              { value: "", label: "All team" },
              ...teams.map((t) => ({ value: t, label: t })),
            ]}
            placeholder="All team"
            searchPlaceholder="Search team…"
          />
        </label>
        <div className="onboarding-filter-actions flex items-center gap-2">
          <button
            type="button"
            onClick={onViewRows}
            title={
              team
                ? `View ${team}'s row-level data`
                : "View all row-level data"
            }
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full text-[0.72rem] font-extrabold border transition-all",
              "bg-[#2C2420] text-[#F0C61E] border-[#2C2420] hover:scale-[1.03] hover:shadow-md active:scale-[0.97]",
            )}
          >
            <Rows3 size={12} aria-hidden /> View rows
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full text-[0.72rem] font-extrabold bg-[--accent] text-text-primary border border-[--accent] transition-all",
              refreshing
                ? "opacity-70 cursor-wait"
                : "hover:scale-[1.03] hover:shadow-md active:scale-[0.97]",
            )}
          >
            <RefreshCw
              size={12}
              aria-hidden
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Strip — bento-kit HeroKpi tiles (DAM-style: top accent bar + tinted
// corner + count-up). Same labels/values/subs as the old .acc-kpi strip;
// hues are semantic — volume indigo, series purple, success green, pending
// amber, risk red (gold stays CTA-only, so no gold here).
// ─────────────────────────────────────────────────────────────────────────────

function KpiStrip({ totals }: { totals: FunnelMetrics }) {
  return (
    <div className="acc-kpi-grid acc-kpi-grid--9 bento-stagger max-[480px]:grid-cols-2!">
      <HeroKpi
        color="#3B6FD4"
        icon={<Send size={14} aria-hidden />}
        label="Reach"
        value={totals.r}
        sub="Total outreach"
      />
      <HeroKpi
        color="#7B4FBF"
        icon={<UserCheck size={14} aria-hidden />}
        label="Onboarded"
        value={totals.o}
        sub={`${pct(totals.o, totals.r)}% of reach`}
      />
      <HeroKpi
        color="#B57514"
        icon={<Sparkles size={14} aria-hidden />}
        label="Barter"
        value={totals.b}
        sub={`${pct(totals.b, totals.o)}% barter mix`}
      />
      <HeroKpi
        color="#4F7C4D"
        icon={<Truck size={14} aria-hidden />}
        label="Delivered"
        value={totals.d}
        sub={`${pct(totals.d, totals.o)}% delivery rate`}
      />
      {/* Ghosted stays neutral grey — matches the Funnel page's Ghosted hue
          (red would read as an actionable failure; ghosting is attrition). */}
      <HeroKpi
        color="#9A9384"
        icon={<Clock size={14} aria-hidden />}
        label="Ghosted"
        value={totals.g}
        sub={totals.g > 0 ? "Lost touch" : "—"}
      />
      <HeroKpi
        color="#B57514"
        icon={<Activity size={14} aria-hidden />}
        label="Pending"
        value={totals.pend}
        sub="Awaiting post"
      />
      <HeroKpi
        color="#C0392B"
        icon={<AlertTriangle size={14} aria-hidden />}
        label="Overdue"
        value={totals.overdue}
        sub=">15 days"
      />
      <HeroKpi
        color="#3B6FD4"
        icon={<Instagram size={14} aria-hidden />}
        label="All Posted"
        value={totals.p}
        sub="Deliverables live"
      />
      <HeroKpi
        color="#4F7C4D"
        icon={<CheckCircle2 size={14} aria-hidden />}
        label="Curated"
        value={totals.p}
        sub={`${pct(totals.p, totals.o)}% post rate`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bento widgets
// ─────────────────────────────────────────────────────────────────────────────

function ActivityMix({ totals }: { totals: FunnelMetrics }) {
  // Pie chart approximated with proportional stacked horizontal bar.
  const segments: Array<{ label: string; value: number; color: string }> = [
    { label: "Reach", value: totals.r, color: "#E8A020" },
    { label: "Onboarded", value: totals.o, color: "#3B6FD4" },
    { label: "Posted", value: totals.p, color: "#06B6D4" },
    { label: "Delivered", value: totals.d, color: "#7B4FBF" },
    { label: "Pending", value: totals.pend, color: "#B54F7A" },
    { label: "Overdue", value: totals.overdue, color: "#C0392B" },
  ].filter((s) => s.value > 0);
  const total = segments.reduce((acc, s) => acc + s.value, 0);

  return (
    <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-2.5">
      <header>
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          Activity Mix
          <InfoDot
            title="Activity Mix"
            text="Shows the current pipeline share in each workflow stage. Each segment is the stage count divided by the combined stage total."
          />
        </h3>
        <p className="text-[0.6rem] text-text-tertiary">
          Share of pipeline across stages
        </p>
      </header>
      {total === 0 ? (
        <p className="text-xs text-text-tertiary">No activity yet.</p>
      ) : (
        <>
          {/* Whole stacked track grows once as one unit — segment shares stay
              exact; animating segments individually would open gaps mid-flight. */}
          <div className="bento-bar flex h-3 rounded-full overflow-hidden">
            {segments.map((s) => (
              <div
                key={s.label}
                style={{
                  background: s.color,
                  width: `${(s.value / total) * 100}%`,
                }}
                title={`${s.label}: ${s.value}`}
              />
            ))}
          </div>
          <ul className="flex flex-col gap-1">
            {segments.map((s) => (
              <li
                key={s.label}
                className="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-2 text-[0.65rem]"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-text-secondary truncate font-bold">
                  {s.label}
                </span>
                <span className="text-text-tertiary tabular text-[0.6rem]">
                  {Math.round((s.value / total) * 100)}%
                </span>
                <span className="text-text-primary tabular font-extrabold w-8 text-right">
                  {s.value}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function StageHealth({ totals }: { totals: FunnelMetrics }) {
  const stages = [
    {
      label: "Onboard Conv",
      num: totals.o,
      den: totals.r,
      hint: "Onboarded of Reach",
    },
    {
      label: "Post Rate",
      num: totals.p,
      den: totals.o,
      hint: "Posted of Onboarded",
    },
    {
      label: "Delivery Rate",
      num: totals.d,
      den: totals.o,
      hint: "Delivered of Onboarded",
    },
    {
      label: "Overdue",
      num: totals.overdue,
      den: totals.pend || totals.o || 0,
      hint: "Overdue of Pending",
      invert: true,
    },
  ];
  return (
    <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-3">
      <header>
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          Stage Health
          <InfoDot text="Bar tone: ≥80% green, ≥50% amber, else red. Overdue is inverted — lower is better (≤5% green, ≤20% amber)." />
        </h3>
        <p className="text-[0.6rem] text-text-tertiary">
          Conversion + timing pulse
        </p>
      </header>
      <ul className="flex flex-col gap-2.5">
        {stages.map((s) => {
          const ratio = s.den > 0 ? s.num / s.den : 0;
          const widthPct = Math.min(100, Math.round(ratio * 100));
          const tone = s.invert
            ? toneInverse(widthPct)
            : toneStandard(widthPct);
          const barCls = {
            success: "bg-success",
            warning: "bg-warning",
            danger: "bg-danger",
          }[tone];
          const textCls = {
            success: "text-success",
            warning: "text-warning",
            danger: "text-danger",
          }[tone];
          return (
            <li key={s.label} className="flex flex-col gap-1 text-[0.7rem]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-extrabold text-text-secondary uppercase tracking-[0.05em] text-[0.6rem]">
                  {s.label}
                </span>
                <span
                  className={cn(
                    "tabular font-extrabold text-base sm:text-lg inline-flex items-baseline gap-1",
                    textCls,
                  )}
                >
                  {s.num}
                  <span className="text-text-tertiary font-bold text-sm">
                    /
                  </span>
                  {s.den}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
                <div
                  className={cn(
                    "bento-bar h-full transition-all duration-500",
                    barCls,
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-[0.55rem] text-text-tertiary">
                {s.hint}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TeamLeaderboard({
  rows,
}: {
  rows: Array<{ user: string; metrics: FunnelMetrics }>;
}) {
  if (rows.length === 0) {
    return (
      <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Team Leaderboard
        </h3>
        <p className="mt-2 text-[0.65rem] text-text-tertiary">
          No team data yet.
        </p>
      </section>
    );
  }
  const top = rows[0];
  const max = Math.max(1, ...rows.map((r) => scoreOf(r.metrics)));
  return (
    <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          <Trophy size={12} aria-hidden /> Team Leaderboard
          <InfoDot text="Score = 5×Posted + 3×Delivered + 1×Onboarded − 2×Overdue" />
        </h3>
        <span className="text-[0.6rem] text-text-tertiary">
          {rows.length} contributors · sorted by score
        </span>
      </header>
      {top && (
        <div className="rounded-xl bg-[#FFF6D4] border border-[--accent]/40 p-2.5 flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[--accent] text-text-primary">
            <Crown size={14} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[0.7rem] font-extrabold text-text-primary truncate">
              {top.user}
            </div>
            <div className="text-[0.58rem] text-text-secondary truncate">
              {top.metrics.r} reach · {top.metrics.o} onboarded ·{" "}
              {top.metrics.p} posted
            </div>
          </div>
          <span className="ml-auto text-[0.75rem] font-extrabold tabular text-text-primary">
            {scoreOf(top.metrics)}
          </span>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, idx) => {
          const score = scoreOf(row.metrics);
          const widthPct = (score / max) * 100;
          return (
            <li
              key={row.user}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 text-[0.7rem]"
            >
              <span className="text-text-tertiary tabular text-[0.62rem] font-extrabold text-center">
                {idx + 1}
              </span>
              <div className="min-w-0 flex flex-col gap-1">
                <span className="font-extrabold text-text-primary truncate text-[0.7rem]">
                  {row.user}
                </span>
                <div className="h-1.5 rounded-full bg-bg-muted overflow-hidden">
                  <div
                    className="bento-bar h-full bg-[--accent] transition-all duration-500"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
              <span className="text-[0.62rem] tabular text-text-secondary whitespace-nowrap">
                <strong className="text-text-primary">{row.metrics.o}</strong> /{" "}
                <strong className="text-success">{row.metrics.p}</strong> ·{" "}
                <strong className="text-danger">{row.metrics.overdue}</strong>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TeamMatrix({
  rows,
}: {
  rows: Array<{ user: string; metrics: FunnelMetrics }>;
  colors?: string[];
}) {
  if (rows.length === 0) {
    return (
      <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          Team Workload
          <InfoDot
            title="Team Workload"
            text="One row per team member, showing their attributed reach-outs, onboarded work, posts, deliveries, ghosted rows, pending work, and overdue work."
          />
        </h3>
        <p className="mt-2 text-[0.65rem] text-text-tertiary">
          No team data yet.
        </p>
      </section>
    );
  }
  return (
    <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          Team Workload
          <InfoDot
            title="Team Workload"
            text="One row per team member, showing their attributed reach-outs, onboarded work, posts, deliveries, ghosted rows, pending work, and overdue work."
          />
        </h3>
        <span className="text-[0.6rem] text-text-tertiary">
          {rows.length} members
        </span>
      </header>
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[560px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Team Member</th>
              <th className="text-center pb-2 px-1.5">Reach</th>
              <th className="text-center pb-2 px-1.5">Onboard</th>
              <th className="text-center pb-2 px-1.5">Barter</th>
              <th className="text-center pb-2 px-1.5">Posted</th>
              <th className="text-center pb-2 px-1.5">Delivered</th>
              <th className="text-center pb-2 px-1.5">Ghosted</th>
              <th className="text-center pb-2 px-1.5">Pend</th>
              <th className="text-center pb-2 pl-1.5">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.user}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3 font-extrabold text-text-primary truncate">
                  {row.user}
                </td>
                <Td value={row.metrics.r} tone="text-warning" />
                <Td value={row.metrics.o} tone="text-[#3B6FD4]" />
                <Td value={row.metrics.b} tone="text-[#E8A020]" />
                <Td value={row.metrics.p} tone="text-[#06B6D4]" />
                <Td value={row.metrics.d} tone="text-[#7B4FBF]" />
                <Td
                  value={row.metrics.g}
                  tone={
                    row.metrics.g > 0 ? "text-danger" : "text-text-tertiary"
                  }
                />
                <Td value={row.metrics.pend} tone="text-[#B54F7A]" />
                <Td
                  value={row.metrics.overdue}
                  tone="text-danger"
                  pulse={row.metrics.overdue > 0}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CampaignPerformance({
  rows,
}: {
  rows: Array<{ campaign: string; metrics: FunnelMetrics }>;
}) {
  if (rows.length === 0) {
    return (
      <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          Campaign Performance
          <InfoDot
            title="Campaign Performance"
            text="One row per campaign with counts at each key stage. It helps compare volume and progress, not ad performance."
          />
        </h3>
        <p className="mt-2 text-[0.65rem] text-text-tertiary">
          No campaign data yet.
        </p>
      </section>
    );
  }
  return (
    <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          Campaign Performance
          <InfoDot
            title="Campaign Performance"
            text="One row per campaign with counts at each key stage. It helps compare volume and progress, not ad performance."
          />
        </h3>
        <span className="text-[0.6rem] text-text-tertiary">
          {rows.length} campaigns
        </span>
      </header>
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[480px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Campaign</th>
              <th className="text-center pb-2 px-1.5">Reach</th>
              <th className="text-center pb-2 px-1.5">Onboard</th>
              <th className="text-center pb-2 px-1.5">Posted</th>
              <th className="text-center pb-2 px-1.5">Delivered</th>
              <th className="text-center pb-2 pl-1.5">Pend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.campaign}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3 font-extrabold text-text-primary truncate">
                  {r.campaign}
                </td>
                <Td value={r.metrics.r} tone="text-warning" />
                <Td value={r.metrics.o} tone="text-[#3B6FD4]" />
                <Td value={r.metrics.p} tone="text-[#06B6D4]" />
                <Td value={r.metrics.d} tone="text-[#7B4FBF]" />
                <Td value={r.metrics.pend} tone="text-[#B54F7A]" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PeriodPerformanceTable({
  mode,
  buckets,
  month,
  week,
}: {
  mode: PeriodMode;
  buckets: Array<{ key: string; label: string; metrics: FunnelMetrics }>;
  month: string;
  week: string;
}) {
  if (buckets.length === 0) {
    return (
      <section className="bento-tile rounded-2xl bg-bg-white border border-border p-3 sm:p-4">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          {mode === "month" ? "Monthly" : "Weekly"} Performance
          <InfoDot
            title={`${mode === "month" ? "Monthly" : "Weekly"} Performance`}
            text="Groups workflow activity by the selected month or week so changes in team output and overdue workload can be compared over time."
          />
        </h3>
        <p className="mt-2 text-[0.65rem] text-text-tertiary">
          No data in this period.
        </p>
      </section>
    );
  }
  return (
    <section className="bento-tile rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-2.5">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          {mode === "month" ? "Monthly" : "Weekly"} Performance
          <InfoDot
            title={`${mode === "month" ? "Monthly" : "Weekly"} Performance`}
            text="Groups workflow activity by the selected month or week so changes in team output and overdue workload can be compared over time."
          />
        </h3>
        <span className="text-[0.6rem] text-text-tertiary">
          {month || week
            ? `Filtered: ${month || week}`
            : `${buckets.length} ${mode === "month" ? "months" : "weeks"}`}
        </span>
      </header>
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[640px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">
                {mode === "month" ? "Month" : "Week"}
              </th>
              <th className="text-center pb-2 px-1.5">Reach</th>
              <th className="text-center pb-2 px-1.5">Onboard</th>
              <th className="text-center pb-2 px-1.5">Barter</th>
              <th className="text-center pb-2 px-1.5">Posted</th>
              <th className="text-center pb-2 px-1.5">Delivered</th>
              <th className="text-center pb-2 px-1.5">Ghosted</th>
              <th className="text-center pb-2 px-1.5">Pending</th>
              <th className="text-center pb-2 pl-1.5">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr
                key={b.key}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3 font-extrabold text-text-primary truncate">
                  {b.label}
                </td>
                <Td value={b.metrics.r} tone="text-warning" />
                <Td value={b.metrics.o} tone="text-[#3B6FD4]" />
                <Td value={b.metrics.b} tone="text-[#E8A020]" />
                <Td value={b.metrics.p} tone="text-[#06B6D4]" />
                <Td value={b.metrics.d} tone="text-[#7B4FBF]" />
                <Td
                  value={b.metrics.g}
                  tone={b.metrics.g > 0 ? "text-danger" : "text-text-tertiary"}
                />
                <Td value={b.metrics.pend} tone="text-[#B54F7A]" />
                <Td
                  value={b.metrics.overdue}
                  tone="text-danger"
                  pulse={b.metrics.overdue > 0}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Td({
  value,
  tone,
  pulse,
}: {
  value: number;
  tone: string;
  pulse?: boolean;
}) {
  if (value === 0) {
    return (
      <td className="py-1.5 px-1.5 text-center tabular text-text-tertiary">
        —
      </td>
    );
  }
  return (
    <td className="py-1.5 px-1.5 text-center tabular">
      <span
        className={cn(
          "font-extrabold inline-flex items-center justify-center gap-1",
          tone,
        )}
      >
        {pulse && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-danger animate-pulse" />
        )}
        {value}
      </span>
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function addMetrics(a: FunnelMetrics, b: FunnelMetrics): void {
  a.r += b.r;
  a.o += b.o;
  a.b += b.b;
  a.d += b.d;
  a.p += b.p;
  a.g += b.g;
  a.pend += b.pend;
  a.overdue += b.overdue;
}

function scoreOf(m: FunnelMetrics): number {
  // Weighted activity score — posted/delivered count most, overdue subtracts.
  return m.p * 5 + m.d * 3 + m.o * 1 - m.overdue * 2;
}

function pct(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 100);
}

function toneStandard(pct: number): "success" | "warning" | "danger" {
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "danger";
}

function toneInverse(pct: number): "success" | "warning" | "danger" {
  if (pct <= 5) return "success";
  if (pct <= 20) return "warning";
  return "danger";
}
