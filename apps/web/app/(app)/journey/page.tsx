import { Suspense } from "react";
import { Route } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { JourneyPageClient } from "@/features/journey/page-client";
import {
  fetchJourneyData,
  fetchJourneyFilterOptions,
} from "@/features/journey/queries";
import type { JourneyFilters } from "@/features/journey/types";

export const metadata = { title: "Influencer Journey" };

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<JourneyFilters>;
}) {
  const params = await searchParams;

  return (
    <div className="onboarding-stage journey-stage">
      <PageHeader icon={Route} title="Influencer Journey" knowMore="journey" />
      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={8} />}
      >
        <JourneyBody params={params} />
      </Suspense>
    </div>
  );
}

async function JourneyBody({ params }: { params: JourneyFilters }) {
  const [{ columns, kpi }, filterOptions] = await Promise.all([
    fetchJourneyData(params),
    fetchJourneyFilterOptions(),
  ]);

  return (
    <JourneyPageClient
      columns={columns}
      kpi={kpi}
      initialFilters={params}
      filterOptions={filterOptions}
    />
  );
}
