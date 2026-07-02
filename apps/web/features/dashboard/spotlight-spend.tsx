import { IndianRupee, TrendingUp } from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import { CountUpRupeesBare } from "./count-up-stats";
import type { SparkPoint } from "./types";

function Sparkline({ data }: { data: SparkPoint[] }) {
  if (data.length === 0) return null;
  const w = 100;
  const h = 40;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = h - (d.value / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `M 0,${h} L ${points.replace(/\s/g, " L ")} L ${w},${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-14 mt-1 block"
      aria-hidden
    >
      <defs>
        <linearGradient id="dashSparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0C61E" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#F0C61E" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#dashSparkGrad)" />
      <polyline
        points={points}
        fill="none"
        stroke="#9a7a00"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DashboardSpotlight({
  totalSpend,
  spendSpark,
}: {
  totalSpend: number;
  spendSpark: SparkPoint[];
}) {
  const last7 = spendSpark.slice(-7).reduce((s, p) => s + p.value, 0);
  const prev7 = spendSpark.slice(-14, -7).reduce((s, p) => s + p.value, 0);
  const delta7 = prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

  return (
    <article className="bento-tile h-full rounded-2xl border border-border p-4 flex flex-col gap-2 min-h-[200px] bg-gradient-to-br from-bg-white to-[#FAF6E6] relative overflow-hidden">
      <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
      <header className="flex items-center justify-between relative z-10">
        <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          Total Spend (30d)
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent text-text-primary px-2 py-0.5 text-[0.64rem] font-extrabold tabular">
          <TrendingUp size={10} aria-hidden /> {delta7 >= 0 ? "+" : ""}
          {delta7}% wow
        </span>
      </header>
      <div className="inline-flex items-baseline gap-1 font-emph text-[1.95rem] leading-none font-bold tabular text-text-primary relative z-10">
        <IndianRupee size={20} aria-hidden className="translate-y-[3px]" />
        <CountUpRupeesBare value={totalSpend} />
      </div>
      <Sparkline data={spendSpark} />
      <footer className="mt-auto flex justify-between items-center text-[0.68rem] text-text-tertiary tabular relative z-10">
        <span>
          Last 7d <strong className="text-text-primary font-bold">{formatRupees(last7)}</strong>
        </span>
        <span>
          Prev 7d <strong className="text-text-primary font-bold">{formatRupees(prev7)}</strong>
        </span>
      </footer>
    </article>
  );
}
