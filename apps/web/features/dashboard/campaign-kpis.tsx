import { Banknote, Megaphone, Users, Wallet2 } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/cn";
import { CountUpInt, CountUpRupees } from "./count-up-stats";
import type { DashboardData } from "./types";

const TONE = {
  pink: "acc-kpi--accent",
  info: "acc-kpi--info",
  success: "acc-kpi--success",
  muted: "acc-kpi--muted",
} as const;

export function DashboardCampaignKpis({
  campaign,
  archival = false,
}: {
  campaign: DashboardData["campaign"];
  /** Hide the spend-derived "Total Spend" card for archive-only views. */
  archival?: boolean;
}) {
  return (
    <section>
      <div className="acc-kpi-group">
        {archival ? "Campaign" : "Campaign & Spend"}
      </div>
      <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
        <div className={cn("acc-kpi bento-tile", TONE.pink)}>
          <div className="acc-kpi__head">
            <span className="acc-kpi__icon" aria-hidden>
              <Users size={16} />
            </span>
            <span className="acc-kpi__label">Total Creators</span>
            <InfoTooltip
              title="Total Creators"
              content="Unique creators represented in the current filter scope."
            />
          </div>
          <div className="acc-kpi__primary tabular">
            <CountUpInt value={campaign.totalCreators} />
          </div>
          <div className="acc-kpi__secondary tabular">
            Unique INF_IDs in scope
          </div>
        </div>
        <div className={cn("acc-kpi bento-tile", TONE.info)}>
          <div className="acc-kpi__head">
            <span className="acc-kpi__icon" aria-hidden>
              <Megaphone size={16} />
            </span>
            <span className="acc-kpi__label">Active Campaigns</span>
            <InfoTooltip
              title="Active Campaigns"
              content="Campaigns with collaboration activity in the current filter scope."
            />
          </div>
          <div className="acc-kpi__primary tabular">
            <CountUpInt value={campaign.activeCampaigns} />
          </div>
          <div className="acc-kpi__secondary tabular">In current window</div>
        </div>
        {!archival && (
          <div className={cn("acc-kpi bento-tile", TONE.success)}>
            <div className="acc-kpi__head">
              <span className="acc-kpi__icon" aria-hidden>
                <Banknote size={16} />
              </span>
              <span className="acc-kpi__label">Total Spend</span>
              <InfoTooltip
                title="Total Spend"
                content="The total commercial amount recorded for collaborations in the current filter scope."
              />
            </div>
            <div className="acc-kpi__primary tabular">
              <CountUpRupees value={campaign.totalSpend} />
            </div>
            <div className="acc-kpi__secondary tabular">Commercial amount</div>
          </div>
        )}
        <div className={cn("acc-kpi bento-tile", TONE.muted)}>
          <div className="acc-kpi__head">
            <span className="acc-kpi__icon" aria-hidden>
              <Wallet2 size={16} />
            </span>
            <span className="acc-kpi__label">Paid Collabs</span>
            <InfoTooltip
              title="Paid Collabs"
              content="Collaborations marked paid with a payment reference recorded."
            />
          </div>
          <div className="acc-kpi__primary tabular">
            <CountUpInt value={campaign.paidCount} />
          </div>
          <div className="acc-kpi__secondary tabular">
            UTR logged · status Done
          </div>
        </div>
      </div>
    </section>
  );
}
