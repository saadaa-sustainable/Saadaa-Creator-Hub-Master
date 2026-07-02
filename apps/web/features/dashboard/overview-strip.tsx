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
import { CountUpInt, CountUpRupees } from "./count-up-stats";
import type { DashboardData } from "./types";

/**
 * Overview tab — cross-system headline KPIs. Pulls every number from the
 * single existing `fetchDashboardData` aggregate (no new query), grouped into
 * three labelled bands using the shared `.acc-kpi` chrome so it matches every
 * other stage strip. Rendered above the full bento command-centre in the
 * Overview tab body.
 *
 * `archival` (default false) drops the spend-derived "Total Spend" card so the
 * archive-only Historic Analytics page can hide spend. The live dashboard never
 * passes it, so its layout is unchanged.
 */
export function DashboardOverviewStrip({
  data,
  archival = false,
}: {
  data: DashboardData;
  archival?: boolean;
}) {
  const { pipeline, campaign } = data;
  const totalPipeline =
    pipeline.reachOut + pipeline.onboarded + pipeline.posted;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="acc-kpi-group">
          <Megaphone size={13} aria-hidden /> Campaigns &amp; creators
        </div>
        <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
          <KpiCard
            tone="accent"
            icon={<Megaphone size={16} aria-hidden />}
            label="Active Campaigns"
            primary={<CountUpInt value={campaign.activeCampaigns} />}
            secondary="Campaigns in scope"
          />
          <KpiCard
            tone="info"
            icon={<Users size={16} aria-hidden />}
            label="Creators in Pipeline"
            primary={<CountUpInt value={campaign.totalCreators} />}
            secondary="Unique creators"
          />
          <KpiCard
            tone="success"
            icon={<ClipboardList size={16} aria-hidden />}
            label="Total Collabs"
            primary={<CountUpInt value={totalPipeline} />}
            secondary="Across all stages"
          />
          {!archival && (
            <KpiCard
              tone="warning"
              icon={<Wallet size={16} aria-hidden />}
              label="Total Spend"
              primary={<CountUpRupees value={campaign.totalSpend} />}
              secondary="Σ commercial amount"
            />
          )}
        </div>
      </div>

      <div>
        <div className="acc-kpi-group">
          <UserRoundCheck size={13} aria-hidden /> Per-stage pipeline
        </div>
        <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
          <KpiCard
            tone="accent"
            icon={<Send size={16} aria-hidden />}
            label="Reach Out"
            primary={<CountUpInt value={pipeline.reachOut} />}
            secondary="Awaiting onboarding"
          />
          <KpiCard
            tone="info"
            icon={<UserRoundCheck size={16} aria-hidden />}
            label="Onboarded"
            primary={<CountUpInt value={pipeline.onboarded} />}
            secondary={`${pipeline.conversionPct}% conversion`}
          />
          <KpiCard
            tone="success"
            icon={<PackageCheck size={16} aria-hidden />}
            label="Posted"
            primary={<CountUpInt value={pipeline.posted} />}
            secondary={`${pipeline.postRatePct}% post rate`}
          />
          <KpiCard
            tone="muted"
            icon={<Megaphone size={16} aria-hidden />}
            label="Ad Winners"
            primary={<CountUpInt value={pipeline.adWinners} />}
            secondary="Top-performing creatives"
          />
        </div>
      </div>

      <div>
        <div className="acc-kpi-group">
          <Hourglass size={13} aria-hidden /> Needs attention
        </div>
        <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
          <KpiCard
            tone="warning"
            icon={<Hourglass size={16} aria-hidden />}
            label="Pending Onboardings"
            primary={<CountUpInt value={data.actions.awaitingPost} />}
            secondary="In Posting, awaiting post"
          />
          <KpiCard
            tone="warning"
            icon={<Send size={16} aria-hidden />}
            label="Pending Posts"
            primary={<CountUpInt value={pipeline.pendingContent} />}
            secondary="Onboarded, not yet posted"
          />
          <KpiCard
            tone="danger"
            icon={<CircleDollarSign size={16} aria-hidden />}
            label="Pending Payments"
            primary={<CountUpInt value={pipeline.paymentPending} />}
            secondary="Due / Not Due collabs"
          />
          <KpiCard
            tone="success"
            icon={<Wallet size={16} aria-hidden />}
            label="Paid Collabs"
            primary={<CountUpInt value={campaign.paidCount} />}
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
