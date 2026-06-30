import { Rocket } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignCreateSwitcher } from "@/features/campaigns/create-switcher";
import { fetchCampaigns } from "@/features/campaigns/queries";
import {
  fetchAssignableCampaigns,
  fetchUnassignedReachOuts,
} from "@/features/campaigns/bulk-assign-queries";
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
  const [campaigns, unassigned, assignable] = await Promise.all([
    fetchCampaigns(),
    canManage ? fetchUnassignedReachOuts() : Promise.resolve([]),
    canManage ? fetchAssignableCampaigns() : Promise.resolve([]),
  ]);

  return (
    <div className="campaign-create-page space-y-4">
      <PageHeader icon={Rocket} title="New Campaign" knowMore="campaigns" />
      <p className="text-sm text-text-secondary">
        Server generates the IFC{"{NNN}"} ID. Budget rolls up automatically.
      </p>
      <CampaignCreateSwitcher
        campaigns={campaigns}
        canManage={canManage}
        unassigned={unassigned}
        assignableCampaigns={assignable}
      />
    </div>
  );
}
