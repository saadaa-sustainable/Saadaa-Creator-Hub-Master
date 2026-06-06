import { Suspense } from "react";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
import { TatFiltersBar } from "@/features/tat/filters";
import { TatPageClient } from "@/features/tat/page-client";
import { fetchTatData, fetchTatFilterOptions } from "@/features/tat/queries";
import type { TatFilters } from "@/features/tat/types";

export const metadata = { title: "TAT Analytics" };

export default async function TatPage({
  searchParams,
}: {
  searchParams: Promise<TatFilters>;
}) {
  const params = await searchParams;
  const options = await fetchTatFilterOptions();

  return (
    <div className="onboarding-stage">
      <PageHeader icon={Clock} title="TAT Analytics" knowMore="tat" />
      <TatFiltersBar initial={params} options={options} />
      <Suspense
        key={JSON.stringify(params)}
        fallback={<StageSkeleton kind="chart" filter={false} />}
      >
        <TatBody params={params} />
      </Suspense>
    </div>
  );
}

async function TatBody({ params }: { params: TatFilters }) {
  const { tatData, campaignTats, kpi } = await fetchTatData(params);
  return <TatPageClient tatData={tatData} campaignTats={campaignTats} kpi={kpi} />;
}
