import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { DashboardBento } from "@/features/dashboard/dashboard-bento";
import { DashboardFiltersBar } from "@/features/dashboard/filters";
import {
  fetchDashboardData,
  fetchDashboardFilterOptions,
} from "@/features/dashboard/queries";
import type { DashboardFilters } from "@/features/dashboard/types";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardFilters>;
}) {
  const params = await searchParams;
  const options = await fetchDashboardFilterOptions();

  return (
    <div className="onboarding-stage dash-stage">
      <PageHeader icon={LayoutDashboard} title="Dashboard" knowMore="dashboard" />
      <DashboardFiltersBar initial={params} options={options} />
      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={4} />}
      >
        <DashboardBody params={params} />
      </Suspense>
    </div>
  );
}

async function DashboardBody({ params }: { params: DashboardFilters }) {
  const data = await fetchDashboardData(params);
  return <DashboardBento data={data} />;
}
