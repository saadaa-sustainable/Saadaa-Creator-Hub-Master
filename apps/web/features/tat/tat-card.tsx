import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TatStats } from "./types";

type Tone = "indigo" | "success" | "warning" | "info";

const TONE: Record<Tone, { bg: string; text: string }> = {
  indigo:  { bg: "rgba(79,70,229,0.12)",   text: "#4f46e5" },
  success: { bg: "rgba(34,197,94,0.12)",   text: "#16a34a" },
  warning: { bg: "rgba(245,158,11,0.12)",  text: "#d97706" },
  info:    { bg: "rgba(59,130,246,0.12)",  text: "#3b82f6" },
};

function healthColor(avg: number): string {
  if (avg <= 14) return "#4F7C4D";
  if (avg <= 30) return "#B57514";
  return "#C0392B";
}

export function TatCard({
  from,
  to,
  stats,
  tone,
  icon: Icon,
}: {
  from: string;
  to: string;
  stats: TatStats;
  tone: Tone;
  icon: LucideIcon;
}) {
  const { bg, text } = TONE[tone];

  if (!stats || stats.count === 0) {
    return (
      <div
        className="bento-tile rounded-2xl p-5 flex flex-col gap-2 border border-dashed border-border"
        style={{ background: "var(--color-bg-surface)" }}
      >
        <div className="flex items-center gap-2.5 mb-1">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: bg, color: text }}
          >
            <Icon size={17} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-text-tertiary leading-tight">
              {from}
            </div>
            <div className="text-[0.74rem] font-bold leading-tight" style={{ color: text }}>
              ↳ {to}
            </div>
          </div>
        </div>
        <div className="text-[0.8rem] italic text-text-tertiary font-medium mt-1">
          No data recorded yet
        </div>
      </div>
    );
  }

  const avg = stats.avg ?? 0;
  const barPct = Math.min(100, Math.round((avg / (stats.max ?? 1)) * 100));

  return (
    <div
      className="bento-tile rounded-2xl border border-border p-5 flex flex-col gap-0"
      style={{ background: "var(--color-bg-white)" }}
    >
      {/* Header */}
      <div className="flex items-flex-start gap-2.5 mb-4">
        <div
          className="w-10 h-10 min-w-[2.5rem] rounded-[11px] flex items-center justify-center"
          style={{ background: bg, color: text }}
        >
          <Icon size={18} aria-hidden />
        </div>
        <div className="min-w-0 pt-0.5">
          <div className="text-[0.66rem] font-extrabold uppercase tracking-[0.06em] text-text-tertiary leading-[1.2]">
            {from}
          </div>
          <div className="text-[0.78rem] font-bold leading-[1.3]" style={{ color: text }}>
            ↳ {to}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-flex-end gap-6 mb-4">
        <div>
          <div
            className="text-[2.4rem] font-black leading-none tabular"
            style={{ color: text }}
          >
            {avg}
          </div>
          <div className="text-[0.62rem] font-bold uppercase tracking-[0.05em] text-text-tertiary mt-0.5">
            Avg days
          </div>
        </div>
        <div className="flex flex-col gap-1 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.62rem] font-bold text-text-tertiary uppercase w-9">Best</span>
            <span className="text-[0.86rem] font-extrabold" style={{ color: "#4F7C4D" }}>
              {stats.min}d
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.62rem] font-bold text-text-tertiary uppercase w-9">Worst</span>
            <span className="text-[0.86rem] font-extrabold" style={{ color: "#C0392B" }}>
              {stats.max}d
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.62rem] font-bold text-text-tertiary uppercase w-9">n</span>
            <span className="text-[0.86rem] font-extrabold text-text-tertiary">
              {stats.count}
            </span>
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div>
        <div
          className="rounded-full overflow-hidden"
          style={{ background: "var(--color-border)", height: "6px" }}
        >
          <div
            className="bento-bar h-full rounded-full"
            style={{ width: `${barPct}%`, background: healthColor(avg) }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[0.6rem] text-text-tertiary">0d</span>
          <span className="text-[0.6rem] text-text-tertiary">{stats.max}d (worst)</span>
        </div>
      </div>
    </div>
  );
}
