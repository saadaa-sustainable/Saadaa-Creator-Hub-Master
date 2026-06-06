import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Layers,
  Send,
  Sparkles,
  Users2,
} from "lucide-react";
import type { MyDashboardKpi } from "./types";

/**
 * KPI strip for My Dashboard personal view.
 * Reuses `.acc-kpi-grid` / `.acc-kpi--{tone}` classes from accounts-hub.
 * Row 1 = personal workload counts. Row 2 = campaign + reach-out coverage
 * (closes the Analytics-Matrix gap: Total Campaigns / Active Campaigns /
 * Total Reachouts). All scoped to the signed-in user's posts.
 */
export function MyDashboardKpiStrip({ kpi }: { kpi: MyDashboardKpi }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="acc-kpi-grid">
        <KpiCard
          tone="accent"
          icon={<Users2 size={16} aria-hidden />}
          label="My Active"
          primary={String(kpi.myActive)}
          secondary="Reach Out · Onboard · Order Sent"
        />
        <KpiCard
          tone="warning"
          icon={<Clock size={16} aria-hidden />}
          label="Pending Post"
          primary={String(kpi.pendingPost)}
          secondary="Onboard · Order Sent"
        />
        <KpiCard
          tone="success"
          icon={<CheckCircle size={16} aria-hidden />}
          label="Posted"
          primary={String(kpi.posted)}
          secondary="Posted · Delivered"
        />
        <KpiCard
          tone="danger"
          icon={<ArrowLeft size={16} aria-hidden />}
          label="RTOs"
          primary={String(kpi.rtos)}
          secondary="RTO · Cancelled"
        />
      </div>
      <div className="acc-kpi-grid">
        <KpiCard
          tone="info"
          icon={<Layers size={16} aria-hidden />}
          label="Campaigns Assigned"
          primary={String(kpi.totalCampaigns)}
          secondary="Distinct campaigns"
        />
        <KpiCard
          tone="accent"
          icon={<Sparkles size={16} aria-hidden />}
          label="Active Campaigns"
          primary={String(kpi.activeCampaigns)}
          secondary="With active posts"
        />
        <KpiCard
          tone="warning"
          icon={<Send size={16} aria-hidden />}
          label="Total Reachouts"
          primary={String(kpi.totalReachouts)}
          secondary="In Reach Out stage"
        />
      </div>
    </section>
  );
}

function KpiCard({
  tone,
  icon,
  label,
  primary,
  secondary,
}: {
  tone: "accent" | "muted" | "warning" | "success" | "info" | "danger";
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className={`acc-kpi acc-kpi--${tone}`}>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          {icon}
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary tabular">{primary}</div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </div>
  );
}
