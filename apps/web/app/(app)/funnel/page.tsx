import { Suspense } from "react";
import { Filter } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
import { fetchFunnelData } from "@/features/funnel/queries";
import { FunnelBody } from "@/features/funnel/page-client";

export const metadata = { title: "Funnel View" };

export default async function FunnelPage() {
  return (
    <div className="onboarding-stage funnel-stage">
      <PageHeader icon={Filter} title="Funnel View" knowMore="funnel" />
      <Suspense fallback={<StageSkeleton kind="chart" kpiCount={5} />}>
        <FunnelData />
      </Suspense>
    </div>
  );
}

async function FunnelData() {
  const data = await fetchFunnelData();
  return <FunnelBody data={data} />;
}
