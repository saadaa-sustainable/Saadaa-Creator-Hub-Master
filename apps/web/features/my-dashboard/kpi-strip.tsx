import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Layers,
  Send,
  Sparkles,
  Users2,
} from "lucide-react";
import { HeroKpi } from "@/features/dashboard/bento-kit";
import type { MyDashboardKpi } from "./types";

/**
 * KPI strip for My Dashboard personal view.
 * Renders the bento-kit `HeroKpi` tiles inside the shared `.acc-kpi-grid`
 * (so the `.my-dashboard-stage` mobile override keeps phones paired 2-up).
 * Row 1 = personal workload counts. Row 2 = campaign + reach-out coverage
 * (closes the Analytics-Matrix gap: Total Campaigns / Active Campaigns /
 * Total Reachouts). All scoped to the signed-in user's posts.
 */
export function MyDashboardKpiStrip({ kpi }: { kpi: MyDashboardKpi }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="acc-kpi-grid bento-stagger">
        <HeroKpi
          color="#3B6FD4"
          icon={<Users2 size={14} aria-hidden />}
          label="My Active"
          value={kpi.myActive}
          sub="Reach Out · Onboarding · Posting"
        />
        <HeroKpi
          color="#B57514"
          icon={<Clock size={14} aria-hidden />}
          label="Pending Post"
          value={kpi.pendingPost}
          sub="In the Posting stage"
        />
        <HeroKpi
          color="#4F7C4D"
          icon={<CheckCircle size={14} aria-hidden />}
          label="Posted"
          value={kpi.posted}
          sub="Posted · Delivered"
        />
        <HeroKpi
          color="#C0392B"
          icon={<ArrowLeft size={14} aria-hidden />}
          label="RTOs"
          value={kpi.rtos}
          sub="RTO · Cancelled"
        />
      </div>
      <div className="acc-kpi-grid bento-stagger">
        <HeroKpi
          color="#3B6FD4"
          icon={<Layers size={14} aria-hidden />}
          label="Campaigns Assigned"
          value={kpi.totalCampaigns}
          sub="Distinct campaigns"
        />
        <HeroKpi
          color="#7B4FBF"
          icon={<Sparkles size={14} aria-hidden />}
          label="Active Campaigns"
          value={kpi.activeCampaigns}
          sub="With active posts"
        />
        <HeroKpi
          color="#B57514"
          icon={<Send size={14} aria-hidden />}
          label="Total Reachouts"
          value={kpi.totalReachouts}
          sub="In Reach Out stage"
        />
      </div>
    </section>
  );
}
