import { ArrowLeft, CheckCircle, Clock, Send } from "lucide-react";
import type { ReactNode } from "react";
import { HeroKpi } from "@/features/dashboard/bento-kit";
import type { TatKpi } from "./types";

/**
 * Fallback twin of `HeroKpi` for the "no data yet" case — same shell,
 * renders an em-dash instead of a count-up (HeroKpi only takes numbers).
 * Structure/classes mirror bento-kit's HeroKpi exactly; keep in sync.
 */
function HeroKpiDash({
  color,
  icon,
  label,
  sub,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="bento-tile relative overflow-hidden rounded-[16px] border border-border bg-bg-white p-3.5">
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.10]"
        style={{ background: color }}
        aria-hidden
      />
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: color }}
        aria-hidden
      />
      <div className="mb-2 flex items-center gap-1.5 text-text-secondary">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-[8px]"
          style={{ background: `${color}1A`, color }}
        >
          {icon}
        </span>
        <span className="truncate text-[0.64rem] font-bold uppercase tracking-[0.05em]">
          {label}
        </span>
      </div>
      <div className="text-[1.7rem] font-bold leading-none tracking-[-0.01em] tabular-nums text-text-primary">
        —
      </div>
      <div className="mt-1.5 text-[0.68rem] leading-snug tabular-nums text-text-tertiary">
        {sub}
      </div>
    </div>
  );
}

export function TatKpiStrip({ kpi }: { kpi: TatKpi }) {
  const rtoPct =
    kpi.postsWithOrder > 0
      ? Math.round((kpi.rto / kpi.postsWithOrder) * 100)
      : null;

  return (
    <div className="acc-kpi-grid bento-stagger">
      <HeroKpi
        color="#3B6FD4"
        icon={<Send size={14} aria-hidden />}
        label="Total Posts"
        value={kpi.totalPosts}
        sub="Posted + Delivered"
      />
      {kpi.avgEndToEnd != null ? (
        <HeroKpi
          color="#7B4FBF"
          icon={<Clock size={14} aria-hidden />}
          label="Avg RO → Post"
          value={kpi.avgEndToEnd}
          suffix="d"
          sub="End-to-end TAT"
        />
      ) : (
        <HeroKpiDash
          color="#7B4FBF"
          icon={<Clock size={14} aria-hidden />}
          label="Avg RO → Post"
          sub="End-to-end TAT"
        />
      )}
      <HeroKpi
        color="#4F7C4D"
        icon={<CheckCircle size={14} aria-hidden />}
        label="Delivered"
        value={kpi.delivered}
        sub="Orders delivered"
      />
      {rtoPct != null ? (
        <HeroKpi
          color="#C0392B"
          icon={<ArrowLeft size={14} aria-hidden />}
          label="RTO Rate"
          value={rtoPct}
          suffix="%"
          sub={`${kpi.rto} of ${kpi.postsWithOrder} orders`}
        />
      ) : (
        <HeroKpiDash
          color="#C0392B"
          icon={<ArrowLeft size={14} aria-hidden />}
          label="RTO Rate"
          sub={`${kpi.rto} of ${kpi.postsWithOrder} orders`}
        />
      )}
    </div>
  );
}
