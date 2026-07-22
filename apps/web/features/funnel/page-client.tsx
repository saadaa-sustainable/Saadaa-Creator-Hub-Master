"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  Hourglass,
  Instagram,
  PackageCheck,
  RefreshCw,
  Send,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { Rows3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { HeroKpi, InfoDot } from "@/features/dashboard/bento-kit";
import {
  TeamRowsDrawer,
  type FilterKey,
} from "@/features/team-rows/team-rows-drawer";
import { FunnelChart } from "./funnel-chart";
import type { FunnelData, FunnelMetrics, FunnelPeriodMode } from "./types";

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

/**
 * Layout mirrors legacy `#view-funnel` (Index.html:7657-7779):
 *  - Period + Team selectors + Refresh
 *  - 9-card KPI strip (Reach · Onboarded · Barter · Delivered · Ghosted ·
 *    Pending · Overdue · All Posted · Curated Posted)
 *  - Period Breakdown table (10 cols)
 *  - Performance Funnel chart
 *  - Today's Activity by Team Member
 */
export function FunnelBody({
  data,
  source = "live",
}: {
  data: FunnelData;
  source?: "historic" | "live";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<FunnelPeriodMode>("month");
  const [team, setTeam] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [rowsOpen, setRowsOpen] = useState(false);
  const [drawerStage, setDrawerStage] = useState<FilterKey>("all");
  const [drawerTeam, setDrawerTeam] = useState<string | null>(null);

  const buckets = mode === "month" ? data.byMonth : data.byWeek;
  const teamBuckets = mode === "month" ? data.byMonthTeam : data.byWeekTeam;

  // Apply team filter — substitute each bucket's metrics with the team-scoped
  // breakdown when a team is selected.
  const filteredBuckets = useMemo(
    () =>
      buckets.map((b) => ({
        ...b,
        metrics: team ? (teamBuckets[b.key]?.[team] ?? EMPTY) : b.metrics,
      })),
    [buckets, team, teamBuckets],
  );

  const totals: FunnelMetrics = useMemo(() => {
    if (!team) return data.totals;
    const acc: FunnelMetrics = { ...EMPTY };
    for (const b of filteredBuckets) {
      acc.r += b.metrics.r;
      acc.o += b.metrics.o;
      acc.b += b.metrics.b;
      acc.d += b.metrics.d;
      acc.p += b.metrics.p;
      acc.g += b.metrics.g;
      acc.pend += b.metrics.pend;
      acc.overdue += b.metrics.overdue;
    }
    return acc;
  }, [team, data.totals, filteredBuckets]);

  // This month’s activity by team — the existing monthly reach_out_date /
  // post_date slice. Keep the label honest; stage pages use true today counts.
  const currentMonthKey =
    mode === "month"
      ? new Date().toLocaleString("en-US", { month: "short", year: "numeric" })
      : "";
  const currentMonthByTeam: Record<string, FunnelMetrics> | undefined =
    mode === "month" ? data.byMonthTeam[currentMonthKey] : undefined;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden sm:gap-5">
      <FilterRow
        mode={mode}
        team={team}
        teams={data.teams}
        onModeChange={setMode}
        onTeamChange={setTeam}
        onViewRows={() => {
          setDrawerStage("all");
          setDrawerTeam(null);
          setRowsOpen(true);
        }}
        onRefresh={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 600);
        }}
        refreshing={refreshing}
      />
      {rowsOpen && (
        <TeamRowsDrawer
          team={drawerTeam ?? team}
          teams={data.teams}
          source={source}
          initialStage={drawerStage}
          onClose={() => {
            setRowsOpen(false);
            setDrawerTeam(null);
          }}
        />
      )}

      <KpiStrip
        totals={totals}
        onSelect={(stage) => {
          setDrawerStage(stage);
          setDrawerTeam(null);
          setRowsOpen(true);
        }}
      />

      <FunnelChart totals={totals} />

      <PeriodTable
        mode={mode}
        buckets={filteredBuckets}
        generatedAt={data.generatedAt}
      />

      {currentMonthByTeam && Object.keys(currentMonthByTeam).length > 0 && (
        <TodayActivity
          entries={currentMonthByTeam}
          onSelectTeam={(member) => {
            setDrawerStage("all");
            setDrawerTeam(member);
            setRowsOpen(true);
          }}
        />
      )}
    </div>
  );
}

