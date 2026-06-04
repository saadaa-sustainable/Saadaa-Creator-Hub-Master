import { Suspense } from "react";
import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AdStatusFiltersBar } from "@/features/ad-status/filters";
import { AdStatusBoard } from "@/features/ad-status/ad-board";
import { AdStatusKpiStrip } from "@/features/ad-status/kpi-strip";
import {
  fetchAdStatusData,
  fetchAdStatusFilterOptions,
} from "@/features/ad-status/queries";
import type { AdStatusFilters } from "@/features/ad-status/types";

export const metadata = { title: "Ad Status" };

export default async function AdStatusPage({
  searchParams,
}: {
  searchParams: Promise<AdStatusFilters>;
}) {
  const params = await searchParams;
  const options = await fetchAdStatusFilterOptions();

  return (
    <div className="onboarding-stage ad-status-stage">
      <PageHeader icon={Megaphone} title="Ad Status" knowMore="ad-status" />
      <AdStatusFiltersBar initial={params} options={options} />
      <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton rows={6} />}>
        <AdStatusBody params={params} />
      </Suspense>
    </div>
  );
}

async function AdStatusBody({ params }: { params: AdStatusFilters }) {
  const { untested, adRun, kpi } = await fetchAdStatusData(params);
  return (
    <>
      <AdStatusKpiStrip kpi={kpi} />
      <AdStatusBoard untested={untested} adRun={adRun} filters={params} />
    </>
  );
}
