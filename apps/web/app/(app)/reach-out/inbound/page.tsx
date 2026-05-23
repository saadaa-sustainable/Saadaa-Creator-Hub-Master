import { redirect } from "next/navigation";
import { ArrowDownLeft, Inbox } from "lucide-react";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { InboundForm } from "@/features/reach-out/inbound-form";
import { fetchCampaignsForSelect } from "@/features/reach-out/queries";

export const metadata = { title: "Reach Out — Inbound" };

export default async function Page() {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "reachout_inbound"))
    redirect("/dashboard");

  const campaigns = await fetchCampaignsForSelect();

  return (
    <>
      <PageHeader
        icon={ArrowDownLeft}
        title="Reach Out · Inbound"
        modePill={{ label: "They reached us", icon: Inbox }}
      />
      <InboundForm campaigns={campaigns} />
    </>
  );
}
