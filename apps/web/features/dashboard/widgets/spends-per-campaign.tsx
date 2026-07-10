import { Megaphone } from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import { InfoDot } from "../bento-kit";
import type { RankedRow } from "../types";

/**
 * Top 8 campaigns ranked by total commercial spend.
 * Horizontal bar list — bar width = value / max.
 */
export function DashboardSpendsPerCampaign({ data }: { data: RankedRow[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <article className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <Megaphone size={12} aria-hidden /> Spend per Campaign
          <InfoDot
            title="Spend per Campaign"
            text="Campaigns ranked by the total commercial amount recorded for their collaborations in the current filter scope."
          />
        </span>
      </header>
      {data.length === 0 ? (
        <div className="flex-1 grid place-items-center text-[0.78rem] text-text-tertiary">
          No campaign spend in scope
        </div>
      ) : (
        <ul className="flex flex-col gap-2 flex-1">
          {data.map((d) => {
            const pct = Math.round((d.value / max) * 100);
            return (
              <li key={d.label} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[0.72rem]">
                  <span className="font-bold text-text-primary truncate">
                    {d.label}
                  </span>
                  <span className="tabular text-text-secondary flex-shrink-0">
                    {formatRupees(d.value)}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-bg-ecru overflow-hidden">
                  <div
                    className="bento-bar absolute inset-y-0 left-0 rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
