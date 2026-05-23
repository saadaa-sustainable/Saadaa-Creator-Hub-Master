import { CampaignCreateSwitcher } from "@/features/campaigns/create-switcher";
import { fetchCampaigns } from "@/features/campaigns/queries";
import { assertPermission } from "@/lib/rbac.server";

export const metadata = { title: "New Campaign" };

export default async function NewCampaignPage() {
  await assertPermission("campaign_create");
  const campaigns = await fetchCampaigns();

  return (
    <div className="campaign-create-page space-y-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          New Campaign
        </h1>
        <p className="text-sm text-text-secondary">
          Server generates the IFC{"{NNN}"} ID. Budget rolls up automatically.
        </p>
      </header>
      <CampaignCreateSwitcher campaigns={campaigns} />
    </div>
  );
}
