import { Activity, Image, Layers } from "lucide-react";
import { DashboardActionStrip } from "./action-strip";
import { DashboardCampaignKpis } from "./campaign-kpis";
import { DashboardPipelineKpis } from "./pipeline-kpis";
import { DashboardPulseStrip } from "./pulse-strip";
import { DashboardSpotlight } from "./spotlight-spend";
import { ActivityTrendTile, DonutTile } from "./bento-charts";
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
 *   Row B2 | Activity Trend — last 30 days (8) · Pipeline Stages donut (4)
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
 *
 * `archival` (default false) is for the archive-only Historic Analytics page:
 * it drops every spend-derived widget (Spotlight Spend, Spend per Campaign),
 * threads the flag into the Campaign KPIs so its Total Spend card is hidden too,
 * and removes the live-only operational rows — the Hero insight headline (Row A),
 * Today's Pulse (Row B) and the Stage Snapshot kanban (Row C, "where every collab
 * is stuck") — so the archive opens straight on the trend/breakdown widgets.
 * The live dashboard never passes it, so its bento is byte-for-byte unchanged.
 */
export function DashboardBento({
  data,
  archival = false,
}: {
  data: DashboardData;
  archival?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-1 bento-stagger">
      {/* Row 0 — per-campaign focus (only when a single campaign is filtered) */}
      {data.campaignFocus && (
        <div className="lg:col-span-12">
          <DashboardCampaignFocus focus={data.campaignFocus} />
        </div>
      )}

      {/* Row A — Hero + Spotlight Spend. Both hidden in archival mode: the
          "pipeline pulse" insight headline and the spend spotlight are
          live-only framing that doesn't belong on the archive. */}
      {!archival && (
        <>
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
        </>
      )}

      {/* Row B — Today's Pulse (live-only; "today" is meaningless on the
          archive, where every "…today" count is always 0). */}
      {!archival && (
        <div className="lg:col-span-12">
          <DashboardPulseStrip pulse={data.pulse} />
        </div>
      )}

      {/* Row B2 — 30-day activity trend (8) + live pipeline-stage donut (4).
          Only the trend is live-only: on the archive "last 30 days" is always
          empty noise, but the stage donut still reads (stageCounts exists). */}
      {!archival && (
        <div className="lg:col-span-8">
          <ActivityTrendTile
            daily={data.activity30}
            icon={<Activity size={13} aria-hidden />}
            info="Daily pipeline events over the last 30 days — each reach-out, onboarding and post counted on the day it happened. Click a chip to show or hide a stage."
          />
        </div>
      )}
      {/* Archival copy differs (nothing is "live" on the archive) and the tile
          centres itself in the row since the trend tile isn't beside it. */}
      <div className={archival ? "lg:col-span-4 lg:col-start-5" : "lg:col-span-4"}>
        <DonutTile
          title="Pipeline Stages"
          icon={<Layers size={13} aria-hidden />}
          info={
            archival
              ? "Where every archived collab ended up, one count per deliverable stage."
              : "Where every live collab sits right now, one count per deliverable stage."
          }
          centreLabel={archival ? "collabs" : "live collabs"}
          segs={[
            {
              name: "Reach Out",
              value: data.stageCounts.reachOut,
              color: "#3B6FD4",
            },
            {
              name: "On Board",
              value: data.stageCounts.onBoard,
              color: "#7B4FBF",
            },
            { name: "Posted", value: data.stageCounts.posted, color: "#4F7C4D" },
            { name: "Paid", value: data.stageCounts.paid, color: "#B57514" },
          ]}
          emptyHint={archival ? "No collabs in scope" : "No live collabs in scope"}
        />
      </div>

      {/* Row C — Stage Snapshot (managerial mini-kanban). Live-only: "where every
          collab is stuck" is an operational view of the active pipeline, not the
          frozen archive. */}
      {!archival && (
        <div className="lg:col-span-12">
          <DashboardStageBoard
            board={data.stageBoard}
            counts={data.stageCounts}
          />
        </div>
      )}

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
        <DonutTile
          icon={<Image size={13} aria-hidden />}
          title="Content Type Split"
          segs={data.contentBreakdown.map((s) => ({
            name: s.label,
            value: s.value,
            color: s.color,
          }))}
          centreLabel="total"
          emptyHint="No content types tagged yet"
        />
      </div>
      <div className="lg:col-span-6">
        <DonutTile
          icon={<Layers size={13} aria-hidden />}
          title="Creator Tier Split"
          segs={data.categoryBreakdown.map((s) => ({
            name: s.label,
            value: s.value,
            color: s.color,
          }))}
          centreLabel="total"
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

      {/* Row I — spend widget, hidden in archival mode. */}
      {!archival && (
        <div className="lg:col-span-12">
          <DashboardSpendsPerCampaign data={data.spendsPerCampaign} />
        </div>
      )}

      {/* Row J */}
      <div className="lg:col-span-12">
        <DashboardCampaignKpis campaign={data.campaign} archival={archival} />
      </div>
    </div>
  );
}
