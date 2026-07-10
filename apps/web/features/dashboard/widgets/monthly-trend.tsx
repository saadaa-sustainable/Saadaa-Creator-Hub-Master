import { LineChart } from "lucide-react";
import { InfoDot } from "../bento-kit";
import type { MonthlyPoint } from "../types";

type TrendKey = "reachOut" | "onboarded" | "posted";

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
  const hasData = data.some(
    (d) => d.reachOut > 0 || d.onboarded > 0 || d.posted > 0,
  );

  const series: Array<{ key: TrendKey; color: string; label: string }> = [
    { key: "reachOut", color: "#3B6FD4", label: "Reach Out" },
    { key: "onboarded", color: "#7B4FBF", label: "Onboard" },
    { key: "posted", color: "#4F7C4D", label: "Posted" },
  ];

  const toPoint = (d: MonthlyPoint, i: number, key: TrendKey): string => {
    const x = padX + i * step;
    const y = h - padY - (d[key] / max) * (h - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const toPoints = (key: TrendKey): string =>
    data.map((d, i) => toPoint(d, i, key)).join(" ");

  const toArea = (key: TrendKey): string =>
    `${padX},${h - padY} ${toPoints(key)} ${w - padX},${h - padY}`;

  return (
    <article
      className="bento-tile dashboard-monthly-trend h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3"
      data-depth="4"
    >
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <LineChart size={12} aria-hidden /> 6-month Trend
          <InfoDot
            title="6-month Trend"
            text="Monthly counts of reach-outs, onboardings, and completed posting forms across the latest six months."
          />
        </span>
        <div className="flex items-center gap-2 text-[0.62rem] font-semibold text-text-tertiary">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </header>
      <div className="flex-1 min-h-[120px]" data-depth="3">
        {hasData ? (
          <svg
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            className="w-full h-full"
            role="img"
            aria-label="Six month reach out, onboarded and posted trend"
          >
            <defs>
              {series.map((s) => (
                <linearGradient
                  key={s.key}
                  id={`monthly-trend-${s.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {[0.25, 0.5, 0.75].map((line) => (
              <line
                key={line}
                x1={padX}
                x2={w - padX}
                y1={padY + (h - padY * 2) * line}
                y2={padY + (h - padY * 2) * line}
                className="dashboard-monthly-trend__grid"
              />
            ))}
            {series.map((s) => (
              <polygon
                key={`${s.key}-area`}
                points={toArea(s.key)}
                fill={`url(#monthly-trend-${s.key})`}
                className="dashboard-monthly-trend__area"
              />
            ))}
            {series.map((s, seriesIndex) => (
              <g key={s.key}>
                <polyline
                  points={toPoints(s.key)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={seriesIndex === 2 ? "2.2" : "1.7"}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pathLength={1}
                  className="dashboard-monthly-trend__line"
                />
                {data.map((d, i) => {
                  const [cx, cy] = toPoint(d, i, s.key).split(",");
                  return (
                    <circle
                      key={`${s.key}-${d.month}`}
                      cx={cx}
                      cy={cy}
                      r={seriesIndex === 2 ? 1.8 : 1.35}
                      fill="#fff"
                      stroke={s.color}
                      strokeWidth="0.9"
                      className="dashboard-monthly-trend__dot"
                    />
                  );
                })}
              </g>
            ))}
          </svg>
        ) : (
          <div className="grid h-full min-h-[120px] place-items-center rounded-xl border border-dashed border-border bg-bg-surface text-[0.72rem] text-text-tertiary">
            No monthly trend data in this view yet.
          </div>
        )}
      </div>
      <div className="flex justify-between text-[0.6rem] font-semibold text-text-tertiary tabular">
        {data.map((d) => (
          <span key={d.month}>{d.month}</span>
        ))}
      </div>
    </article>
  );
}
