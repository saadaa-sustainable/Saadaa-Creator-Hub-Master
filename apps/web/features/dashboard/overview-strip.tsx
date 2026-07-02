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
import { HeroKpi } from "./bento-kit";
import type { DashboardData } from "./types";

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

  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="acc-kpi-group">
          <Megaphone size={13} aria-hidden /> Campaigns &amp; creators
        </div>
        <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
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
      </div>

      <div>
        <div className="acc-kpi-group">
          <UserRoundCheck size={13} aria-hidden /> Per-stage pipeline
        </div>
        <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
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
      </div>

      <div>
        <div className="acc-kpi-group">
          <Hourglass size={13} aria-hidden /> Needs attention
        </div>
        <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
          <HeroKpi
            color="#B57514"
            icon={<Hourglass size={16} aria-hidden />}
            label="Pending Onboardings"
            value={data.actions.awaitingPost}
            sub="In Posting, awaiting post"
          />
          {/* Same amber as Pending Onboardings on purpose — both are the same
              "waiting on content" severity; semantic color beats variety. */}
          <HeroKpi
            color="#B57514"
            icon={<Send size={16} aria-hidden />}
            label="Pending Posts"
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
      </div>
    </section>
  );
}
