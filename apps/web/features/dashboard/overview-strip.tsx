import {
  AlarmClock,
  CircleDollarSign,
  ClipboardList,
  Megaphone,
  PackageCheck,
  Send,
  UserRoundCheck,
  Users,
  Wallet,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { HeroKpi } from "./bento-kit";
import type { DashboardData } from "./types";

interface RailSegment {
  label: string;
  value: number;
  color: string;
}

function fmt(value: number): string {
  return value.toLocaleString("en-IN");
}

function MiniRail({
  label,
  info,
  segments,
}: {
  label: string;
  info: string;
  segments: RailSegment[];
}) {
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  const total = visibleSegments.reduce(
    (sum, segment) => sum + segment.value,
    0,
  );
  const ariaLabel = `${label}: ${visibleSegments
    .map((segment) => `${segment.label} ${fmt(segment.value)}`)
    .join(", ")}`;

  return (
    <div className="dashboard-overview-rail" role="img" aria-label={ariaLabel}>
      <div className="dashboard-overview-rail__head">
        <strong>{label}</strong>
        <InfoTooltip title={label} content={info} side="left" />
      </div>
      <div className="dashboard-overview-rail__track" aria-hidden="true">
        {total > 0 ? (
          visibleSegments.map((segment) => (
            <span
              key={segment.label}
              className="dashboard-overview-rail__fill"
              style={{
                width: `${Math.max(1, (segment.value / total) * 100)}%`,
                background: segment.color,
              }}
            />
          ))
        ) : (
          <span className="dashboard-overview-rail__empty" />
        )}
      </div>
      <div className="dashboard-overview-rail__legend">
        {visibleSegments.length > 0 ? (
          visibleSegments.map((segment) => (
            <span key={segment.label}>
              <span
                className="dashboard-overview-rail__dot"
                style={{ background: segment.color }}
                aria-hidden="true"
              />
              {segment.label}
              <strong>{fmt(segment.value)}</strong>
            </span>
          ))
        ) : (
          <span>No records in scope</span>
        )}
      </div>
    </div>
  );
}

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
    <section className="dashboard-overview-strip">
      <div className="dashboard-overview-command" data-dashboard-card>
        <div className="dashboard-overview-command__brief">
          <div className="dashboard-overview-command__title">
            <span>
              <ClipboardList size={15} aria-hidden /> Operational briefing
            </span>
            <InfoTooltip
              title="Operational briefing"
              content="A quick read of pipeline size, conversion, posting progress, and work that needs attention. All figures follow the filters above."
            />
          </div>
          <div className="dashboard-overview-command__number">
            <strong>{fmt(totalPipeline)}</strong>
            <span>
              {archival ? "archived collabs" : "live collabs in pipeline"}
            </span>
          </div>
          <p>
            {fmt(pipeline.posted)} posted from {fmt(pipeline.onboarded)}{" "}
            onboarded.
            {archival
              ? ` ${fmt(campaign.totalCreators)} creators are represented in this archive.`
              : ` ${fmt(attentionTotal)} action checks currently need attention.`}
          </p>
          <div className="dashboard-overview-command__signals">
            <div>
              <span>Reach-out conversion</span>
              <strong>{pipeline.conversionPct}%</strong>
            </div>
            <div>
              <span>Posting rate</span>
              <strong>{pipeline.postRatePct}%</strong>
            </div>
            <div>
              <span>{archival ? "Paid collabs" : "Overdue actions"}</span>
              <strong>
                {archival ? campaign.paidCount : data.actions.overdue}
              </strong>
            </div>
          </div>
        </div>

        <div className="dashboard-overview-command__charts">
          <MiniRail
            label="Scope mix"
            info="Compares unique creators, collab rows, and active campaigns in the current filter scope. The sizes are relative within this rail."
            segments={[
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
            ]}
          />
          <MiniRail
            label="Pipeline movement"
            info="Shows how the current pipeline is distributed between reached out, onboarded, and posted deliverables. A large early-stage share means more work is waiting upstream."
            segments={[
              {
                label: "Reach Out",
                value: pipeline.reachOut,
                color: "#3B6FD4",
              },
              {
                label: "Onboarded",
                value: pipeline.onboarded,
                color: "#7B4FBF",
              },
              { label: "Posted", value: pipeline.posted, color: "#4F7C4D" },
            ]}
          />
          <MiniRail
            label={archival ? "Outcome mix" : "Attention pressure"}
            info={
              archival
                ? "Compares posted work, ad winners, and paid collabs in the archive."
                : "Compares the main queues requiring follow-up: email, order creation, overdue work, and pending payment."
            }
            segments={
              archival
                ? [
                    {
                      label: "Posted",
                      value: pipeline.posted,
                      color: "#4F7C4D",
                    },
                    {
                      label: "Ad winners",
                      value: pipeline.adWinners,
                      color: "#7B4FBF",
                    },
                    {
                      label: "Paid",
                      value: campaign.paidCount,
                      color: "#B57514",
                    },
                  ]
                : [
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
                      label: "Overdue",
                      value: data.actions.overdue,
                      color: "#C0392B",
                    },
                    {
                      label: "Payments",
                      value: pipeline.paymentPending,
                      color: "#161513",
                    },
                  ]
            }
          />
        </div>
      </div>

      <div className="dashboard-overview-priority-grid bento-stagger">
        <HeroKpi
          color="#B57514"
          icon={<Megaphone size={15} aria-hidden />}
          label="Active Campaigns"
          value={campaign.activeCampaigns}
          sub="Campaigns currently in scope"
          info="Campaigns marked active after the filters above are applied. Closed and pending campaigns are not counted here."
        />
        <HeroKpi
          color="#3B6FD4"
          icon={<Users size={15} aria-hidden />}
          label="Creators in Pipeline"
          value={campaign.totalCreators}
          sub="Unique creator accounts"
          info="Unique creators represented by the collabs in scope. A creator is counted once even when they have several deliverables."
        />
        <HeroKpi
          color="#3B6FD4"
          icon={<Send size={15} aria-hidden />}
          label="Reach Out"
          value={pipeline.reachOut}
          sub="Waiting for onboarding"
          info="Deliverables still in the Reach Out stage and not yet moved into onboarding."
        />
        <HeroKpi
          color="#7B4FBF"
          icon={<UserRoundCheck size={15} aria-hidden />}
          label="Onboarded"
          value={pipeline.onboarded}
          sub={`${pipeline.conversionPct}% of reach-outs`}
          info="Deliverables accepted into the collaboration and waiting to be posted. The percentage compares onboarded work with reached-out work."
        />
        <HeroKpi
          color="#4F7C4D"
          icon={<PackageCheck size={15} aria-hidden />}
          label="Posted"
          value={pipeline.posted}
          sub={`${pipeline.postRatePct}% posting rate`}
          info="Deliverables whose posting form has been completed with a live content link."
        />
        <HeroKpi
          color="#B57514"
          icon={<AlarmClock size={15} aria-hidden />}
          label="Pending Content"
          value={pipeline.pendingContent}
          sub="Onboarded but not posted"
          info="Onboarded deliverables that still do not have a completed posting submission."
        />
        <HeroKpi
          color="#C0392B"
          icon={<CircleDollarSign size={15} aria-hidden />}
          label="Pending Payments"
          value={pipeline.paymentPending}
          sub="Eligible collabs awaiting settlement"
          info="Parent collabs whose every posting form is complete and whose creator accepted the partnership, but whose payment is still Not Due, Due, or Partial."
        />
        <HeroKpi
          color={archival ? "#161513" : "#B57514"}
          icon={
            archival ? (
              <ClipboardList size={15} aria-hidden />
            ) : (
              <Wallet size={15} aria-hidden />
            )
          }
          label={archival ? "Paid Collabs" : "Total Spend"}
          value={archival ? campaign.paidCount : campaign.totalSpend}
          sub={
            archival ? "Payment marked complete" : "Agreed commercial amount"
          }
          info={
            archival
              ? "Archived collabs whose payment status is marked complete."
              : "The sum of agreed commercial amounts for the collabs in scope. Barter value is not treated as cash spend unless stored as a commercial amount."
          }
          rupees={!archival}
        />
      </div>
    </section>
  );
}
