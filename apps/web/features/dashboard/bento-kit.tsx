"use client";

/**
 * Bento kit — DAM-grade dashboard primitives ported to CreatorHub
 * (source pattern: Workflow Optimizer `components/dashboard/bento-kit.tsx`).
 *
 * Differences from the DAM original, on purpose:
 *   - CSS motion (`.bento-tile` / `.bento-stagger` in globals.css) instead of
 *     framer-motion — no new dependency, transform/opacity only, one-shot.
 *   - `CountUp` (components/ui/count-up.tsx) instead of DAM's useCountUp.
 *   - CreatorHub palette: gold #F0C61E stays CTA-only; series/status colors
 *     use the sanctioned secondary accents (indigo/purple/success/warning).
 *
 * Everything here is presentational — values arrive computed; no analytics
 * logic lives in this file.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import type { ActivityPoint } from "./types";

export const pctOf = (n: number, d: number): number =>
  d > 0 ? Math.round((n / d) * 100) : 0;

/** Stage series palette — matches the workflow's existing stage hues. */
export const STAGE_SERIES = [
  { key: "reachOut", label: "Reach Out", color: "#3B6FD4" },
  { key: "onboarded", label: "Onboarded", color: "#7B4FBF" },
  { key: "posted", label: "Posted", color: "#4F7C4D" },
] as const;

// ── tile scaffolding ─────────────────────────────────────────────────────────

/** Lightweight ⓘ — native tooltip (title), keyboard-focusable. */
export function InfoDot({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      role="note"
      aria-label={text}
      title={text}
      className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full text-text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <Info size={12} aria-hidden />
    </span>
  );
}

export function TileHead({
  icon,
  children,
  info,
  right,
}: {
  icon?: ReactNode;
  children: ReactNode;
  info?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      {icon && <span className="text-text-tertiary">{icon}</span>}
      <span className="text-[0.66rem] font-bold uppercase tracking-[0.07em] text-text-secondary">
        {children}
      </span>
      {info && <InfoDot text={info} />}
      {right && <span className="ml-auto min-w-0">{right}</span>}
    </div>
  );
}

/** Glass tooltip for every recharts surface (per design-system glass spec). */
export function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[12px] border border-[rgba(255,255,255,0.55)] bg-[rgba(255,252,248,0.92)] px-3 py-2 text-[12px] shadow-[0_4px_24px_rgba(180,150,120,0.18)] backdrop-blur-[12px]">
      {label && (
        <div className="mb-1 font-semibold text-text-primary">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-text-secondary">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-text-primary">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── hero KPI tile (top accent bar + tinted corner + count-up) ────────────────

export function HeroKpi({
  color,
  icon,
  label,
  value,
  suffix,
  sub,
  info,
  rupees = false,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  value: number;
  suffix?: string;
  sub: string;
  info?: string;
  /** ₹ compact formatting (en-IN grouping) for spend tiles. */
  rupees?: boolean;
}) {
  return (
    <div className="bento-tile relative overflow-hidden rounded-[16px] border border-border bg-bg-white p-3.5">
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.10]"
        style={{ background: color }}
        aria-hidden
      />
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: color }}
        aria-hidden
      />
      <div className="mb-2 flex items-center gap-1.5 text-text-secondary">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-[8px]"
          style={{ background: `${color}1A`, color }}
        >
          {icon}
        </span>
        <span className="truncate text-[0.64rem] font-bold uppercase tracking-[0.05em]">
          {label}
        </span>
        {info && <InfoDot text={info} />}
      </div>
      <div className="text-[1.7rem] font-bold leading-none tracking-[-0.01em] tabular-nums text-text-primary">
        {rupees && "₹"}
        <CountUp
          value={value}
          format={(x) => Math.round(x).toLocaleString("en-IN")}
        />
        {suffix}
      </div>
      <div className="mt-1.5 text-[0.68rem] leading-snug tabular-nums text-text-tertiary">
        {sub}
      </div>
    </div>
  );
}

// ── interactive donut (hover a segment → centre swaps; legend with %) ───────

export interface DonutSeg {
  name: string;
  value: number;
  color: string;
}

