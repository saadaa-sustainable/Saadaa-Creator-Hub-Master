import { Suspense } from "react";
import { UserRoundCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { OnboardingFiltersBar } from "@/features/onboarding/filters";
import { OnboardingKpiStrip } from "@/features/onboarding/kpi-strip";
import { OnboardingTable } from "@/features/onboarding/onboarding-table";
import {
  fetchOnboardingFilterOptions,
  fetchOnboardingKpis,
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
      <PageHeader icon={UserRoundCheck} title="Onboarding" knowMore="onboarding" />

      <OnboardingFiltersBar initial={params} options={options} />

      <Suspense
        key={`kpi-${params.reachedOutBy ?? ""}`}
        fallback={<KpiSkeleton rows={2} />}
      >
        <OnboardingKpiSection filters={params} />
      </Suspense>

      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={10} cols={10} />}
      >
        <OnboardingTableSection filters={params} />
      </Suspense>
    </div>
  );
}

async function OnboardingKpiSection({
  filters,
}: {
  filters: OnboardingFilters;
}) {
  const kpi = await fetchOnboardingKpis(filters);
  return <OnboardingKpiStrip kpi={kpi} />;
}

async function OnboardingTableSection({
  filters,
}: {
  filters: OnboardingFilters;
}) {
  const rows = await fetchOnboardingTable(filters);
  return <OnboardingTable rows={rows} />;
}

function KpiSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <section className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="acc-kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="acc-kpi acc-kpi--skeleton" aria-hidden />
          ))}
        </div>
      ))}
    </section>
  );
}
