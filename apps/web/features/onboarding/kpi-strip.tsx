import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  HourglassIcon,
  Mail,
  ShieldCheck,
  ShieldX,
  ShoppingCart,
  UserRoundCheck,
} from "lucide-react";
import type { OnboardingKpi } from "./types";

/**
 * Onboarding KPI strip — closes the Analytics-Matrix gap (the Onboarding page
 * had no KPI strip). Reuses the `.acc-kpi-grid` / `.acc-kpi--{tone}` classes
 * shared across stages (accounts-hub, ad-status) so the visual + responsive
 * bento pattern matches exactly. Rendered between the filter bar and the board
 * (filter-above-KPI rule). Counts are per-collab.
 */
export function OnboardingKpiStrip({ kpi }: { kpi: OnboardingKpi }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="acc-kpi-grid">
        <KpiCard
          tone="accent"
          icon={<UserRoundCheck size={16} aria-hidden />}
          label="Total Onboarded"
          primary={String(kpi.totalOnboarded)}
          secondary="Collabs onboarded"
        />
        <KpiCard
          tone="warning"
          icon={<HourglassIcon size={16} aria-hidden />}
          label="Pending"
          primary={String(kpi.pendingOnboardings)}
          secondary="Awaiting onboarding"
        />
        <KpiCard
          tone="success"
          icon={<CheckCircle2 size={16} aria-hidden />}
          label="Completion Rate"
          primary={`${kpi.completionRate}%`}
          secondary="Onboarded ÷ total"
        />
        <KpiCard
          tone="info"
          icon={<ShoppingCart size={16} aria-hidden />}
          label="Shopify Validation"
          primary={`${kpi.shopifyValidationRate}%`}
          secondary={`${kpi.shopifyMatched}/${kpi.shopifyWithOrderId} matched`}
        />
      </div>
      <div className="acc-kpi-grid">
        <KpiCard
          tone="success"
          icon={<ShieldCheck size={16} aria-hidden />}
          label="Ad Rights"
          primary={String(kpi.adRightsSelected)}
          secondary="Rights selected"
        />
        <KpiCard
          tone="muted"
          icon={<ShieldX size={16} aria-hidden />}
          label="No Ad Rights"
          primary={String(kpi.noAdRights)}
          secondary="Rights not taken"
        />
        <KpiCard
          tone="info"
          icon={<Clapperboard size={16} aria-hidden />}
          label="Avg Deliverables"
          primary={`${kpi.avgReels}R · ${kpi.avgStatic}P · ${kpi.avgStories}S`}
          secondary="Per collab"
        />
        <KpiCard
          tone="danger"
          icon={<Mail size={16} aria-hidden />}
          label="Pending Email"
          primary={String(kpi.pendingEmail)}
          secondary="Collab email not sent"
        />
        <KpiCard
          tone="warning"
          icon={<AlertTriangle size={16} aria-hidden />}
          label="Overdue"
          primary={String(kpi.overdue)}
          secondary=">15 days, no post yet"
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