export function DonutTile({
  title,
  icon,
  info,
  segs,
  centreLabel,
  emptyHint,
}: {
  title: string;
  icon?: ReactNode;
  info?: string;
  segs: DonutSeg[];
  centreLabel: string;
  emptyHint?: string;
}) {
  const total = segs.reduce((s, x) => s + x.value, 0);
  const [hov, setHov] = useState<number | null>(null);
  const centre = hov != null ? segs[hov] : null;
  return (
    <div className="bento-tile h-full rounded-[16px] border border-border bg-bg-white p-4">
      <TileHead icon={icon} info={info}>
        {title}
      </TileHead>
      {total === 0 ? (
        <div className="grid h-[150px] place-items-center text-[0.78rem] text-text-tertiary">
          {emptyHint ?? "No data in scope yet"}
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-[150px] w-[150px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segs}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive
                  animationDuration={500}
                  onMouseEnter={(_, i) => setHov(i)}
                  onMouseLeave={() => setHov(null)}
                >
                  {segs.map((s, i) => (
                    <Cell
                      key={s.name}
                      fill={s.color}
                      opacity={hov == null || hov === i ? 1 : 0.35}
                      cursor="pointer"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[1.35rem] font-bold leading-none tabular-nums text-text-primary">
                  {centre ? centre.value : total}
                </div>
                <div className="mt-0.5 max-w-[80px] text-[0.6rem] font-semibold uppercase leading-tight tracking-[0.05em] text-text-tertiary">
                  {centre ? centre.name : centreLabel}
                </div>
              </div>
            </div>
          </div>
          <div className="grid min-w-0 flex-1 gap-1.5">
            {segs.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                className={`flex items-center justify-between rounded-[8px] px-1.5 py-0.5 text-left text-[12px] transition-colors ${
                  hov === i ? "bg-bg-surface" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-text-primary">
                  {s.value}
                  <span className="ml-1.5 text-[10px] font-medium text-text-tertiary">
                    {pctOf(s.value, total)}%
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 30-day activity area chart (stacked, legend chips toggle series) ────────

export function ActivityTrendTile({
  daily,
  icon,
  info,
}: {
  daily: ActivityPoint[];
  icon?: ReactNode;
  info?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const data = useMemo(
    () =>
      daily.map((r) => {
        const d = new Date(r.date);
        return {
          ...r,
          label: Number.isNaN(d.getTime())
            ? r.date
            : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        };
      }),
    [daily],
  );
  const empty = daily.every(
    (r) => r.reachOut === 0 && r.onboarded === 0 && r.posted === 0,
  );
  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="bento-tile h-full rounded-[16px] border border-border bg-bg-white p-4">
      <TileHead
        icon={icon}
        info={info}
        right={
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            {STAGE_SERIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                aria-pressed={!hidden.has(s.key)}
                className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold transition-opacity ${
                  hidden.has(s.key) ? "opacity-35" : ""
                }`}
                style={{
                  borderColor: `${s.color}55`,
                  color: s.color,
                  background: `${s.color}12`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: s.color }}
                />
                {s.label}
              </button>
            ))}
          </span>
        }
      >
        Activity — Last 30 Days
      </TileHead>
      {empty ? (
        <p className="grid h-[220px] place-items-center text-[12px] text-text-tertiary">
          No pipeline activity in the last 30 days.
        </p>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 6, right: 4, left: -22, bottom: 0 }}
            >
              <defs>
                {STAGE_SERIES.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`dash-grad-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop
                      offset="100%"
                      stopColor={s.color}
                      stopOpacity={0.04}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#EFE7D8"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10.5, fill: "#9A9384" }}
                tickLine={false}
                axisLine={{ stroke: "#E7E2D2" }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 10.5, fill: "#9A9384" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={<ChartTip />}
                cursor={{ stroke: "#C9A882", strokeDasharray: "3 3" }}
              />
              {STAGE_SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stackId="1"
                  hide={hidden.has(s.key)}
                  stroke={s.color}
                  strokeWidth={1.6}
                  fill={`url(#dash-grad-${s.key})`}
                  isAnimationActive
                  animationDuration={600}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
