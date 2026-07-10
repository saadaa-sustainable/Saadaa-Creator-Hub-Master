import { GitBranch } from "lucide-react";
import { InfoDot } from "../bento-kit";

interface FunnelProps {
  reachOut: number;
  onboarded: number;
  posted: number;
}

/**
 * Workflow funnel — 3 horizontal bars (Reach Out → On Board → Posted) sized
 * relative to the largest bucket. Conversion deltas show on the right.
 */
export function DashboardWorkflowFunnel({
  reachOut,
  onboarded,
  posted,
}: FunnelProps) {
  const max = Math.max(reachOut, onboarded, posted, 1);
  const steps = [
    {
      label: "Reach Out",
      value: reachOut,
      color: "bg-[#EAF1FB]",
      bar: "bg-[#3B6FD4]",
    },
    {
      label: "Onboard",
      value: onboarded,
      color: "bg-[#F1EAFB]",
      bar: "bg-[#7B4FBF]",
    },
    {
      label: "Posted",
      value: posted,
      color: "bg-success-bg",
      bar: "bg-success",
    },
  ];
  return (
    <article className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <GitBranch size={12} aria-hidden /> Workflow Funnel
          <InfoDot
            title="Workflow Funnel"
            text="A simple comparison of collaboration volume at Reach Out, Onboard, and Posted. Each bar is measured against the largest stage in this view."
          />
        </span>
      </header>
      <ul className="flex flex-col gap-2.5">
        {steps.map((s) => {
          const pct = Math.round((s.value / max) * 100);
          return (
            <li key={s.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[0.72rem]">
                <span className="font-bold text-text-primary">{s.label}</span>
                <span className="tabular text-text-secondary">{s.value}</span>
              </div>
              <div
                className={`relative h-2.5 rounded-full ${s.color} overflow-hidden`}
              >
                <div
                  className={`bento-bar absolute inset-y-0 left-0 ${s.bar} rounded-full`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
