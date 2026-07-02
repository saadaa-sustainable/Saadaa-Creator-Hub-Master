import { BarChart3 } from "lucide-react";
import { TileHead } from "@/features/dashboard/bento-kit";
import type { CampaignTat } from "./types";

function barColor(avg: number): string {
  if (avg <= 30) return "#4F7C4D";
  if (avg <= 60) return "#B57514";
  return "#C0392B";
}

export function CampaignTatChart({ data }: { data: CampaignTat[] }) {
  if (!data.length) {
    return (
      <div className="bento-tile rounded-2xl border border-border bg-bg-white p-5">
        <TileHead
          icon={<BarChart3 size={12} aria-hidden />}
          info="Average days from reach-out to first post, per campaign."
        >
          Campaign TAT Benchmark
        </TileHead>
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
    <div className="bento-tile rounded-2xl border border-border bg-bg-white p-5">
      <TileHead
        icon={<BarChart3 size={12} aria-hidden />}
        info="Average days from reach-out to first post, per campaign."
      >
        Campaign TAT Benchmark
      </TileHead>
      <p className="-mt-1.5 mb-3 text-[0.72rem] text-text-tertiary">
        Avg days Reach Out → Posted, per campaign · Green ≤30d · Amber ≤60d · Red &gt;60d
      </p>

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

                {/* Value bar — .bento-bar scaleX grow; fill-box keeps the
                    transform origin on the bar's own left edge (SVG). */}
                <rect
                  className="bento-bar"
                  x={LABEL_W}
                  y={y}
                  width={barW}
                  height={BAR_HEIGHT}
                  rx="6"
                  fill={color}
                  opacity="0.85"
                  style={{ transformBox: "fill-box" }}
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
