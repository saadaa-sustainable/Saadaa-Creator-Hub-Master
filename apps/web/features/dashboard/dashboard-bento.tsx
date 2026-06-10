import { Image, Layers } from "lucide-react";
import { DashboardActionStrip } from "./action-strip";
import { DashboardCampaignKpis } from "./campaign-kpis";
import { DashboardPipelineKpis } from "./pipeline-kpis";
import { DashboardPulseStrip } from "./pulse-strip";
import { DashboardSpotlight } from "./spotlight-spend";
import { DashboardDonut } from "./widgets/donut-card";
import { DashboardHero } from "./widgets/hero-insights";
import { DashboardMonthlyTrend } from "./widgets/monthly-trend";
import { DashboardPostingGoal } from "./widgets/posting-goal";
import { DashboardSpendsPerCampaign } from "./widgets/spends-per-campaign";
import { DashboardStageBoard } from "./widgets/stage-board";
import { DashboardTeamLeaderboard } from "./widgets/team-leaderboard";
import { DashboardTopCreators } from "./widgets/top-creators";
import { DashboardWorkflowFunnel } from "./widgets/workflow-funnel";
import { DashboardChannelSplit } from "./widgets/channel-split";
import { DashboardCampaignFocus } from "./widgets/campaign-focus";
import type { DashboardData } from "./types";

/**
 * Desktop bento mosaic (≥ lg) — managerial command centre:
 *   Row A  | Hero (8) · Spotlight Spend (4)
 *   Row B  | Today's Pulse (full row, 4 equal)
 *   Row C  | Stage Snapshot — 4 mini kanban columns (full row)
 *   Row D  | Action Strip (8) · Posting Goal Radial (4)
 *   Row E  | Workflow Funnel (5) · Monthly Trend (7)
 *   Row F  | Content Donut (6) · Tier Donut (6)
 *   Row G  | Pipeline KPIs (full row, 6 equal)
 *   Row H  | Top Creators (6) · Team Leaderboard (6)
 *   Row I  | Spends per Campaign (full row)
 *   Row J  | Campaign & Spend KPIs (full row, 4 equal)
 *
 * Mobile (< lg): single column.
 */
export function DashboardBento({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-1">
      {/* Row 0 — per-campaign focus (only when a single campaign is filtered) */}
      {data.campaignFocus && (
        <div className="lg:col-span-12">
          <DashboardCampaignFocus focus={data.campaignFocus} />
        </div>
      )}

      {/* Row A */}
      <div className="lg:col-span-8">
        <DashboardHero
          totalReachOut={data.pipeline.reachOut}
          totalPosted={data.pipeline.posted}
          conversionPct={data.pipeline.conversionPct}
          postRatePct={data.pipeline.postRatePct}
        />
      </div>
      <div className="lg:col-span-4">
        <DashboardSpotlight
          totalSpend={data.spotlight.totalSpend}
          spendSpark={data.spotlight.spendSpark}
        />
      </div>

      {/* Row B — Today's Pulse */}
      <div className="lg:col-span-12">
        <DashboardPulseStrip pulse={data.pulse} />
      </div>

      {/* Row C — Stage Snapshot (managerial mini-kanban) */}
      <div className="lg:col-span-12">
        <DashboardStageBoard board={data.stageBoard} counts={data.stageCounts} />
      </div>

      {/* Row D */}
      <div className="lg:col-span-8">
        <DashboardActionStrip actions={data.actions} />
      </div>
      <div className="lg:col-span-4">
        <DashboardPostingGoal
          target={data.postingGoal.target}
          achieved={data.postingGoal.achieved}
          pct={data.postingGoal.pct}
        />
      </div>

      {/* Row E */}
      <div className="lg:col-span-5">
        <DashboardWorkflowFunnel
          reachOut={data.workflowFunnel.reachOut}
          onboarded={data.workflowFunnel.onboarded}
          posted={data.workflowFunnel.posted}
        />
      </div>
      <div className="lg:col-span-7">
        <DashboardMonthlyTrend data={data.monthlyFunnel} />
      </div>

      {/* Row E2 — Inbound vs Outbound reach-out analytics */}
      <div className="lg:col-span-12">
        <DashboardChannelSplit channels={data.channels} />
      </div>

      {/* Row F */}
      <div className="lg:col-span-6">
        <DashboardDonut
          icon={Image}
          title="Content Type Split"
          slices={data.contentBreakdown}
          emptyHint="No content types tagged yet"
        />
      </div>
      <div className="lg:col-span-6">
        <DashboardDonut
          icon={Layers}
          title="Creator Tier Split"
          slices={data.categoryBreakdown}
          emptyHint="No creators with tier yet"
        />
      </div>

      {/* Row G */}
      <div className="lg:col-span-12">
        <DashboardPipelineKpis pipeline={data.pipeline} />
      </div>

      {/* Row H */}
      <div className="lg:col-span-6">
        <DashboardTopCreators creators={data.topCreators} />
      </div>
      <div className="lg:col-span-6">
        <DashboardTeamLeaderboard team={data.teamLeaderboard} />
      </div>

      {/* Row I */}
      <div className="lg:col-span-12">
        <DashboardSpendsPerCampaign data={data.spendsPerCampaign} />
      </div>

      {/* Row J */}
      <div className="lg:col-span-12">
        <DashboardCampaignKpis campaign={data.campaign} />
      </div>
    </div>
  );
}
