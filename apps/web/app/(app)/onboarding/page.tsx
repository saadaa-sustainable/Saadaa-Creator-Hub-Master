import { Suspense } from "react";
import { UserRoundCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { OnboardingFiltersBar } from "@/features/onboarding/filters";
import { OnboardingTable } from "@/features/onboarding/onboarding-table";
import {
  fetchOnboardingFilterOptions,
  fetchOnboardingTable,
} from "@/features/onboarding/queries";
import type { OnboardingFilters } from "@/features/onboarding/types";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<OnboardingFilters>;
}) {
  const params = await searchParams;
  const options = await fetchOnboardingFilterOptions();

  return (
    <div className="onboarding-stage">
      <PageHeader icon={UserRoundCheck} title="Onboarding" />

      <OnboardingFiltersBar initial={params} options={options} />

      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={10} cols={10} />}
      >
        <OnboardingTableSection filters={params} />
      </Suspense>
    </div>
  );
}

async function OnboardingTableSection({
  filters,
}: {
  filters: OnboardingFilters;
}) {
  const rows = await fetchOnboardingTable(filters);
  return <OnboardingTable rows={rows} />;
}
