import { redirect } from "next/navigation";
import { Suspense } from "react";
import { UserMinus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { OffboardingFiltersBar } from "@/features/offboarding/filters";
import { OffboardingKpiStrip } from "@/features/offboarding/kpi-strip";
import { OffboardingBoard } from "@/features/offboarding/offboarding-board";
import {
  fetchOffboardingData,
  fetchOffboardingFilterOptions,
} from "@/features/offboarding/queries";
import type { OffboardingFilters } from "@/features/offboarding/types";

export const metadata = { title: "Offboarding" };

export default async function OffboardingPage({
  searchParams,
}: {
  searchParams: Promise<OffboardingFilters>;
}) {
  // Gate the whole page to offboarding_write (admins, incl. Tanvi, hold it).
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "offboarding_write"))
    redirect("/dashboard");

  const params = await searchParams;
  const options = await fetchOffboardingFilterOptions();

  return (
    <div className="onboarding-stage offboarding-stage">
      <PageHeader icon={UserMinus} title="Offboarding" knowMore="offboarding" />

      {/* Filter ABOVE KPI — standing layout rule. */}
      <OffboardingFiltersBar initial={params} options={options} />

      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={6} />}
      >
        <OffboardingBody params={params} />
      </Suspense>
    </div>
  );
}

async function OffboardingBody({ params }: { params: OffboardingFilters }) {
  const { candidates, offboarded, kpi } = await fetchOffboardingData(params);
  return (
    <>
      <OffboardingKpiStrip kpi={kpi} />
      <OffboardingBoard
        candidates={candidates}
        offboarded={offboarded}
        filters={params}
      />
    </>
  );
}
