import { Rocket } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignCreateSwitcher } from "@/features/campaigns/create-switcher";
import { fetchCampaigns } from "@/features/campaigns/queries";
import { assertPermission } from "@/lib/rbac.server";

export const metadata = { title: "New Campaign" };

export default async function NewCampaignPage() {
  await assertPermission("campaign_create");
  const campaigns = await fetchCampaigns();

  return (
    <div className="campaign-create-page space-y-4">
      <PageHeader icon={Rocket} title="New Campaign" knowMore="campaigns" />
      <p className="text-sm text-text-secondary">
        Server generates the IFC{"{NNN}"} ID. Budget rolls up automatically.
      </p>
      <CampaignCreateSwitcher campaigns={campaigns} />
    </div>
  );
}
