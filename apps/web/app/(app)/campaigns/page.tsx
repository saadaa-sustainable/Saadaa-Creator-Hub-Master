import Link from "next/link";
import { Plus, Rocket } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ExistingCampaigns } from "@/features/campaigns/existing-campaigns";
import { BulkAssignCampaignPanel } from "@/features/campaigns/bulk-assign-panel";
import { fetchCampaigns } from "@/features/campaigns/queries";
import {
  fetchAssignableCampaigns,
  fetchUnassignedReachOuts,
} from "@/features/campaigns/bulk-assign-queries";
import { assertPermission } from "@/lib/rbac.server";
import { hasPermission } from "@/lib/rbac";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const actor = await assertPermission("reachout_outbound");
  // Campaign create/edit/close/reopen is Campaign Owner + Global Admin only.
  const canManage =
    hasPermission(actor, "campaign_create") ||
    hasPermission(actor, "campaign_edit");
  const [campaigns, unassigned, assignable] = await Promise.all([
    fetchCampaigns(),
    canManage ? fetchUnassignedReachOuts() : Promise.resolve([]),
    canManage ? fetchAssignableCampaigns() : Promise.resolve([]),
  ]);

  return (
    <div className="campaign-list-page space-y-4">
      <PageHeader icon={Rocket} title="Campaigns" knowMore="campaigns" />
      <div className="campaign-list-subhead">
        <p>
          Server-generated IFC IDs, tracker budget lines, and campaign briefs
          for downstream Reach Out and Onboarding.
        </p>
        {canManage && (
          <Link
            href="/campaigns/new"
            className="btn btn-primary campaign-list-new"
          >
            <Plus size={14} />
            New Campaign
          </Link>
        )}
      </div>

      <ExistingCampaigns
        campaigns={campaigns}
        showCreateAction={canManage}
        canManage={canManage}
      />

      {canManage && (
        <BulkAssignCampaignPanel rows={unassigned} campaigns={assignable} />
      )}
    </div>
  );
}
