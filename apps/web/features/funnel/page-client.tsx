"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  Ghost,
  Hourglass,
  Instagram,
  PackageCheck,
  RefreshCw,
  Send,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
export function FunnelBody({ data }: { data: FunnelData }) {
  const router = useRouter();
  const [mode, setMode] = useState<FunnelPeriodMode>("month");
  const [team, setTeam] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

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

  // Today's activity by team — same-day reach_out_date / post_date hits.
  // Mirrors legacy `byMonthTeam[currentMonth]` slice.
  const todayKey =
    mode === "month"
      ? new Date().toLocaleString("en-US", { month: "short", year: "numeric" })
      : "";
  const todayByTeam: Record<string, FunnelMetrics> | undefined =
    mode === "month" ? data.byMonthTeam[todayKey] : undefined;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden sm:gap-5">
      <FilterRow
        mode={mode}
        team={team}
        teams={data.teams}
        onModeChange={setMode}
        onTeamChange={setTeam}
        onRefresh={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 600);
        }}
        refreshing={refreshing}
      />

      <KpiStrip totals={totals} />

      <FunnelChart totals={totals} />

      <PeriodTable
        mode={mode}
        buckets={filteredBuckets}
        generatedAt={data.generatedAt}
      />

      {todayByTeam && Object.keys(todayByTeam).length > 0 && (
        <TodayActivity entries={todayByTeam} />
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
  onRefresh,
  refreshing,
}: {
  mode: FunnelPeriodMode;
  team: string;
  teams: string[];
  onModeChange: (mode: FunnelPeriodMode) => void;
  onTeamChange: (team: string) => void;
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
        <div className="onboarding-filter-actions">
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

function KpiStrip({ totals }: { totals: FunnelMetrics }) {
  const cards: Array<{
    label: string;
    value: number;
    tone: "accent" | "info" | "warning" | "success" | "muted" | "danger";
    icon: React.ReactNode;
    secondary: string;
  }> = [
    {
      label: "Reach",
      value: totals.r,
      tone: "info",
      icon: <Send size={16} aria-hidden />,
      secondary: "contacted",
    },
    {
      label: "Onboarded",
      value: totals.o,
      tone: "info",
      icon: <Users size={16} aria-hidden />,
      secondary: "onboarding complete",
    },
    {
      label: "Barter",
      value: totals.b,
      tone: "warning",
      icon: <PackageCheck size={16} aria-hidden />,
      secondary: "barter sent",
    },
    {
      label: "Delivered",
      value: totals.d,
      tone: "success",
      icon: <Truck size={16} aria-hidden />,
      secondary: "orders delivered",
    },
    {
      label: "Ghosted",
      value: totals.g,
      tone: "muted",
      icon: <Ghost size={16} aria-hidden />,
      secondary: "no response",
    },
    {
      label: "Pending",
      value: totals.pend,
      tone: "warning",
      icon: <Hourglass size={16} aria-hidden />,
      secondary: "awaiting action",
    },
    {
      label: "Overdue",
      value: totals.overdue,
      tone: "danger",
      icon: <AlertTriangle size={16} aria-hidden />,
      secondary: "needs attention",
    },
    {
      label: "All Posted",
      value: totals.p,
      tone: "info",
      icon: <Instagram size={16} aria-hidden />,
      secondary: "posted content",
    },
    {
      label: "Curated Posted",
      value: totals.p,
      tone: "success",
      icon: <ShieldCheck size={16} aria-hidden />,
      secondary: "curated set",
    },
  ];
  return (
    <div className="acc-kpi-grid funnel-kpi-grid">
      {cards.map((c) => (
        <article key={c.label} className={`acc-kpi acc-kpi--${c.tone}`}>
          <div className="acc-kpi__head">
            <span className="acc-kpi__icon" aria-hidden>
              {c.icon}
            </span>
            <span className="acc-kpi__label">{c.label}</span>
          </div>
          <div className="acc-kpi__primary tabular">{c.value}</div>
          <div className="acc-kpi__secondary">{c.secondary}</div>
        </article>
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
      <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:rounded-2xl sm:p-4">
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
    <section className="flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[0.7rem] sm:text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Period Breakdown
        </h2>
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
}: {
  entries: Record<string, FunnelMetrics>;
}) {
  const rows = Object.entries(entries)
    .map(([user, m]) => ({ user, ...m }))
    .sort((a, b) => b.r + b.o + b.p - (a.r + a.o + a.p));
  return (
    <section className="flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[0.7rem] sm:text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Today's Activity by Team Member
        </h2>
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
                  {r.user}
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
