import { Rocket } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignCreateSwitcher } from "@/features/campaigns/create-switcher";
import { fetchCampaigns } from "@/features/campaigns/queries";
import { assertPermission } from "@/lib/rbac.server";
import { hasPermission } from "@/lib/rbac";

export const metadata = { title: "New Campaign" };

export default async function NewCampaignPage() {
  // Reaching this page already requires campaign_create (Campaign Owner /
  // Global Admin), so canManage is effectively true — computed for parity.
  const actor = await assertPermission("campaign_create");
  const canManage =
    hasPermission(actor, "campaign_create") ||
    hasPermission(actor, "campaign_edit");
  const campaigns = await fetchCampaigns();

  return (
    <div className="campaign-create-page space-y-4">
      <PageHeader icon={Rocket} title="New Campaign" knowMore="campaigns" />
      <p className="text-sm text-text-secondary">
        Server generates the IFC{"{NNN}"} ID. Budget rolls up automatically.
      </p>
      <CampaignCreateSwitcher campaigns={campaigns} canManage={canManage} />
    </div>
  );
}
