import { Send, Users, Instagram, XCircle } from "lucide-react";
import { HeroKpi } from "@/features/dashboard/bento-kit";
import type { JourneyKpi } from "./types";

/**
 * 4-card Journey KPI strip — bento-kit `HeroKpi` tiles inside the shared
 * `.acc-kpi-grid` (the `.journey-stage` mobile override keeps phones paired
 * 2-up). Semantic colors: pipeline volume indigo, active purple, posted
 * green, closed red — gold stays CTA-only.
 */
export function JourneyKpiStrip({ kpi }: { kpi: JourneyKpi }) {
  return (
    <div className="acc-kpi-grid bento-stagger">
      <HeroKpi
        color="#3B6FD4"
        icon={<Send size={14} aria-hidden />}
        label="In Pipeline"
        value={kpi.inPipeline}
        sub="total posts tracked"
      />
      <HeroKpi
        color="#7B4FBF"
        icon={<Users size={14} aria-hidden />}
        label="Active"
        value={kpi.active}
        sub="reach out + on board"
      />
      <HeroKpi
        color="#4F7C4D"
        icon={<Instagram size={14} aria-hidden />}
        label="Posted"
        value={kpi.posted}
        sub="posted + delivered"
      />
      <HeroKpi
        color="#C0392B"
        icon={<XCircle size={14} aria-hidden />}
        label="Closed"
        value={kpi.closed}
        sub="RTO + cancelled"
      />
    </div>
  );
}
