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

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";

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

