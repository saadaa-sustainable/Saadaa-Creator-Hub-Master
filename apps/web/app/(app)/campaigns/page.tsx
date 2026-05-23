import Link from "next/link";
import { Plus, Rocket } from "lucide-react";
import { ExistingCampaigns } from "@/features/campaigns/existing-campaigns";
import { fetchCampaigns } from "@/features/campaigns/queries";
import { assertPermission } from "@/lib/rbac.server";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await assertPermission("reachout_outbound");
  const campaigns = await fetchCampaigns();

  return (
    <div className="campaign-list-page">
      <header className="campaign-list-header">
        <div>
          <span className="campaign-list-eyebrow">
            <Rocket size={13} />
            Campaign Stage
          </span>
          <h1>Campaigns</h1>
          <p>
            Server-generated IFC IDs, tracker budget lines, and campaign briefs
            for downstream Reach Out and Onboarding.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="btn btn-primary campaign-list-new"
        >
          <Plus size={14} />
          New Campaign
        </Link>
      </header>

      <ExistingCampaigns campaigns={campaigns} showCreateAction />
    </div>
  );
}
