import { BarChart3 } from "lucide-react";
import type { CampaignTat } from "./types";

function barColor(avg: number): string {
  if (avg <= 30) return "#4F7C4D";
  if (avg <= 60) return "#B57514";
  return "#C0392B";
}

export function CampaignTatChart({ data }: { data: CampaignTat[] }) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border bg-bg-white p-5">
        <div className="flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary mb-3">
          <BarChart3 size={12} aria-hidden /> Campaign TAT Benchmark
        </div>
        <p className="text-sm text-text-tertiary italic">
          No campaign data with complete reach-out and post dates yet.
        </p>
      </div>
    );
  }

  const maxDays = Math.max(...data.map((d) => d.avgDays), 1);
  const BAR_HEIGHT = 28;
  const GAP = 8;
  const LABEL_W = 72;
  const VALUE_W = 36;
  const chartW = 400;
  const totalH = data.length * (BAR_HEIGHT + GAP) - GAP;

  return (
    <div className="rounded-2xl border bg-bg-white p-5">
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <BarChart3 size={12} aria-hidden /> Campaign TAT Benchmark
        </div>
        <p className="text-[0.72rem] text-text-tertiary mt-0.5">
          Avg days Reach Out → Posted, per campaign · Green ≤30d · Amber ≤60d · Red &gt;60d
        </p>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${LABEL_W + chartW + VALUE_W + 8} ${totalH}`}
          style={{ width: "100%", minWidth: "280px", height: `${Math.max(totalH, 60)}px` }}
          aria-label="Campaign TAT bar chart"
          role="img"
        >
          {data.map((d, i) => {
            const y = i * (BAR_HEIGHT + GAP);
            const barW = Math.max(4, (d.avgDays / maxDays) * chartW);
            const color = barColor(d.avgDays);

            return (
              <g key={d.campaign}>
                {/* Campaign label */}
                <text
                  x={LABEL_W - 6}
                  y={y + BAR_HEIGHT / 2 + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--color-text-secondary)"
                >
                  {d.campaign.length > 8 ? d.campaign.slice(0, 8) + "…" : d.campaign}
                </text>

                {/* Background track */}
                <rect
                  x={LABEL_W}
                  y={y}
                  width={chartW}
                  height={BAR_HEIGHT}
                  rx="6"
                  fill="var(--color-bg-surface)"
                />

                {/* Value bar */}
                <rect
                  x={LABEL_W}
                  y={y}
                  width={barW}
                  height={BAR_HEIGHT}
                  rx="6"
                  fill={color}
                  opacity="0.85"
                />

                {/* Value label */}
                <text
                  x={LABEL_W + chartW + 6}
                  y={y + BAR_HEIGHT / 2 + 4}
                  fontSize="11"
                  fontWeight="800"
                  fill={color}
                >
                  {d.avgDays}d
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
