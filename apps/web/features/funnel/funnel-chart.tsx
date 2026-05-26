import type { FunnelMetrics } from "./types";

/**
 * Vertical bar chart of the 9 funnel metrics — mirrors legacy
 * `_drawBarChart('fv-funnel-chart')` (Index.html:10470). Each bar's height is
 * proportional to its value vs `niceMax`. Y-axis uses nice round-step ticks
 * (1/2/5 × 10^n) so labels read as 1000-step increments not fractions.
 */
export function FunnelChart({ totals }: { totals: FunnelMetrics }) {
  const rows: Array<{ label: string; value: number; tone: string }> = [
    { label: "Reach Out", value: totals.r, tone: "bg-warning" },
    { label: "Onboarded", value: totals.o, tone: "bg-[#3B6FD4]" },
    { label: "Barter", value: totals.b, tone: "bg-[#E8A020]" },
    { label: "Delivered", value: totals.d, tone: "bg-[#7B4FBF]" },
    { label: "Ghosted", value: totals.g, tone: "bg-text-tertiary" },
    { label: "Pending", value: totals.pend, tone: "bg-[#B54F7A]" },
    { label: "Overdue", value: totals.overdue, tone: "bg-danger" },
    { label: "All Posted", value: totals.p, tone: "bg-[#06B6D4]" },
    { label: "Curated", value: totals.p, tone: "bg-success" },
  ];
  const rawMax = Math.max(1, ...rows.map((r) => r.value));
  const { niceMax, step } = niceScale(rawMax);
  const tickCount = Math.round(niceMax / step) + 1; // includes 0
  const ticks = Array.from({ length: tickCount }, (_, i) => niceMax - i * step);

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[0.7rem] sm:text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Performance Funnel
        </h2>
        <span className="text-[0.55rem] sm:text-[0.6rem] text-text-tertiary">
          Lifetime totals across pipeline stages
        </span>
      </header>

      <div className="-mx-2.5 max-w-[calc(100%+1.25rem)] overflow-x-auto px-2.5 sm:mx-0 sm:max-w-full sm:px-0">
        <div className="flex min-w-[360px] gap-1.5 sm:min-w-0 sm:gap-3">
          {/* Y-axis labels — top-down, evenly spaced */}
          <div
            className="flex flex-col justify-between text-[0.5rem] sm:text-[0.6rem] text-text-tertiary tabular text-right shrink-0 w-6 sm:w-10 pb-5 sm:pb-6"
            style={{ minHeight: 176 }}
          >
            {ticks.map((t) => (
              <span key={t} className="leading-none">
                {fmtTick(t)}
              </span>
            ))}
          </div>

          {/* Chart canvas */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="relative h-44 w-full sm:h-[300px]">
              {/* Gridlines aligned to Y ticks */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="border-t border-dashed border-border/70 h-0"
                  />
                ))}
              </div>
              {/* Bars */}
              <div className="absolute inset-0 flex items-end justify-between gap-1 sm:gap-2 px-0.5">
                {rows.map((row) => {
                  const heightPct = (row.value / niceMax) * 100;
                  return (
                    <div
                      key={row.label}
                      className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 group cursor-default relative h-full"
                    >
                      <span className="absolute -top-1 text-[0.6rem] sm:text-[0.7rem] font-extrabold tabular text-text-primary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap bg-bg-white border border-border rounded px-1 py-0.5 shadow-sm z-10">
                        {row.value}
                      </span>
                      <div
                        className={`w-full max-w-[22px] sm:max-w-[44px] rounded-t-md ${row.tone} transition-all duration-500 hover:opacity-80`}
                        style={{
                          height: row.value === 0 ? "2px" : `${heightPct}%`,
                          opacity: row.value === 0 ? 0.3 : 1,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* X-axis: value above + label below each bar */}
            <div className="flex items-start justify-between gap-1 sm:gap-2 px-0.5 mt-1.5">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex-1 flex flex-col items-center min-w-0"
                >
                  <span className="text-[0.55rem] sm:text-[0.72rem] font-extrabold tabular text-text-primary">
                    {row.value}
                  </span>
                  <span className="text-[0.44rem] sm:text-[0.55rem] font-extrabold uppercase tracking-[0.04em] text-text-tertiary text-center truncate w-full mt-0.5">
                    {row.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Picks a "nice" axis max and step from a raw max so labels read as
 * 0/1000/2000/... or 0/2/4/6/8/10 etc — never fractional.
 * Mirrors d3-array `tickStep` (1/2/5 × 10^n family).
 */
function niceScale(rawMax: number): { niceMax: number; step: number } {
  if (rawMax <= 0) return { niceMax: 1, step: 1 };
  const targetTicks = 5;
  const rough = rawMax / targetTicks;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const ratio = rough / base;
  let step: number;
  if (ratio < 1.5) step = 1 * base;
  else if (ratio < 3) step = 2 * base;
  else if (ratio < 7) step = 5 * base;
  else step = 10 * base;
  const niceMax = Math.ceil(rawMax / step) * step;
  return { niceMax, step };
}

function fmtTick(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}
