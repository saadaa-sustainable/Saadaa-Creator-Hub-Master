import {
  CircleDollarSign,
  ClipboardList,
  Hourglass,
  Megaphone,
  PackageCheck,
  Send,
  UserRoundCheck,
  Users,
  Wallet,
} from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import type { DashboardData } from "./types";

/**
 * Overview tab — cross-system headline KPIs. Pulls every number from the
 * single existing `fetchDashboardData` aggregate (no new query), grouped into
 * three labelled bands using the shared `.acc-kpi` chrome so it matches every
 * other stage strip. Rendered above the full bento command-centre in the
 * Overview tab body.
 */
export function DashboardOverviewStrip({ data }: { data: DashboardData }) {
  const { pipeline, campaign } = data;
  const totalPipeline =
    pipeline.reachOut + pipeline.onboarded + pipeline.posted;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="acc-kpi-group">
          <Megaphone size={13} aria-hidden /> Campaigns &amp; creators
        </div>
        <div className="acc-kpi-grid">
          <KpiCard
            tone="accent"
            icon={<Megaphone size={16} aria-hidden />}
            label="Active Campaigns"
            primary={String(campaign.activeCampaigns)}
            secondary="Campaigns in scope"
          />
          <KpiCard
            tone="info"
            icon={<Users size={16} aria-hidden />}
            label="Creators in Pipeline"
            primary={String(campaign.totalCreators)}
            secondary="Unique creators"
          />
          <KpiCard
            tone="success"
            icon={<ClipboardList size={16} aria-hidden />}
            label="Total Collabs"
            primary={String(totalPipeline)}
            secondary="Across all stages"
          />
          <KpiCard
            tone="warning"
            icon={<Wallet size={16} aria-hidden />}
            label="Total Spend"
            primary={formatRupees(campaign.totalSpend)}
            secondary="Σ commercial amount"
          />
        </div>
      </div>

      <div>
        <div className="acc-kpi-group">
          <UserRoundCheck size={13} aria-hidden /> Per-stage pipeline
        </div>
        <div className="acc-kpi-grid">
          <KpiCard
            tone="accent"
            icon={<Send size={16} aria-hidden />}
            label="Reach Out"
            primary={String(pipeline.reachOut)}
            secondary="Awaiting onboarding"
          />
          <KpiCard
            tone="info"
            icon={<UserRoundCheck size={16} aria-hidden />}
            label="Onboarded"
            primary={String(pipeline.onboarded)}
            secondary={`${pipeline.conversionPct}% conversion`}
          />
          <KpiCard
            tone="success"
            icon={<PackageCheck size={16} aria-hidden />}
            label="Posted"
            primary={String(pipeline.posted)}
            secondary={`${pipeline.postRatePct}% post rate`}
          />
          <KpiCard
            tone="muted"
            icon={<Megaphone size={16} aria-hidden />}
            label="Ad Winners"
            primary={String(pipeline.adWinners)}
            secondary="Top-performing creatives"
          />
        </div>
      </div>

      <div>
        <div className="acc-kpi-group">
          <Hourglass size={13} aria-hidden /> Needs attention
        </div>
        <div className="acc-kpi-grid">
          <KpiCard
            tone="warning"
            icon={<Hourglass size={16} aria-hidden />}
            label="Pending Onboardings"
            primary={String(data.actions.awaitingPost)}
            secondary="In Posting, awaiting post"
          />
          <KpiCard
            tone="warning"
            icon={<Send size={16} aria-hidden />}
            label="Pending Posts"
            primary={String(pipeline.pendingContent)}
            secondary="Onboarded, not yet posted"
          />
          <KpiCard
            tone="danger"
            icon={<CircleDollarSign size={16} aria-hidden />}
            label="Pending Payments"
            primary={String(pipeline.paymentPending)}
            secondary="Due / Not Due collabs"
          />
          <KpiCard
            tone="success"
            icon={<Wallet size={16} aria-hidden />}
            label="Paid Collabs"
            primary={String(campaign.paidCount)}
            secondary="Settled payments"
          />
        </div>
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
