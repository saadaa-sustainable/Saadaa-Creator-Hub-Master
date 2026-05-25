import Link from "next/link";
import { Plus, Rocket } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ExistingCampaigns } from "@/features/campaigns/existing-campaigns";
import { fetchCampaigns } from "@/features/campaigns/queries";
import { assertPermission } from "@/lib/rbac.server";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await assertPermission("reachout_outbound");
  const campaigns = await fetchCampaigns();

  return (
    <div className="campaign-list-page space-y-4">
      <PageHeader icon={Rocket} title="Campaigns" />
      <div className="campaign-list-subhead">
        <p>
          Server-generated IFC IDs, tracker budget lines, and campaign briefs
          for downstream Reach Out and Onboarding.
        </p>
        <Link
          href="/campaigns/new"
          className="btn btn-primary campaign-list-new"
        >
          <Plus size={14} />
          New Campaign
        </Link>
      </div>

      <ExistingCampaigns campaigns={campaigns} showCreateAction />
    </div>
  );
}
