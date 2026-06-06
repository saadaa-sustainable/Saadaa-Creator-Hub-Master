import { CreditCard, Instagram, TrendingDown, UserRoundCheck } from "lucide-react";
import type { JourneyFunnel } from "./types";

/**
 * Journey funnel conversion strip — Reachout → Onboarding → Posting → Payment.
 * Closes the Analytics-Matrix gap (the existing Journey KPI strip showed only
 * absolute counts, no conversion rates). Reuses the shared `.acc-kpi-grid` /
 * `.acc-kpi--{tone}` classes so it matches the responsive bento pattern.
 * Rates are stage-to-stage; the secondary line shows the raw collab counts.
 */
export function JourneyFunnelStrip({ funnel }: { funnel: JourneyFunnel }) {
  return (
    <div className="acc-kpi-grid">
      <KpiCard
        tone="warning"
        icon={<UserRoundCheck size={16} aria-hidden />}
        label="Reach → Onboard"
        primary={`${funnel.reachToOnboard}%`}
        secondary={`${funnel.onboarded}/${funnel.reached} collabs`}
      />
      <KpiCard
        tone="info"
        icon={<Instagram size={16} aria-hidden />}
        label="Onboard → Posted"
        primary={`${funnel.onboardToPost}%`}
        secondary={`${funnel.posted}/${funnel.onboarded} collabs`}
      />
      <KpiCard
        tone="success"
        icon={<CreditCard size={16} aria-hidden />}
        label="Posted → Paid"
        primary={`${funnel.postToPayment}%`}
        secondary={`${funnel.paid}/${funnel.posted} collabs`}
      />
      <KpiCard
        tone="accent"
        icon={<TrendingDown size={16} aria-hidden />}
        label="Overall"
        primary={
          funnel.reached > 0
            ? `${Math.round((funnel.paid / funnel.reached) * 1000) / 10}%`
            : "0%"
        }
        secondary={`${funnel.paid}/${funnel.reached} reach → paid`}
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
