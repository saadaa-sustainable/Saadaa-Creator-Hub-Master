import { Banknote, Shirt, Target, TrendingUp, Users, Wallet } from "lucide-react";
import { CountUpInt, CountUpRupees } from "./count-up-stats";
import type { CostKpis } from "@/features/cost-analytics/types";

/**
 * Cost tab KPI grid. Cost Analytics has no exported strip component — its KPIs
 * are rendered inline in its page-client — so the Dashboard composes a compact
 * `.acc-kpi` grid from the same `CostKpis` shape returned by
 * `fetchCostAnalyticsData()`. Numbers, not a re-implementation of the logic.
 */
export function DashboardCostStrip({ kpis }: { kpis: CostKpis }) {
  const garmentCost = Math.max(0, kpis.totalWithGarments - kpis.actualCost);
  return (
    <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
      <KpiCard
        tone="accent"
        icon={<Wallet size={16} aria-hidden />}
        label="Budgeted Cost"
        primary={<CountUpRupees value={kpis.budgetCost} />}
        secondary={`${kpis.budgetCreators} planned creators`}
      />
      <KpiCard
        tone="info"
        icon={<Banknote size={16} aria-hidden />}
        label="Actual Cost"
        primary={<CountUpRupees value={kpis.actualCost} />}
        secondary={`${kpis.actualCreators} actual creators`}
      />
      <KpiCard
        tone={kpis.variance > 0 ? "danger" : "success"}
        icon={<TrendingUp size={16} aria-hidden />}
        label="Variance"
        primary={<CountUpRupees value={kpis.variance} />}
        secondary={kpis.variance > 0 ? "Over budget" : "Under budget"}
      />
      <KpiCard
        tone="warning"
        icon={<Target size={16} aria-hidden />}
        label="Utilisation"
        primary={<><CountUpInt value={kpis.utilPct} />%</>}
        secondary="Actual ÷ budget"
      />
      <KpiCard
        tone="muted"
        icon={<Shirt size={16} aria-hidden />}
        label="Garment Cost"
        primary={<CountUpRupees value={garmentCost} />}
        secondary="Product seeding spend"
      />
      <KpiCard
        tone="info"
        icon={<Users size={16} aria-hidden />}
        label="Total w/ Garments"
        primary={<CountUpRupees value={kpis.totalWithGarments} />}
        secondary="Cash + product"
      />
    </div>
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
  primary: React.ReactNode;
  secondary: string;
}) {
  return (
    <div className={`acc-kpi acc-kpi--${tone} bento-tile`}>
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
