import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowUpRight, Send } from "lucide-react";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { OutboundForm } from "@/features/reach-out/outbound-form";
import { HistoricCreatorButton } from "@/features/reach-out/historic-creator-modal";
import { TodayReachoutCounter } from "@/features/reach-out/today-counter";
import { fetchCampaignsForSelect } from "@/features/reach-out/queries";
import { getReachoutPins } from "@/features/reach-out/prefs-actions";

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

  const [campaigns, pins] = await Promise.all([
    fetchCampaignsForSelect(),
    getReachoutPins(),
  ]);
  // A pinned campaign that no longer exists (or is no longer selectable) must
  // not pre-select a value the dropdown doesn't offer.
  if (
    pins.campaignId &&
    !campaigns.some((c) => c.campaign_id === pins.campaignId)
  ) {
    delete pins.campaignId;
  }

  return (
    <>
      <PageHeader
        icon={ArrowUpRight}
        title="Reach Out · Outbound"
        modePill={{ label: "We initiate", icon: Send }}
        knowMore="reach-out-outbound"
        actions={<HistoricCreatorButton />}
      />
      <Suspense fallback={null}>
        <TodayReachoutCounter direction="outbound" />
      </Suspense>
      <OutboundForm
        campaigns={campaigns}
        initialCampaignId={initialCampaignId}
        pins={pins}
      />
    </>
  );
}
