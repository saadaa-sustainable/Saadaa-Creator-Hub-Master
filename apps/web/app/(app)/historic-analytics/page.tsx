import { redirect } from "next/navigation";
import { Suspense } from "react";
import { History } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { DashboardInteractionLayer } from "@/features/dashboard/interaction-layer";
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
import { AdStatusFiltersBar } from "@/features/ad-status/filters";
import { AdStatusKpiStrip } from "@/features/ad-status/kpi-strip";
import { AdStatusBoard } from "@/features/ad-status/ad-board";
import {
  fetchAdStatusData,
  fetchAdStatusFilterOptions,
} from "@/features/ad-status/queries";
import type {
  AdStatusFilters,
  AdStatusRow,
  AdStatusKpi,
} from "@/features/ad-status/types";
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
        : sp.view === "ad-status"
          ? "ad-status"
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
    <DashboardInteractionLayer
      className="onboarding-stage dash-overview-stage historic-analytics-stage"
      variant="historic"
    >
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
      ) : view === "ad-status" ? (
        <Suspense
          key="ad-status"
          fallback={<StageSkeleton kind="board" kpiCount={6} />}
        >
          <HistoricAdStatusBody
            adFilters={{
              campaign: sp.campaign,
              classification: sp.classification,
              adStatus: sp.adStatus,
              search: sp.search,
              sort: sp.sort,
            }}
          />
        </Suspense>
      ) : (
        <Suspense
          key={JSON.stringify(filters)}
          fallback={<StageSkeleton kind="board" kpiCount={4} />}
        >
          <HistoricAnalyticsBody filters={filters} />
        </Suspense>
      )}
    </DashboardInteractionLayer>
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
      <FunnelBody data={data} source="historic" />
    </div>
  );
}

async function HistoricInternalBody() {
  const data = await fetchInternalDashboardData(HISTORIC_TABLE);
  // Mirrors /internal-dashboard below its header, fed by the migrated archive.
  return (
    <div className="onboarding-stage internal-dashboard-stage">
      <InternalDashboardBody data={data} source="historic" />
    </div>
  );
}

/** Recompute the Ad Status KPI over a subset of rows (post-hoc, from row fields)
 *  — mirrors the live counting in fetchAdStatusData so the historic-only view's
 *  KPI matches its board. */
function computeHistoricAdKpi(rows: AdStatusRow[]): AdStatusKpi {
  const k: AdStatusKpi = {
    totalEligible: 0,
    classified: 0,
    inMetaAds: 0,
    pendingClassification: 0,
    winners: 0,
    discarded: 0,
    categories: {
      incrementalWinners: 0,
      winners: 0,
      p0: 0,
      p1: 0,
      p2: 0,
      discarded: 0,
    },
  };
  for (const r of rows) {
    k.totalEligible++;
    if (r.isClassified) k.classified++;
    else k.pendingClassification++;
    if (r.isInMetaAds) k.inMetaAds++;
    if (r.adsResults === "Winner") k.winners++;
    if (r.adsResults === "Discarded" || r.adsResults === "Discarded but analyse")
      k.discarded++;
    switch (r.warehouseCategory) {
      case "Incremental Winner": k.categories.incrementalWinners++; break;
      case "Winner": k.categories.winners++; break;
      case "P0 analysis": k.categories.p0++; break;
      case "P1 analysis": k.categories.p1++; break;
      case "P2 analysis": k.categories.p2++; break;
      case "Discarded": k.categories.discarded++; break;
    }
  }
  return k;
}

async function HistoricAdStatusBody({
  adFilters,
}: {
  adFilters: AdStatusFilters;
}) {
  // Same Ad Status board as the main Dashboard, scoped to the HISTORIC archive
  // rows (the ads ran in the past). fetchAdStatusData already tags each row's
  // source; we keep only historic and recompute the KPI to match.
  const [options, data] = await Promise.all([
    fetchAdStatusFilterOptions(),
    fetchAdStatusData(adFilters),
  ]);
  const untested = data.untested.filter((r) => r.source === "historic");
  const adRun = data.adRun.filter((r) => r.source === "historic");
  const kpi = computeHistoricAdKpi([...untested, ...adRun]);
  return (
    <div className="onboarding-stage ad-status-stage">
      <AdStatusFiltersBar initial={adFilters} options={options} />
      <AdStatusKpiStrip kpi={kpi} />
      <AdStatusBoard untested={untested} adRun={adRun} filters={adFilters} />
    </div>
  );
}
