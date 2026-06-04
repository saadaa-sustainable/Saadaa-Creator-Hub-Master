import { LineChart } from "lucide-react";
import type { MonthlyPoint } from "../types";

/**
 * Monthly trend — 6 month strip with 3 stacked area lines (RO / OB / Posted).
 * Inline SVG, no chart lib.
 */
export function DashboardMonthlyTrend({ data }: { data: MonthlyPoint[] }) {
  const w = 280;
  const h = 100;
  const padX = 6;
  const padY = 8;
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.reachOut, d.onboarded, d.posted)),
  );
  const step = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;

  const series: Array<{ key: keyof MonthlyPoint; color: string; label: string }> = [
    { key: "reachOut", color: "#3B6FD4", label: "Reach Out" },
    { key: "onboarded", color: "#7B4FBF", label: "Onboard" },
    { key: "posted", color: "#4F7C4D", label: "Posted" },
  ];

  const toPoints = (key: keyof MonthlyPoint): string =>
    data
      .map((d, i) => {
        const x = padX + i * step;
        const y = h - padY - ((d[key] as number) / max) * (h - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <article className="h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <LineChart size={12} aria-hidden /> 6-month Trend
        </span>
        <div className="flex items-center gap-2 text-[0.62rem] font-semibold text-text-tertiary">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </header>
      <div className="flex-1 min-h-[120px]">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
          {series.map((s) => (
            <polyline
              key={s.key}
              points={toPoints(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-[0.6rem] font-semibold text-text-tertiary tabular">
        {data.map((d) => (
          <span key={d.month}>{d.month}</span>
        ))}
      </div>
    </article>
  );
}
