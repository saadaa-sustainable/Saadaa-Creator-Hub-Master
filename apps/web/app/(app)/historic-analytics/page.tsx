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
import { fetchFunnelData } from "@/features/funnel/queries";
import { FunnelBody } from "@/features/funnel/page-client";
import { fetchInternalDashboardData } from "@/features/internal-dashboard/queries";
import { InternalDashboardBody } from "@/features/internal-dashboard/page-client";
import { HistoricViewToggle } from "./view-toggle";

export const metadata = { title: "Historic Analytics" };

/**
 * Historic Analytics — the archive-only counterpart to the Dashboard Overview.
 * Reuses the entire command-centre bento (filter bar → headline KPI strip →
 * bento) but points every posts-driven query at the migrated archive via the
 * `historic_posts_dash` view (the `tableName` arg on the dashboard fetches).
 * Creators + campaigns still resolve from the live tables. Read-only.
 *
 * Spend is hidden everywhere here (`archival`) — the archive has no reliable
 * commercial amounts — and the funnel is offered as a `?view=funnel` sub-tab,
 * fed by `fetchFunnelData("historic_posts_dash")`.
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
  const view =
    sp.view === "funnel"
      ? "funnel"
      : sp.view === "internal"
        ? "internal"
        : "overview";
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

      <HistoricViewToggle active={view} />

      {view === "funnel" ? (
        <Suspense
          key="funnel"
          fallback={<StageSkeleton kind="board" kpiCount={9} />}
        >
          <HistoricFunnelBody />
        </Suspense>
      ) : view === "internal" ? (
        <Suspense
          key="internal"
          fallback={<StageSkeleton kind="board" kpiCount={6} />}
        >
          <HistoricInternalBody />
        </Suspense>
      ) : (
        <Suspense
          key={JSON.stringify(filters)}
          fallback={<StageSkeleton kind="board" kpiCount={4} />}
        >
          <HistoricAnalyticsBody filters={filters} />
        </Suspense>
      )}
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
      <DashboardOverviewStrip data={data} archival />
      <DashboardBento data={data} archival />
    </>
  );
}

async function HistoricFunnelBody() {
  const data = await fetchFunnelData(HISTORIC_TABLE);
  // Mirrors /funnel below its header: the same funnel-stage wrapper holding the
  // full FunnelBody, but fed by the migrated archive corpus.
  return (
    <div className="onboarding-stage funnel-stage">
      <FunnelBody data={data} />
    </div>
  );
}

async function HistoricInternalBody() {
  const data = await fetchInternalDashboardData(HISTORIC_TABLE);
  // Mirrors /internal-dashboard below its header, fed by the migrated archive.
  return (
    <div className="onboarding-stage internal-dashboard-stage">
      <InternalDashboardBody data={data} />
    </div>
  );
}
