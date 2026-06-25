import { redirect } from "next/navigation";
import { Suspense } from "react";
import { History } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { DashboardFiltersBar } from "@/features/dashboard/filters";
import { DashboardOverviewStrip } from "@/features/dashboard/overview-strip";
import { DashboardBento } from "@/features/dashboard/dashboard-bento";
import {
  fetchDashboardData,
  fetchDashboardFilterOptions,
} from "@/features/dashboard/queries";
import type { DashboardFilters } from "@/features/dashboard/types";

export const metadata = { title: "Historic Analytics" };

/**
 * Historic Analytics — the archive-only counterpart to the Dashboard Overview.
 * Reuses the entire command-centre bento (filter bar → headline KPI strip →
 * bento) but points every posts-driven query at the migrated archive via the
 * `historic_posts_dash` view (the `tableName` arg on the dashboard fetches).
 * Creators + campaigns still resolve from the live tables. Read-only.
 */
const HISTORIC_TABLE = "historic_posts_dash";

export default async function HistoricAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Same gate as Cost Analytics / Compliance / Funnel / Internal Dashboard.
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "performance_view")) redirect("/dashboard");

  const sp = await searchParams;
  const filters: DashboardFilters = {
    campaign: sp.campaign,
    status: sp.status,
    contentType: sp.contentType,
    influencerType: sp.influencerType,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
  };

  return (
    <div className="onboarding-stage dash-overview-stage historic-analytics-stage">
      <PageHeader
        icon={History}
        title="Historic Analytics"
        knowMore="historic-analytics"
      />

      <Suspense
        key={JSON.stringify(filters)}
        fallback={<StageSkeleton kind="board" kpiCount={4} />}
      >
        <HistoricAnalyticsBody filters={filters} />
      </Suspense>
    </div>
  );
}

async function HistoricAnalyticsBody({
  filters,
}: {
  filters: DashboardFilters;
}) {
  const [options, data] = await Promise.all([
    fetchDashboardFilterOptions(HISTORIC_TABLE),
    fetchDashboardData(filters, HISTORIC_TABLE),
  ]);
  return (
    <>
      <DashboardFiltersBar initial={filters} options={options} />
      <DashboardOverviewStrip data={data} />
      <DashboardBento data={data} />
    </>
  );
}
