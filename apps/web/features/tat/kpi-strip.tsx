import { ArrowLeft, CheckCircle, Clock, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TatKpi } from "./types";

type Tone = "accent" | "success" | "warning" | "danger" | "info";

function KpiCard({
  tone,
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className={cn("acc-kpi", `acc-kpi--${tone}`)}>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          <Icon size={16} />
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary tabular">{primary}</div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </div>
  );
}

export function TatKpiStrip({ kpi }: { kpi: TatKpi }) {
  const rtoRate =
    kpi.postsWithOrder > 0
      ? `${Math.round((kpi.rto / kpi.postsWithOrder) * 100)}%`
      : "—";

  return (
    <div className="acc-kpi-grid">
      <KpiCard
        tone="accent"
        icon={Send}
        label="Total Posts"
        primary={String(kpi.totalPosts)}
        secondary="Posted + Delivered"
      />
      <KpiCard
        tone="info"
        icon={Clock}
        label="Avg RO → Post"
        primary={kpi.avgEndToEnd != null ? `${kpi.avgEndToEnd}d` : "—"}
        secondary="End-to-end TAT"
      />
      <KpiCard
        tone="success"
        icon={CheckCircle}
        label="Delivered"
        primary={String(kpi.delivered)}
        secondary="Orders delivered"
      />
      <KpiCard
        tone="danger"
        icon={ArrowLeft}
        label="RTO Rate"
        primary={rtoRate}
        secondary={`${kpi.rto} of ${kpi.postsWithOrder} orders`}
      />
    </div>
  );
}
