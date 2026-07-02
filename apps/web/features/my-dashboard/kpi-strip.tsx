import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Layers,
  Send,
  Sparkles,
  Users2,
} from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
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
      <div className="acc-kpi-grid bento-stagger">
        <KpiCard
          tone="accent"
          icon={<Users2 size={16} aria-hidden />}
          label="My Active"
          value={kpi.myActive}
          secondary="Reach Out · Onboarding · Posting"
        />
        <KpiCard
          tone="warning"
          icon={<Clock size={16} aria-hidden />}
          label="Pending Post"
          value={kpi.pendingPost}
          secondary="In the Posting stage"
        />
        <KpiCard
          tone="success"
          icon={<CheckCircle size={16} aria-hidden />}
          label="Posted"
          value={kpi.posted}
          secondary="Posted · Delivered"
        />
        <KpiCard
          tone="danger"
          icon={<ArrowLeft size={16} aria-hidden />}
          label="RTOs"
          value={kpi.rtos}
          secondary="RTO · Cancelled"
        />
      </div>
      <div className="acc-kpi-grid bento-stagger">
        <KpiCard
          tone="info"
          icon={<Layers size={16} aria-hidden />}
          label="Campaigns Assigned"
          value={kpi.totalCampaigns}
          secondary="Distinct campaigns"
        />
        <KpiCard
          tone="accent"
          icon={<Sparkles size={16} aria-hidden />}
          label="Active Campaigns"
          value={kpi.activeCampaigns}
          secondary="With active posts"
        />
        <KpiCard
          tone="warning"
          icon={<Send size={16} aria-hidden />}
          label="Total Reachouts"
          value={kpi.totalReachouts}
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
  value,
  secondary,
}: {
  tone: "accent" | "muted" | "warning" | "success" | "info" | "danger";
  icon: React.ReactNode;
  label: string;
  value: number;
  secondary: string;
}) {
  return (
    <div className={`acc-kpi acc-kpi--${tone} bento-tile min-h-11`}>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          {icon}
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary tabular">
        {/* Same text as the old String(value) render — count-up is visual only */}
        <CountUp value={value} format={(n) => String(Math.round(n))} />
      </div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </div>
  );
}
