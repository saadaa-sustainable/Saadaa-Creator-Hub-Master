"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Compass,
  Gauge,
  HandCoins,
  HourglassIcon,
  Layers3,
  Mail,
  Megaphone,
  PackageCheck,
  PackageX,
  Radio,
  Send,
  ShieldCheck,
  Trophy,
  Truck,
  UserRoundCheck,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/cn";
import {
  formatDate,
  formatFollowers,
  formatNumber,
  formatRupees,
} from "@/lib/formatters";
import {
  ACTION_HREFS,
  type ActionCounts,
  type BreakdownSlice,
  type DashboardData,
  type StageCard,
} from "./types";

type StageKey = keyof DashboardData["stageBoard"];
type SeriesKey = "reachOut" | "onboarded" | "posted";
type ChartMode = "activity" | "monthly";
type BreakdownMode = "content" | "tier";

const SERIES: Array<{
  key: SeriesKey;
  label: string;
  color: string;
}> = [
  { key: "reachOut", label: "Reach Out", color: "#355C7A" },
  { key: "onboarded", label: "Onboarded", color: "#B57514" },
  { key: "posted", label: "Posted", color: "#4F7C4D" },
];

const STAGES: Array<{
  key: StageKey;
  label: string;
  short: string;
  href: string;
  icon: LucideIcon;
  color: string;
  tint: string;
}> = [
  {
    key: "reachOut",
    label: "Reach Out",
    short: "RO",
    href: "/reach-out/outbound",
    icon: Send,
    color: "#355C7A",
    tint: "#ECF3F7",
  },
  {
    key: "onBoard",
    label: "Onboarding",
    short: "OB",
    href: "/onboarding",
    icon: UserRoundCheck,
    color: "#B57514",
    tint: "#FAF1DC",
  },
  {
    key: "posted",
    label: "Posted",
    short: "PO",
    href: "/posting",
    icon: PackageCheck,
    color: "#4F7C4D",
    tint: "#ECF1E9",
  },
  {
    key: "paid",
    label: "Payment",
    short: "PA",
    href: "/accounts-hub",
    icon: Banknote,
    color: "#2C2420",
    tint: "#F0EAD6",
  },
];

const ACTIONS: Array<{
  key: keyof ActionCounts;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: "amber" | "blue" | "green" | "red";
}> = [
  {
    key: "needsEmail",
    label: "Missing email",
    hint: "Onboarding records",
    icon: Mail,
    tone: "amber",
  },
  {
    key: "needsOrder",
    label: "Pending order",
    hint: "Order form gaps",
    icon: PackageX,
    tone: "blue",
  },
  {
    key: "awaitingPost",
    label: "Awaiting post",
    hint: "Creator content due",
    icon: HourglassIcon,
    tone: "amber",
  },
  {
    key: "noTracking",
    label: "No tracking",
    hint: "Shipment visibility",
    icon: Truck,
    tone: "blue",
  },
  {
    key: "noPartnership",
    label: "No partnership",
    hint: "Meta permission",
    icon: HandCoins,
    tone: "green",
  },
  {
    key: "overdue",
    label: "Overdue",
    hint: "Needs escalation",
    icon: AlertTriangle,
    tone: "red",
  },
];

