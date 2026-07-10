import { Target } from "lucide-react";
import { InfoDot } from "../bento-kit";
import { CountUpInt } from "../count-up-stats";

/**
 * Radial progress — Posting goal vs total pipeline scope.
 * Inline SVG circle stroke-dasharray trick.
 */
export function DashboardPostingGoal({
  target,
  achieved,
  pct,
}: {
  target: number;
  achieved: number;
  pct: number;
}) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  // dash = full circumference with offset (circ - arc): visually identical to
  // the old `${arc} ${circ - arc}` dasharray, but lets the one-shot mount sweep
  // animate a single stroke-dashoffset from "empty" to the final arc.
  const dash = (pct / 100) * circ;
  return (
    <article className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3 min-h-[200px]">
      {/* Scoped keyframes: globals.css is off-limits here and the sweep needs
          the numeric circumference. One-shot, reduced-motion-safe. */}
      <style>{`@keyframes dashGoalSweep{from{stroke-dashoffset:${circ.toFixed(2)}px}}
.dash-goal-arc{animation:dashGoalSweep 0.9s cubic-bezier(0.22,1,0.36,1) both 0.15s}
@media (prefers-reduced-motion:reduce){.dash-goal-arc{animation:none}}`}</style>
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <Target size={12} aria-hidden /> Posting Goal
          <InfoDot
            title="Posting Goal"
            text="Progress toward the current posting target. Achieved counts deliverables whose posting form has been completed."
          />
        </span>
        <span className="text-[0.62rem] font-semibold text-text-tertiary tabular">
          <CountUpInt value={achieved} /> / <CountUpInt value={target} />
        </span>
      </header>
      <div className="flex-1 grid place-items-center">
        <div className="relative w-[140px] h-[140px]">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="var(--color-bg-ecru,#F0EAD6)"
              strokeWidth="11"
            />
            <circle
              className="dash-goal-arc"
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="#4F7C4D"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={circ - dash}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center leading-none">
              <span className="font-emph text-[1.55rem] font-bold tabular text-text-primary">
                <CountUpInt value={pct} />%
              </span>
              <span className="text-[0.58rem] uppercase tracking-[0.06em] text-text-tertiary mt-0.5">
                Posted of total
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