function FilterRow({
  mode,
  team,
  teams,
  onModeChange,
  onTeamChange,
  onViewRows,
  onRefresh,
  refreshing,
}: {
  mode: FunnelPeriodMode;
  team: string;
  teams: string[];
  onModeChange: (mode: FunnelPeriodMode) => void;
  onTeamChange: (team: string) => void;
  onViewRows: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="onboarding-filter-card" aria-busy={refreshing}>
      <div className="onboarding-filter-grid funnel-filter-grid">
        <label className="onboarding-filter-field">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} aria-hidden /> Period
          </span>
          <SearchableSelect
            value={mode}
            onChange={(v) => onModeChange(v as FunnelPeriodMode)}
            options={[
              { value: "month", label: "Monthly" },
              { value: "week", label: "Weekly (ISO)" },
            ]}
            placeholder="Monthly"
            searchPlaceholder="Search…"
          />
        </label>
        <label className="onboarding-filter-field">
          <span className="inline-flex items-center gap-1">
            <Users size={12} aria-hidden /> Team
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
            title={team ? `View ${team}'s row-level data` : "View all row-level data"}
            className={cn(
              "inline-flex h-[2.85rem] w-full items-center justify-center gap-1.5 rounded-[0.65rem] border px-3 text-[0.82rem] font-extrabold transition-all sm:w-auto",
              "border-[#2C2420] bg-[#2C2420] text-[#F0C61E] hover:shadow-md active:scale-[0.98]",
            )}
          >
            <Rows3 size={14} aria-hidden /> View rows
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={cn(
              "inline-flex h-[2.85rem] w-full items-center justify-center gap-1.5 rounded-[0.65rem] border border-[--accent] bg-[--accent] px-3 text-[0.82rem] font-extrabold text-text-primary transition-all sm:w-auto",
              refreshing
                ? "cursor-wait opacity-70"
                : "hover:shadow-md active:scale-[0.98]",
            )}
          >
            <RefreshCw
              size={14}
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

/**
 * 9-card KPI strip — bento-kit `HeroKpi` tiles inside the shared
 * `.acc-kpi-grid.funnel-kpi-grid` (keeps the 4/5-col desktop layout and the
 * 2-up phone pairing). Colors keep the previous tone semantics:
 * info→indigo, warning→amber, success→green, muted→gray, danger→red.
 */
function KpiStrip({
  totals,
  onSelect,
}: {
  totals: FunnelMetrics;
  /** KPI tile click → open the rows view pre-filtered to that bucket. */
  onSelect?: (stage: FilterKey) => void;
}) {
  const cards: Array<{
    label: string;
    value: number;
    color: string;
    icon: React.ReactNode;
    secondary: string;
    stage: FilterKey;
  }> = [
    {
      label: "Reach",
      value: totals.r,
      color: "#3B6FD4",
      icon: <Send size={14} aria-hidden />,
      secondary: "contacted",
      stage: "all",
    },
    {
      label: "Onboarded",
      value: totals.o,
      color: "#3B6FD4",
      icon: <Users size={14} aria-hidden />,
      secondary: "onboarding complete",
      stage: "onboarded",
    },
    {
      label: "Barter",
      value: totals.b,
      color: "#B57514",
      icon: <PackageCheck size={14} aria-hidden />,
      secondary: "barter sent",
      stage: "barter",
    },
    {
      label: "Delivered",
      value: totals.d,
      color: "#4F7C4D",
      icon: <Truck size={14} aria-hidden />,
      secondary: "orders delivered",
      stage: "delivered",
    },
    {
      label: "Pending",
      value: totals.pend,
      color: "#B57514",
      icon: <Hourglass size={14} aria-hidden />,
      secondary: "awaiting action",
      stage: "due",
    },
    {
      label: "Overdue",
      value: totals.overdue,
      color: "#C0392B",
      icon: <AlertTriangle size={14} aria-hidden />,
      secondary: "needs attention",
      stage: "overdue",
    },
    {
      label: "All Posted",
      value: totals.p,
      color: "#3B6FD4",
      icon: <Instagram size={14} aria-hidden />,
      secondary: "posted content",
      stage: "posted",
    },
    {
      label: "Curated Posted",
      value: totals.p,
      color: "#4F7C4D",
      icon: <ShieldCheck size={14} aria-hidden />,
      secondary: "curated set",
      stage: "posted",
    },
  ];
  return (
    <div className="acc-kpi-grid funnel-kpi-grid bento-stagger">
      {cards.map((c) => (
        <HeroKpi
          key={c.label}
          color={c.color}
          icon={c.icon}
          label={c.label}
          value={c.value}
          sub={c.secondary}
          onClick={onSelect ? () => onSelect(c.stage) : undefined}
        />
      ))}
    </div>
  );
}

function PeriodTable({
  mode,
  buckets,
  generatedAt,
}: {
  mode: FunnelPeriodMode;
  buckets: FunnelData["byMonth"];
  generatedAt: string;
}) {
  if (buckets.length === 0) {
    return (
      <section className="bento-tile min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:rounded-2xl sm:p-4">
        <h2 className="text-[0.7rem] sm:text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Period Breakdown
        </h2>
        <p className="mt-2 text-[0.65rem] sm:text-xs text-text-tertiary">
          No data in this period yet.
        </p>
      </section>
    );
  }
  const lastUpdated = new Date(generatedAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <section className="bento-tile flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <h2 className="text-[0.7rem] sm:text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
            Period Breakdown
          </h2>
          <InfoDot text="Reachouts–Overdue bucket by reach-out date; the Posted columns bucket by post date — the same collab can land in different periods." />
        </span>
        <span className="text-[0.55rem] sm:text-[0.6rem] text-text-tertiary">
          Updated {lastUpdated}
        </span>
      </header>
      <div className="-mx-2.5 max-w-[calc(100%+1.25rem)] overflow-x-auto px-2.5 sm:mx-0 sm:max-w-full sm:px-0">
        <table className="w-full min-w-[640px] text-[0.62rem] sm:min-w-[780px] sm:text-xs">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-center pb-2 px-1.5">
                {mode === "month" ? "Period" : "Week"}
              </th>
              <th className="text-center pb-2 px-1.5">Reachouts</th>
              <th className="text-center pb-2 px-1.5">Onboards</th>
              <th className="text-center pb-2 px-1.5">Barter Sent</th>
              <th className="text-center pb-2 px-1.5">Delivered</th>
              <th className="text-center pb-2 px-1.5">Ghosted</th>
              <th className="text-center pb-2 px-1.5">Pending</th>
              <th className="text-center pb-2 px-1.5">Overdue</th>
              <th className="text-center pb-2 px-1.5">All Period Posted</th>
              <th className="text-center pb-2 px-1.5">Curated Posted</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(({ key, label, metrics }) => (
              <tr
                key={key}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 px-1.5 text-center font-extrabold text-text-primary truncate">
                  {label}
                </td>
                <NumCell value={metrics.r} tone="reach" />
                <NumCell value={metrics.o} tone="onboard" />
                <NumCell value={metrics.b} tone="barter" />
                <NumCell value={metrics.d} tone="delivered" />
                <NumCell value={metrics.g} tone="ghosted" />
                <NumCell value={metrics.pend} tone="pending" />
                <NumCell
                  value={metrics.overdue}
                  tone="overdue"
                  pulse={metrics.overdue > 0}
                />
                <NumCell value={metrics.p} tone="allposted" />
                <NumCell value={metrics.p} tone="curated" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type NumTone =
  | "reach"
  | "onboard"
  | "barter"
  | "posted"
  | "delivered"
  | "ghosted"
  | "pending"
  | "overdue"
  | "allposted"
  | "curated";

const NUM_TONE_CLS: Record<NumTone, string> = {
  reach: "text-warning",
  onboard: "text-[#3B6FD4]",
  barter: "text-warning",
  posted: "text-[#06B6D4]",
  delivered: "text-[#7B4FBF]",
  ghosted: "text-text-tertiary",
  pending: "text-[#B54F7A]",
  overdue: "text-danger",
  allposted: "text-[#06B6D4]",
  curated: "text-success",
};

function NumCell({
  value,
  tone,
  pulse,
}: {
  value: number;
  tone: NumTone;
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
    <td className="py-1.5 px-1.5 text-center tabular relative">
      <span
        className={cn(
          "font-extrabold inline-flex items-center justify-center gap-1",
          NUM_TONE_CLS[tone],
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

function TodayActivity({
  entries,
  onSelectTeam,
}: {
  entries: Record<string, FunnelMetrics>;
  onSelectTeam: (member: string) => void;
}) {
  const rows = Object.entries(entries)
    .map(([user, m]) => ({ user, ...m }))
    .sort((a, b) => b.r + b.o + b.p - (a.r + a.o + a.p));
  return (
    <section className="bento-tile flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <h2 className="text-[0.7rem] sm:text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
            This Month&apos;s Activity by Team Member
          </h2>
          <InfoDot text="Current-month team breakdown — per-member reach-outs, onboards, barters, posts and ghosted counts. Select a member to open their full lifecycle history." />
        </span>
        <span className="text-[0.55rem] sm:text-[0.6rem] text-text-tertiary">
          {rows.length} contributors this month
        </span>
      </header>
      <div className="-mx-2.5 max-w-[calc(100%+1.25rem)] overflow-x-auto px-2.5 sm:mx-0 sm:max-w-full sm:px-0">
        <table className="w-full min-w-[400px] text-[0.62rem] sm:min-w-[440px] sm:text-xs">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-center pb-2 px-1.5">Team Member</th>
              <th className="text-center pb-2 px-1.5">Reach-Outs</th>
              <th className="text-center pb-2 px-1.5">Onboarded</th>
              <th className="text-center pb-2 px-1.5">Barter</th>
              <th className="text-center pb-2 px-1.5">Posted</th>
              <th className="text-center pb-2 px-1.5">Ghosted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.user}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 px-1.5 text-center font-extrabold text-text-primary truncate">
                  <button
                    type="button"
                    className="font-extrabold underline decoration-border underline-offset-2 transition-colors hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                    onClick={() => onSelectTeam(r.user)}
                    title={`Open ${r.user}'s full reach-out, onboarding and posted history`}
                  >
                    {r.user}
                  </button>
                </td>
                <NumCell value={r.r} tone="reach" />
                <NumCell value={r.o} tone="onboard" />
                <NumCell value={r.b} tone="barter" />
                <NumCell value={r.p} tone="posted" />
                <NumCell value={r.g} tone="ghosted" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ratePct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 100);
}
