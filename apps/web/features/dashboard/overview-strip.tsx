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
import type { ReactNode } from "react";
import { HeroKpi } from "./bento-kit";
import type { DashboardData } from "./types";

const OVERVIEW_GRID_FOUR =
  "acc-kpi-grid dashboard-overview-kpi-grid dashboard-overview-kpi-grid--four bento-stagger max-[480px]:grid-cols-2!";

interface RailSegment {
  label: string;
  value: number;
  color: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function MiniRail({
  label,
  segments,
}: {
  label: string;
  segments: RailSegment[];
}) {
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  const total = visibleSegments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;
  const ariaLabel = `${label}: ${visibleSegments
    .map((segment) => `${segment.label} ${fmt(segment.value)}`)
    .join(", ")}`;

  return (
    <div
      className="dashboard-overview-rail"
      role="img"
      aria-label={ariaLabel}
      data-depth="3"
    >
      <div className="dashboard-overview-rail__track" aria-hidden="true">
        {visibleSegments.map((segment) => (
          <span
            key={segment.label}
            className="dashboard-overview-rail__fill"
            style={{
              width: `${Math.max(1, Math.round((segment.value / total) * 100))}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>
      <div className="dashboard-overview-rail__legend">
        {visibleSegments.map((segment) => (
          <span key={segment.label}>
            <span
              className="dashboard-overview-rail__dot"
              style={{ background: segment.color }}
              aria-hidden="true"
            />
            {segment.label}
            <strong>{fmt(segment.value)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function OverviewBand({
  icon,
  title,
  summary,
  railLabel,
  railSegments,
  children,
}: {
  icon: ReactNode;
  title: string;
  summary: string;
  railLabel: string;
  railSegments: RailSegment[];
  children: ReactNode;
}) {
  return (
    <div className="dashboard-overview-band" data-depth="4">
      <div className="dashboard-overview-band__depth" aria-hidden="true">
        <span data-depth="0" />
        <span data-depth="1" />
        <span data-depth="5" />
      </div>
      <div className="acc-kpi-group dashboard-overview-band__head">
        <span className="dashboard-overview-band__label">
          {icon}
          {title}
        </span>
        <span className="dashboard-overview-band__meta">{summary}</span>
      </div>
      <MiniRail label={railLabel} segments={railSegments} />
      {children}
    </div>
  );
}

/**
 * Overview tab — cross-system headline KPIs. Pulls every number from the
 * single existing `fetchDashboardData` aggregate (no new query), grouped into
 * three labelled bands. Cards render via the shared bento-kit `HeroKpi` tile
 * (top accent bar + tinted corner + internal count-up) inside the same
 * `.acc-kpi-grid` shells so grouping/stagger/mobile pairing are unchanged.
 * Rendered above the full bento command-centre in the Overview tab body.
 *
 * Card hues follow the sanctioned secondary accents (gold stays CTA-only);
 * the per-stage band mirrors the kit's STAGE_SERIES colors so the strip
 * matches the trend/donut tiles below it.
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
  const attentionTotal =
    data.actions.needsEmail +
    data.actions.needsOrder +
    data.actions.awaitingPost +
    data.actions.noTracking +
    data.actions.noPartnership +
    data.actions.overdue;

  return (
    <section className="dashboard-overview-strip flex flex-col gap-4">
      <OverviewBand
        icon={<Megaphone size={13} aria-hidden />}
        title="Campaigns & creators"
        summary={`${fmt(campaign.activeCampaigns)} campaigns / ${fmt(campaign.totalCreators)} creators`}
        railLabel="Campaign overview split"
        railSegments={[
          {
            label: "Creators",
            value: campaign.totalCreators,
            color: "#3B6FD4",
          },
          { label: "Collabs", value: totalPipeline, color: "#4F7C4D" },
          {
            label: "Campaigns",
            value: campaign.activeCampaigns,
            color: "#B57514",
          },
          { label: "Paid", value: campaign.paidCount, color: "#161513" },
        ]}
      >
        <div
          className={`acc-kpi-grid dashboard-overview-kpi-grid ${
            archival
              ? "dashboard-overview-kpi-grid--three"
              : "dashboard-overview-kpi-grid--four"
          } bento-stagger max-[480px]:grid-cols-2!`}
        >
          <HeroKpi
            color="#B57514"
            icon={<Megaphone size={16} aria-hidden />}
            label="Active Campaigns"
            value={campaign.activeCampaigns}
            sub="Campaigns in scope"
          />
          <HeroKpi
            color="#3B6FD4"
            icon={<Users size={16} aria-hidden />}
            label="Creators in Pipeline"
            value={campaign.totalCreators}
            sub="Unique creators"
          />
          <HeroKpi
            color="#4F7C4D"
            icon={<ClipboardList size={16} aria-hidden />}
            label="Total Collabs"
            value={totalPipeline}
            sub="Across all stages"
          />
          {!archival && (
            <HeroKpi
              color="#B57514"
              icon={<Wallet size={16} aria-hidden />}
              label="Total Spend"
              value={campaign.totalSpend}
              sub="Σ commercial amount"
              rupees
            />
          )}
        </div>
      </OverviewBand>

      <OverviewBand
        icon={<UserRoundCheck size={13} aria-hidden />}
        title="Per-stage pipeline"
        summary={`${pipeline.conversionPct}% conversion / ${pipeline.postRatePct}% post rate`}
        railLabel="Per-stage pipeline split"
        railSegments={[
          { label: "Reach Out", value: pipeline.reachOut, color: "#3B6FD4" },
          { label: "Onboarded", value: pipeline.onboarded, color: "#7B4FBF" },
          { label: "Posted", value: pipeline.posted, color: "#4F7C4D" },
          { label: "Ad Winners", value: pipeline.adWinners, color: "#B57514" },
        ]}
      >
        <div className={OVERVIEW_GRID_FOUR}>
          <HeroKpi
            color="#3B6FD4"
            icon={<Send size={16} aria-hidden />}
            label="Reach Out"
            value={pipeline.reachOut}
            sub="Awaiting onboarding"
          />
          <HeroKpi
            color="#7B4FBF"
            icon={<UserRoundCheck size={16} aria-hidden />}
            label="Onboarded"
            value={pipeline.onboarded}
            sub={`${pipeline.conversionPct}% conversion`}
          />
          <HeroKpi
            color="#4F7C4D"
            icon={<PackageCheck size={16} aria-hidden />}
            label="Posted"
            value={pipeline.posted}
            sub={`${pipeline.postRatePct}% post rate`}
          />
          <HeroKpi
            color="#7B4FBF"
            icon={<Megaphone size={16} aria-hidden />}
            label="Ad Winners"
            value={pipeline.adWinners}
            sub="Top-performing creatives"
          />
        </div>
      </OverviewBand>

      <OverviewBand
        icon={<Hourglass size={13} aria-hidden />}
        title="Needs attention"
        summary={`${fmt(attentionTotal)} action checks / ${fmt(pipeline.paymentPending)} payment pending`}
        railLabel="Attention queue split"
        railSegments={[
          {
            label: "Email",
            value: data.actions.needsEmail,
            color: "#B57514",
          },
          {
            label: "Orders",
            value: data.actions.needsOrder,
            color: "#3B6FD4",
          },
          {
            label: "Payments",
            value: pipeline.paymentPending,
            color: "#C0392B",
          },
          {
            label: "Overdue",
            value: data.actions.overdue,
            color: "#161513",
          },
        ]}
      >
        <div className={OVERVIEW_GRID_FOUR}>
          <HeroKpi
            color="#B57514"
            icon={<Hourglass size={16} aria-hidden />}
            label="Awaiting Posts"
            value={data.actions.awaitingPost}
            sub="In Posting, awaiting post"
          />
          {/* Same amber as Pending Onboardings on purpose — both are the same
              "waiting on content" severity; semantic color beats variety. */}
          <HeroKpi
            color="#B57514"
            icon={<Send size={16} aria-hidden />}
            label="Pending Content"
            value={pipeline.pendingContent}
            sub="Onboarded, not yet posted"
          />
          <HeroKpi
            color="#C0392B"
            icon={<CircleDollarSign size={16} aria-hidden />}
            label="Pending Payments"
            value={pipeline.paymentPending}
            sub="Due / Not Due collabs"
          />
          <HeroKpi
            color="#4F7C4D"
            icon={<Wallet size={16} aria-hidden />}
            label="Paid Collabs"
            value={campaign.paidCount}
            sub="Settled payments"
          />
        </div>
      </OverviewBand>
    </section>
  );
}
