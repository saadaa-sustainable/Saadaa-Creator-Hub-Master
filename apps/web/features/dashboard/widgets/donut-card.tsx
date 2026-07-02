import type { LucideIcon } from "lucide-react";
import type { BreakdownSlice } from "../types";

/**
 * Donut chart card — inline SVG, no external library. Renders up to 6 slices
 * plus a centered total + legend on the right. Color palette comes from the
 * data (new-project brand tokens).
 */
export function DashboardDonut({
  icon: Icon,
  title,
  slices,
  total,
  emptyHint,
}: {
  icon: LucideIcon;
  title: string;
  slices: BreakdownSlice[];
  total?: string;
  emptyHint?: string;
}) {
  const sum = slices.reduce((s, x) => s + x.value, 0);
  const radius = 38;
  const stroke = 14;
  const circ = 2 * Math.PI * radius;
  let acc = 0;
  return (
    <article className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <Icon size={12} aria-hidden /> {title}
        </span>
      </header>
      {sum === 0 ? (
        <div className="flex-1 grid place-items-center text-[0.78rem] text-text-tertiary">
          {emptyHint ?? "No data in scope yet"}
        </div>
      ) : (
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 items-center flex-1">
          <div className="relative">
            <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] -rotate-90">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-bg-ecru,#F0EAD6)" strokeWidth={stroke} />
              {slices.map((s) => {
                const len = (s.value / sum) * circ;
                const dasharray = `${len} ${circ - len}`;
                const dashoffset = -acc;
                acc += len;
                return (
                  <circle
                    key={s.label}
                    className="bento-donut-slice"
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={stroke}
                    strokeDasharray={dasharray}
                    strokeDashoffset={dashoffset}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center leading-none">
                <span className="text-[1.15rem] font-emph font-bold tabular text-text-primary">
                  {total ?? sum}
                </span>
                <span className="text-[0.55rem] uppercase tracking-[0.06em] text-text-tertiary mt-0.5">
                  Total
                </span>
              </div>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 min-w-0">
            {slices.map((s) => {
              const pct = Math.round((s.value / sum) * 100);
              return (
                <li
                  key={s.label}
                  className="flex items-center gap-2 text-[0.74rem] min-w-0 rounded-md -mx-1 px-1 hover:bg-bg-alt transition-colors"
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: s.color }}
                  />
                  <span className="flex-1 min-w-0 truncate font-semibold text-text-primary">
                    {s.label}
                  </span>
                  <span className="tabular text-text-tertiary">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}
