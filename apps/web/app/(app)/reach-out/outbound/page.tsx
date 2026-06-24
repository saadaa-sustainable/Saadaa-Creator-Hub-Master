import { redirect } from "next/navigation";
import { ArrowUpRight, Send } from "lucide-react";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { OutboundForm } from "@/features/reach-out/outbound-form";
import { HistoricCreatorButton } from "@/features/reach-out/historic-creator-modal";
import { fetchCampaignsForSelect } from "@/features/reach-out/queries";

export const metadata = { title: "Reach Out — Outbound" };

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "reachout_outbound"))
    redirect("/dashboard");

  const params = await searchParams;
  const campaignParam = params?.campaign ?? params?.campaignId;
  const initialCampaignId = Array.isArray(campaignParam)
    ? campaignParam[0]
    : campaignParam;

  const campaigns = await fetchCampaignsForSelect();

  return (
    <>
      <PageHeader
        icon={ArrowUpRight}
        title="Reach Out · Outbound"
        modePill={{ label: "We initiate", icon: Send }}
        knowMore="reach-out-outbound"
        actions={<HistoricCreatorButton />}
      />
      <OutboundForm
        campaigns={campaigns}
        initialCampaignId={initialCampaignId}
      />
    </>
  );
}