const ACTION_TONE: Record<(typeof ACTIONS)[number]["tone"], string> = {
  amber: "bg-warning-bg text-warning border-warning/25",
  blue: "bg-info-bg text-info border-info/20",
  green: "bg-success-bg text-success border-success/25",
  red: "bg-danger-bg text-danger border-danger/20",
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pctOf(value: number, max: number): number {
  if (max <= 0) return 0;
  return clampPct((value / max) * 100);
}

function compactRupees(value: number): string {
  if (value >= 10000000) return `Rs ${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `Rs ${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `Rs ${(value / 1000).toFixed(1)}k`;
  return `Rs ${Math.round(value)}`;
}

function formatChartValue(value: number | string | undefined): string {
  if (typeof value === "number") return formatNumber(value);
  return value ?? "";
}

function OverviewTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | string;
    color?: string;
    fill?: string;
  }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-[18px] border border-white/70 bg-white/90 px-3.5 py-3 text-[12px] shadow-[0_20px_45px_-24px_rgba(22,21,19,0.38)] backdrop-blur-xl">
      {label !== undefined && (
        <div className="mb-1.5 font-bold text-text-primary">{label}</div>
      )}
      <div className="grid gap-1">
        {payload.map((p, i) => (
          <div
            key={`${p.name ?? "value"}-${i}`}
            className="flex items-center gap-2"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: p.color ?? p.fill ?? "#6E695E" }}
            />
            <span className="text-text-secondary">{p.name}</span>
            <span className="ml-auto pl-5 font-bold tabular-nums text-text-primary">
              {formatChartValue(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  hint,
  right,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-text-secondary">
          <Icon size={13} aria-hidden />
          <span>{label}</span>
        </div>
        {hint && (
          <p className="mt-1 text-[0.72rem] text-text-tertiary">{hint}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[150px] place-items-center rounded-[22px] border border-dashed border-border bg-bg-alt px-5 py-8 text-center text-[0.78rem] text-text-tertiary">
      {children}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  format,
  hint,
  color,
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  format?: (n: number) => string;
  hint: string;
  color: string;
  progress: number;
}) {
  return (
    <article className="overview-kpi-card bento-tile group">
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-[16px] border border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          style={{ background: `${color}15`, color }}
        >
          <Icon size={18} aria-hidden />
        </span>
        <span className="rounded-full border border-border bg-white/70 px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          live
        </span>
      </div>
      <div className="mt-5">
        <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-text-secondary">
          {label}
        </div>
        <div className="mt-1 text-[2rem] font-black leading-none tracking-tight tabular-nums text-text-primary">
          <CountUp value={value} format={format} />
        </div>
        <p className="mt-2 text-[0.76rem] leading-snug text-text-tertiary">
          {hint}
        </p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-muted">
        <span
          className="overview-progress-fill block h-full rounded-full"
          style={{ background: color, width: `${clampPct(progress)}%` }}
        />
      </div>
    </article>
  );
}

function KpiRail({ data }: { data: DashboardData }) {
  const totalPipeline =
    data.pipeline.reachOut + data.pipeline.onboarded + data.pipeline.posted;
  const actionTotal = Object.values(data.actions).reduce(
    (sum, x) => sum + x,
    0,
  );
  const paidPct = pctOf(
    data.campaign.paidCount,
    Math.max(1, data.pipeline.posted),
  );

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.95fr_1.05fr_0.85fr]">
      <KpiCard
        icon={Layers3}
        label="Pipeline load"
        value={totalPipeline}
        hint={`${formatNumber(data.campaign.totalCreators)} creators across ${formatNumber(data.campaign.activeCampaigns)} campaigns`}
        color="#355C7A"
        progress={100}
      />
      <KpiCard
        icon={Gauge}
        label="Conversion"
        value={data.pipeline.conversionPct}
        format={(n) => `${Math.round(n)}%`}
        hint={`${formatNumber(data.pipeline.onboarded)} onboarded from reach-out`}
        color="#B57514"
        progress={data.pipeline.conversionPct}
      />
      <KpiCard
        icon={PackageCheck}
        label="Post rate"
        value={data.pipeline.postRatePct}
        format={(n) => `${Math.round(n)}%`}
        hint={`${formatNumber(data.pipeline.posted)} posted deliverables in scope`}
        color="#4F7C4D"
        progress={data.pipeline.postRatePct}
      />
      <KpiCard
        icon={Zap}
        label="Open actions"
        value={actionTotal}
        hint={`${formatNumber(data.pipeline.paymentPending)} payment-pending, ${formatNumber(data.actions.overdue)} overdue`}
        color="#C0392B"
        progress={100 - paidPct}
      />
    </section>
  );
}

function HeroPanel({ data }: { data: DashboardData }) {
  const steps = [
    {
      label: "Reach Out",
      value: data.workflowFunnel.reachOut,
      color: "#355C7A",
      icon: Send,
    },
    {
      label: "Onboarded",
      value: data.workflowFunnel.onboarded,
      color: "#B57514",
      icon: UserRoundCheck,
    },
    {
      label: "Posted",
      value: data.workflowFunnel.posted,
      color: "#4F7C4D",
      icon: PackageCheck,
    },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  const total =
    data.pipeline.reachOut + data.pipeline.onboarded + data.pipeline.posted;

  return (
    <section className="overview-hero bento-tile">
      <div className="relative grid gap-8 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <span className="overview-live-dot" aria-hidden />
            Overview command center
          </div>
          <h2 className="mt-5 max-w-[14ch] text-[2.4rem] font-black leading-[0.94] tracking-tight text-text-primary sm:text-[3.05rem]">
            Creator pipeline operating map.
          </h2>
          <p className="mt-4 max-w-[62ch] text-[0.94rem] leading-relaxed text-text-secondary">
            A live read on reach-out, onboarding, posting, spend, and payment
            readiness for the selected dashboard scope.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Active campaigns",
                value: data.campaign.activeCampaigns,
                icon: Megaphone,
              },
              {
                label: "Total collabs",
                value: total,
                icon: Users,
              },
              {
                label: "Ad winners",
                value: data.pipeline.adWinners,
                icon: Trophy,
              },
              {
                label: "Paid",
                value: data.campaign.paidCount,
                icon: ShieldCheck,
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-[20px] border border-white/70 bg-white/65 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
              >
                <metric.icon
                  size={15}
                  className="mb-3 text-text-tertiary"
                  aria-hidden
                />
                <div className="text-[1.35rem] font-black leading-none tabular-nums text-text-primary">
                  <CountUp value={metric.value} />
                </div>
                <div className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.07em] text-text-tertiary">
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/70 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-text-secondary">
                Funnel velocity
              </div>
              <p className="mt-1 text-[0.72rem] text-text-tertiary">
                Reach-out to posted throughput
              </p>
            </div>
            <div className="rounded-full bg-text-primary px-3 py-1 text-[0.68rem] font-bold text-white">
              {data.pipeline.postRatePct}% post rate
            </div>
          </div>

          <div className="grid gap-3">
            {steps.map((step, index) => (
              <div key={step.label} className="overview-flow-row">
                <div
                  className="grid h-10 w-10 place-items-center rounded-[15px]"
                  style={{ background: `${step.color}16`, color: step.color }}
                >
                  <step.icon size={17} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[0.78rem] font-extrabold text-text-primary">
                      {step.label}
                    </span>
                    <span className="text-[0.78rem] font-black tabular-nums text-text-primary">
                      <CountUp value={step.value} />
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-bg-muted">
                    <span
                      className="overview-progress-fill block h-full rounded-full"
                      style={{
                        width: `${pctOf(step.value, max)}%`,
                        background: step.color,
                        animationDelay: `${index * 80}ms`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.campaignFocus && (
            <div className="mt-5 rounded-[24px] border border-border bg-bg-white/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[0.82rem] font-black text-text-primary">
                    {data.campaignFocus.campaignName ??
                      data.campaignFocus.campaignId}
                  </div>
                  <div className="mt-1 text-[0.7rem] text-text-tertiary">
                    Campaign focus cap progress
                  </div>
                </div>
                <span className="rounded-full bg-warning-bg px-2.5 py-1 text-[0.68rem] font-extrabold tabular-nums text-warning">
                  {pctOf(data.campaignFocus.onboarded, data.campaignFocus.cap)}%
                </span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-bg-muted">
                <span
                  className="overview-progress-fill block h-full rounded-full bg-warning"
                  style={{
                    width: `${pctOf(
                      data.campaignFocus.onboarded,
                      data.campaignFocus.cap,
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[0.68rem]">
                {[
                  ["Reached", data.campaignFocus.reachedOut],
                  ["Onboarded", data.campaignFocus.onboarded],
                  ["Posted", data.campaignFocus.posted],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[14px] bg-bg-surface p-2">
                    <div className="font-black tabular-nums text-text-primary">
                      {value}
                    </div>
                    <div className="mt-0.5 uppercase tracking-[0.06em] text-text-tertiary">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PriorityPanel({ actions }: { actions: ActionCounts }) {
  const ranked = useMemo(
    () =>
      ACTIONS.map((action) => ({ ...action, value: actions[action.key] })).sort(
        (a, b) => b.value - a.value,
      ),
    [actions],
  );
  const total = ranked.reduce((sum, action) => sum + action.value, 0);

  return (
    <section className="overview-surface bento-tile h-full">
      <SectionHeader
        icon={Zap}
        label="Action desk"
        hint="Sorted by live blocker count"
        right={
          <span className="rounded-full border border-border bg-bg-surface px-2.5 py-1 text-[0.68rem] font-black tabular-nums text-text-primary">
            {total}
          </span>
        }
      />

      {total === 0 ? (
        <EmptyPanel>No action blockers in this filtered view.</EmptyPanel>
      ) : (
        <div className="grid gap-2.5">
          {ranked.map((action, index) => (
            <Link
              key={action.key}
              href={ACTION_HREFS[action.key] as never}
              className={cn(
                "group flex min-h-[58px] items-center gap-3 rounded-[20px] border bg-white px-3.5 py-3 transition active:scale-[0.99]",
                ACTION_TONE[action.tone],
                action.value === 0 && "opacity-55",
              )}
            >
              <span className="grid h-9 w-9 place-items-center rounded-[14px] bg-white/65">
                <action.icon size={16} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.82rem] font-black text-text-primary">
                  {action.label}
                </span>
                <span className="block truncate text-[0.68rem] text-text-tertiary">
                  {action.hint}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[1.1rem] font-black tabular-nums text-text-primary">
                  <CountUp value={action.value} />
                </span>
                <ArrowRight
                  size={14}
                  className="text-text-tertiary transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
              <span className="sr-only">Priority {index + 1}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityStudio({ data }: { data: DashboardData }) {
  const [mode, setMode] = useState<ChartMode>("activity");
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  const activity = useMemo(
    () =>
      data.activity30.map((point) => ({
        ...point,
        label: formatDate(point.date, "d MMM"),
      })),
    [data.activity30],
  );
  const monthly = useMemo(
    () =>
      data.monthlyFunnel.map((point) => ({
        ...point,
        label: point.month,
      })),
    [data.monthlyFunnel],
  );
  const activityEmpty = activity.every(
    (point) =>
      point.reachOut === 0 && point.onboarded === 0 && point.posted === 0,
  );
  const monthlyEmpty = monthly.every(
    (point) =>
      point.reachOut === 0 && point.onboarded === 0 && point.posted === 0,
  );
  const empty = mode === "activity" ? activityEmpty : monthlyEmpty;

  const toggleSeries = (key: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="overview-surface bento-tile h-full">
      <SectionHeader
        icon={Activity}
        label="Pipeline graph"
        hint={
          mode === "activity" ? "Daily stage activity" : "Six-month stage trend"
        }
        right={
          <div
            className="overview-segment"
            role="tablist"
            aria-label="Graph mode"
          >
            {[
              ["activity", "30 days"],
              ["monthly", "6 months"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value as ChartMode)}
                className={cn(mode === value && "is-active")}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {SERIES.map((series) => (
          <button
            key={series.key}
            type="button"
            aria-pressed={!hidden.has(series.key)}
            onClick={() => toggleSeries(series.key)}
            className={cn(
              "inline-flex min-h-[30px] items-center gap-2 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold transition active:scale-[0.98]",
              hidden.has(series.key) && "opacity-35",
            )}
            style={{
              borderColor: `${series.color}35`,
              background: `${series.color}10`,
              color: series.color,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: series.color }}
            />
            {series.label}
          </button>
        ))}
      </div>

      <div className="mt-3 h-[300px] min-h-[300px]">
        {empty ? (
          <EmptyPanel>No graph data in this filtered window.</EmptyPanel>
        ) : mode === "activity" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={activity}
              margin={{ top: 16, right: 12, left: -24, bottom: 0 }}
            >
              <defs>
                {SERIES.map((series) => (
                  <linearGradient
                    key={series.key}
                    id={`overview-activity-${series.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={series.color}
                      stopOpacity={0.34}
                    />
                    <stop
                      offset="100%"
                      stopColor={series.color}
                      stopOpacity={0.04}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                stroke="#EEE8DD"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9A9384" }}
                tickLine={false}
                axisLine={{ stroke: "#E7E2D2" }}
                minTickGap={26}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9A9384" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={<OverviewTip />}
                cursor={{ stroke: "#C9C2AE" }}
              />
              {SERIES.map((series) => (
                <Area
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  type="monotone"
                  stackId="pipeline"
                  hide={hidden.has(series.key)}
                  stroke={series.color}
                  strokeWidth={2}
                  fill={`url(#overview-activity-${series.key})`}
                  isAnimationActive
                  animationDuration={650}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={monthly}
              margin={{ top: 16, right: 12, left: -24, bottom: 0 }}
            >
              <CartesianGrid
                stroke="#EEE8DD"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9A9384" }}
                tickLine={false}
                axisLine={{ stroke: "#E7E2D2" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9A9384" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<OverviewTip />} cursor={{ fill: "#F5F1EC" }} />
              {SERIES.map((series, index) => (
                <Bar
                  key={`${series.key}-bar`}
                  dataKey={series.key}
                  name={series.label}
                  hide={hidden.has(series.key)}
                  fill={series.color}
                  radius={[8, 8, 0, 0]}
                  barSize={index === 2 ? 12 : 9}
                  opacity={index === 2 ? 0.9 : 0.42}
                  isAnimationActive
                  animationDuration={650}
                />
              ))}
              <Line
                type="monotone"
                dataKey="posted"
                name="Posted path"
                hide={hidden.has("posted")}
                stroke="#4F7C4D"
                strokeWidth={2.4}
                dot={{ r: 3, strokeWidth: 2, fill: "#FFFFFF" }}
                isAnimationActive
                animationDuration={700}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function ChannelCard({
  label,
  hint,
  icon: Icon,
  accent,
  stats,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  stats: DashboardData["channels"]["inbound"];
}) {
  const max = Math.max(stats.reachOut, stats.onboarded, stats.posted, 1);
  const steps = [
    ["Reach Out", stats.reachOut],
    ["Onboarded", stats.onboarded],
    ["Posted", stats.posted],
  ] as const;

  return (
    <article className="rounded-[26px] border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="inline-flex items-center gap-2 text-[0.7rem] font-extrabold uppercase tracking-[0.08em]"
            style={{ color: accent }}
          >
            <Icon size={14} aria-hidden />
            {label}
          </div>
          <p className="mt-1 text-[0.72rem] text-text-tertiary">{hint}</p>
        </div>
        <div className="text-right">
          <div
            className="text-[1.55rem] font-black leading-none tabular-nums"
            style={{ color: accent }}
          >
            <CountUp
              value={stats.conversionPct}
              format={(n) => `${Math.round(n)}%`}
            />
          </div>
          <div className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.07em] text-text-tertiary">
            converted
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Creators", stats.creators],
          ["Spend", compactRupees(stats.spend)],
          ["Posted", stats.posted],
        ].map(([name, value]) => (
          <div key={name} className="rounded-[16px] bg-bg-surface px-2.5 py-2">
            <div className="truncate text-[0.9rem] font-black tabular-nums text-text-primary">
              {typeof value === "number" ? <CountUp value={value} /> : value}
            </div>
            <div className="mt-0.5 truncate text-[0.58rem] font-bold uppercase tracking-[0.07em] text-text-tertiary">
              {name}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2.5">
        {steps.map(([name, value], index) => (
          <div key={name}>
            <div className="mb-1 flex items-center justify-between text-[0.7rem]">
              <span className="font-bold text-text-secondary">{name}</span>
              <span className="font-bold tabular-nums text-text-primary">
                {value}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
              <span
                className="overview-progress-fill block h-full rounded-full"
                style={{
                  width: `${pctOf(value, max)}%`,
                  background: accent,
                  animationDelay: `${index * 70}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function ChannelMatrix({ data }: { data: DashboardData }) {
  return (
    <section className="overview-surface bento-tile h-full">
      <SectionHeader
        icon={Radio}
        label="Channel mix"
        hint="Inbound and outbound side by side"
      />
      <div className="mt-4 grid gap-3">
        <ChannelCard
          label="Inbound"
          hint="Creators approached us"
          icon={ArrowDownLeft}
          accent="#355C7A"
          stats={data.channels.inbound}
        />
        <ChannelCard
          label="Outbound"
          hint="Team-led reach-outs"
          icon={ArrowUpRight}
          accent="#B57514"
          stats={data.channels.outbound}
        />
      </div>
    </section>
  );
}

function StageCardPreview({
  card,
  stage,
}: {
  card: StageCard;
  stage: (typeof STAGES)[number];
}) {
  return (
    <article className="overview-kanban-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            src={card.profilePic}
            username={card.username}
            name={card.name}
            size={34}
          />
          <div className="min-w-0">
            <div className="truncate text-[0.82rem] font-black text-text-primary">
              {card.name ?? card.username ?? "Unknown creator"}
            </div>
            {card.username && (
              <div className="truncate text-[0.66rem] text-text-tertiary">
                @{card.username}
              </div>
            )}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[0.56rem] font-black uppercase tracking-[0.07em]"
          style={{ background: stage.tint, color: stage.color }}
        >
          {stage.short}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-border bg-bg-surface px-2 py-1 text-[0.58rem] font-bold tabular-nums text-text-secondary">
          {card.postId}
        </span>
        {card.collabId && (
          <span className="rounded-full border border-border bg-bg-surface px-2 py-1 text-[0.58rem] font-bold tabular-nums text-text-secondary">
            {card.collabId}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.66rem]">
        {card.campaign && (
          <>
            <dt className="font-black uppercase tracking-[0.07em] text-text-tertiary">
              Camp
            </dt>
            <dd className="truncate text-right font-bold text-text-secondary">
              {card.campaign}
            </dd>
          </>
        )}
        <dt className="font-black uppercase tracking-[0.07em] text-text-tertiary">
          Date
        </dt>
        <dd className="text-right font-bold tabular-nums text-text-secondary">
          {formatDate(card.date)}
        </dd>
        {card.amount != null && card.amount > 0 && (
          <>
            <dt className="font-black uppercase tracking-[0.07em] text-text-tertiary">
              Amount
            </dt>
            <dd className="text-right font-black tabular-nums text-text-primary">
              {formatRupees(card.amount)}
            </dd>
          </>
        )}
      </dl>

      <footer className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="truncate text-[0.66rem] font-bold text-text-tertiary">
          {card.assignee ?? "Unassigned"}
        </span>
        <span className="rounded-full bg-bg-surface px-2 py-1 text-[0.58rem] font-black uppercase tracking-[0.07em] text-text-secondary">
          {card.stuckLabel}
        </span>
      </footer>
    </article>
  );
}

function StageKanban({ data }: { data: DashboardData }) {
  const [focus, setFocus] = useState<StageKey | "all">("all");

  return (
    <section className="overview-surface bento-tile h-full xl:col-span-8">
      <SectionHeader
        icon={Compass}
        label="Stage kanban"
        hint="Latest cards per stage with full-count badges"
        right={
          <div className="hidden gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => setFocus("all")}
              className={cn("overview-chip", focus === "all" && "is-active")}
            >
              All
            </button>
            {STAGES.map((stage) => (
              <button
                key={stage.key}
                type="button"
                onClick={() => setFocus(stage.key)}
                className={cn(
                  "overview-chip",
                  focus === stage.key && "is-active",
                )}
              >
                {stage.short}
              </button>
            ))}
          </div>
        }
      />

      <div className="mt-4 overflow-x-auto pb-1">
        <div
          className="grid grid-flow-col gap-3"
          style={{ gridAutoColumns: "minmax(260px, 1fr)" }}
        >
          {STAGES.map((stage) => {
            const items = data.stageBoard[stage.key];
            const total = data.stageCounts[stage.key];
            const visible = items.slice(0, 4);
            const more = Math.max(0, total - visible.length);
            const muted = focus !== "all" && focus !== stage.key;
            return (
              <section
                key={stage.key}
                className={cn("overview-stage-column", muted && "opacity-45")}
                style={{ background: stage.tint }}
              >
                <header className="flex items-center justify-between gap-2">
                  <Link
                    href={stage.href as never}
                    className="group inline-flex min-w-0 items-center gap-2"
                  >
                    <span
                      className="grid h-8 w-8 place-items-center rounded-[13px] bg-white"
                      style={{ color: stage.color }}
                    >
                      <stage.icon size={15} aria-hidden />
                    </span>
                    <span className="truncate text-[0.78rem] font-black uppercase tracking-[0.07em] text-text-primary">
                      {stage.label}
                    </span>
                    <ArrowRight
                      size={13}
                      className="text-text-tertiary transition group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[0.68rem] font-black tabular-nums text-text-primary">
                    {total}
                  </span>
                </header>

                <div className="mt-3 grid gap-2.5">
                  {visible.length === 0 ? (
                    <div className="grid min-h-[186px] place-items-center rounded-[20px] border border-dashed border-white/70 bg-white/55 text-[0.72rem] font-bold text-text-tertiary">
                      Nothing waiting here.
                    </div>
                  ) : (
                    visible.map((card) => (
                      <StageCardPreview
                        key={`${stage.key}-${card.postId}-${card.collabId ?? "single"}`}
                        card={card}
                        stage={stage}
                      />
                    ))
                  )}
                </div>

                {more > 0 && (
                  <Link
                    href={stage.href as never}
                    className="mt-3 inline-flex min-h-[34px] items-center justify-center rounded-full bg-white px-3 text-[0.68rem] font-black text-text-secondary transition hover:text-text-primary active:scale-[0.98]"
                  >
                    {more} more
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CreatorOps({ data }: { data: DashboardData }) {
  const teamMax = Math.max(
    1,
    ...data.teamLeaderboard.map((member) => member.onboardings + member.posts),
  );

  return (
    <section className="overview-surface bento-tile h-full xl:col-span-4">
      <SectionHeader
        icon={Trophy}
        label="Creator and team"
        hint="Follower leaders and operator output"
      />

      <div className="mt-4 grid gap-5">
        <div>
          <div className="mb-2 text-[0.66rem] font-black uppercase tracking-[0.08em] text-text-tertiary">
            Top creators
          </div>
          {data.topCreators.length === 0 ? (
            <EmptyPanel>No creators in scope yet.</EmptyPanel>
          ) : (
            <ul className="grid gap-2">
              {data.topCreators.slice(0, 5).map((creator, index) => (
                <li
                  key={creator.username}
                  className="flex items-center gap-2.5 rounded-[18px] border border-border bg-white px-3 py-2.5"
                >
                  <span className="w-5 text-[0.66rem] font-black tabular-nums text-text-tertiary">
                    {index + 1}
                  </span>
                  <Avatar
                    src={creator.profilePic}
                    username={creator.username}
                    name={creator.name}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.78rem] font-black text-text-primary">
                      {creator.name ?? creator.username}
                    </div>
                    <div className="truncate text-[0.64rem] text-text-tertiary">
                      @{creator.username}
                      {creator.category ? ` / ${creator.category}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.78rem] font-black tabular-nums text-text-primary">
                      {formatFollowers(creator.followers)}
                    </div>
                    <div className="text-[0.58rem] text-text-tertiary">
                      {creator.postCount} posts
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 text-[0.66rem] font-black uppercase tracking-[0.08em] text-text-tertiary">
            Team pace
          </div>
          {data.teamLeaderboard.length === 0 ? (
            <EmptyPanel>No team activity in scope.</EmptyPanel>
          ) : (
            <ul className="grid gap-2">
              {data.teamLeaderboard.slice(0, 5).map((member, index) => {
                const total = member.onboardings + member.posts;
                return (
                  <li
                    key={`${member.name}-${index}`}
                    className="rounded-[18px] border border-border bg-white px-3 py-2.5"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-[0.74rem]">
                      <span className="truncate font-black text-text-primary">
                        {member.name}
                      </span>
                      <span className="font-black tabular-nums text-text-secondary">
                        {total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
                      <span
                        className="overview-progress-fill block h-full rounded-full bg-text-primary"
                        style={{ width: `${pctOf(total, teamMax)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[0.62rem] text-text-tertiary">
                      <span>{member.onboardings} onboarded</span>
                      <span>{member.posts} posted</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function BreakdownPanel({ data }: { data: DashboardData }) {
  const [mode, setMode] = useState<BreakdownMode>("content");
  const slices: BreakdownSlice[] =
    mode === "content" ? data.contentBreakdown : data.categoryBreakdown;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const title =
    mode === "content" ? "Content type split" : "Creator tier split";

  return (
    <section className="overview-surface bento-tile h-full xl:col-span-5">
      <SectionHeader
        icon={Layers3}
        label="Portfolio shape"
        hint={title}
        right={
          <div
            className="overview-segment"
            role="tablist"
            aria-label="Breakdown mode"
          >
            {[
              ["content", "Content"],
              ["tier", "Tier"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value as BreakdownMode)}
                className={cn(mode === value && "is-active")}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {total === 0 ? (
        <div className="mt-4">
          <EmptyPanel>No breakdown data in scope.</EmptyPanel>
        </div>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-[190px_1fr]">
          <div className="relative h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={2}
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive
                  animationDuration={650}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.label} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<OverviewTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[1.55rem] font-black leading-none tabular-nums text-text-primary">
                  <CountUp value={total} />
                </div>
                <div className="mt-1 text-[0.62rem] font-black uppercase tracking-[0.08em] text-text-tertiary">
                  total
                </div>
              </div>
            </div>
          </div>

          <div className="grid content-center gap-2">
            {slices.map((slice) => (
              <div
                key={slice.label}
                className="flex items-center justify-between gap-3 rounded-[16px] bg-bg-surface px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: slice.color }}
                  />
                  <span className="truncate text-[0.74rem] font-bold text-text-secondary">
                    {slice.label}
                  </span>
                </span>
                <span className="font-black tabular-nums text-text-primary">
                  {slice.value}
                  <span className="ml-1.5 text-[0.62rem] text-text-tertiary">
                    {pctOf(slice.value, total)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SpendPanel({ data }: { data: DashboardData }) {
  const spendRows = data.spendsPerCampaign.slice(0, 8);
  const spark = data.spotlight.spendSpark.map((point) => ({
    ...point,
    label: formatDate(point.date, "d MMM"),
  }));
  const last7 = data.spotlight.spendSpark
    .slice(-7)
    .reduce((sum, point) => sum + point.value, 0);
  const prev7 = data.spotlight.spendSpark
    .slice(-14, -7)
    .reduce((sum, point) => sum + point.value, 0);
  const delta =
    prev7 === 0
      ? last7 > 0
        ? 100
        : 0
      : Math.round(((last7 - prev7) / prev7) * 100);

  return (
    <section className="overview-surface bento-tile h-full xl:col-span-7">
      <SectionHeader
        icon={CircleDollarSign}
        label="Spend and settlement"
        hint="Commercial amount, recent spend pulse, and paid count"
        right={
          <span className="rounded-full bg-warning-bg px-3 py-1 text-[0.7rem] font-black tabular-nums text-warning">
            {delta >= 0 ? "+" : ""}
            {delta}% 7d
          </span>
        }
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[26px] border border-border bg-white p-4">
          <div className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-text-tertiary">
            Total spend
          </div>
          <div className="mt-2 text-[2rem] font-black leading-none tracking-tight tabular-nums text-text-primary">
            <CountUp
              value={data.spotlight.totalSpend}
              format={(n) => formatRupees(Math.round(n))}
            />
          </div>
          <div className="mt-4 h-[130px]">
            {spark.every((point) => point.value === 0) ? (
              <EmptyPanel>No spend in the recent window.</EmptyPanel>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={spark}
                  margin={{ top: 10, right: 6, left: -26, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="overview-spend-grad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#B57514"
                        stopOpacity={0.32}
                      />
                      <stop
                        offset="100%"
                        stopColor="#B57514"
                        stopOpacity={0.04}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip content={<OverviewTip />} />
                  <Area
                    dataKey="value"
                    name="Spend"
                    type="monotone"
                    stroke="#B57514"
                    strokeWidth={2}
                    fill="url(#overview-spend-grad)"
                    isAnimationActive
                    animationDuration={650}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[0.68rem]">
            <div className="rounded-[16px] bg-bg-surface p-2.5">
              <div className="font-black tabular-nums text-text-primary">
                {formatRupees(last7)}
              </div>
              <div className="mt-0.5 uppercase tracking-[0.07em] text-text-tertiary">
                Last 7d
              </div>
            </div>
            <div className="rounded-[16px] bg-bg-surface p-2.5">
              <div className="font-black tabular-nums text-text-primary">
                {formatRupees(prev7)}
              </div>
              <div className="mt-0.5 uppercase tracking-[0.07em] text-text-tertiary">
                Prev 7d
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-text-tertiary">
                Campaign spend rank
              </div>
              <p className="mt-1 text-[0.72rem] text-text-tertiary">
                Top campaigns by commercial amount
              </p>
            </div>
            <WalletCards size={18} className="text-text-tertiary" aria-hidden />
          </div>
          <div className="h-[255px]">
            {spendRows.length === 0 ? (
              <EmptyPanel>No campaign spend in scope.</EmptyPanel>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={spendRows}
                  layout="vertical"
                  margin={{ top: 4, right: 14, left: 14, bottom: 0 }}
                >
                  <CartesianGrid stroke="#F0EAD6" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={92}
                    tick={{ fontSize: 11, fill: "#6E695E" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={<OverviewTip />}
                    cursor={{ fill: "#F5F1EC" }}
                  />
                  <Bar
                    dataKey="value"
                    name="Spend"
                    fill="#B57514"
                    radius={[0, 10, 10, 0]}
                    barSize={14}
                    isAnimationActive
                    animationDuration={650}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashboardOverviewCommandCenter({
  data,
}: {
  data: DashboardData;
}) {
  return (
    <section className="overview-command-center">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <HeroPanel data={data} />
        <PriorityPanel actions={data.actions} />
      </div>

      <KpiRail data={data} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <ActivityStudio data={data} />
        </div>
        <div className="xl:col-span-5">
          <ChannelMatrix data={data} />
        </div>
        <StageKanban data={data} />
        <CreatorOps data={data} />
        <BreakdownPanel data={data} />
        <SpendPanel data={data} />
      </div>
    </section>
  );
}
