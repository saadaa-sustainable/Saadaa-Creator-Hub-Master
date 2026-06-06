/**
 * Dashboard tab bodies.
 *
 * Every non-Overview tab MIRRORS a SYSTEM-section sidebar page and renders the
 * SAME full view component that the standalone route renders — same feature
 * data-fetch, same KPI strips, same boards/charts. The only adaptation is that
 * the per-page <PageHeader> is dropped (the Dashboard shell already owns one),
 * so each tab renders just the inner content of that view.
 *
 * Filter bars that a view renders at its own page level (Journey embeds its bar
 * inside the client; TAT + Ad Status render theirs above the body) are kept so
 * the experience is identical. Their URL keys (campaign / tier / status /
 * search / classification / …) don't collide with `?tab=`, so they coexist.
 */

// ── Overview (dashboard-native aggregate) ───────────────────────────────────
import { fetchDashboardData } from "./queries";
import { DashboardOverviewStrip } from "./overview-strip";
import { DashboardBento } from "./dashboard-bento";
import type { DashboardFilters } from "./types";

// ── Influencer Journey ──────────────────────────────────────────────────────
import { JourneyPageClient } from "@/features/journey/page-client";
import {
  fetchJourneyData,
  fetchJourneyFilterOptions,
} from "@/features/journey/queries";
import type { JourneyFilters } from "@/features/journey/types";

// ── TAT Analytics ────────────────────────────────────────────────────────────
import { TatFiltersBar } from "@/features/tat/filters";
import { TatPageClient } from "@/features/tat/page-client";
import { fetchTatData, fetchTatFilterOptions } from "@/features/tat/queries";
import type { TatFilters } from "@/features/tat/types";

// ── Ad Status ─────────────────────────────────────────────────────────────────
import { AdStatusFiltersBar } from "@/features/ad-status/filters";
import { AdStatusBoard } from "@/features/ad-status/ad-board";
import { AdStatusKpiStrip } from "@/features/ad-status/kpi-strip";
import {
  fetchAdStatusData,
  fetchAdStatusFilterOptions,
} from "@/features/ad-status/queries";
import type { AdStatusFilters } from "@/features/ad-status/types";

// ── Compliance KPIs ────────────────────────────────────────────────────────────
import { fetchComplianceData } from "@/features/compliance/queries";
import { ComplianceBody } from "@/features/compliance/page-client";

// ── Cost Analytics ─────────────────────────────────────────────────────────────
import { fetchCostAnalyticsData } from "@/features/cost-analytics/queries";
import { CostAnalyticsBody } from "@/features/cost-analytics/page-client";

// ── Funnel View ────────────────────────────────────────────────────────────────
import { fetchFunnelData } from "@/features/funnel/queries";
import { FunnelBody } from "@/features/funnel/page-client";

// ── Internal Dashboard ─────────────────────────────────────────────────────────
import { fetchInternalDashboardData } from "@/features/internal-dashboard/queries";
import { InternalDashboardBody } from "@/features/internal-dashboard/page-client";

/**
 * Raw search params for the Dashboard route. Carries the `tab` slug plus every
 * embedded view's own filter keys (campaign, tier, status, search, …). Each tab
 * body picks the keys its feature fetch understands.
 */
export type TabSearchParams = Record<string, string | undefined> & {
  tab?: string;
};

// ── Overview ──────────────────────────────────────────────────────────────
// Reuses the existing dashboard aggregate: headline cross-system KPI strip on
// top, then the full bento command-centre (preserves all prior content).
export async function OverviewTabBody({ params }: { params: DashboardFilters }) {
  const data = await fetchDashboardData(params);
  return (
    <div className="flex flex-col gap-4">
      <DashboardOverviewStrip data={data} />
      <DashboardBento data={data} />
    </div>
  );
}

// ── Influencer Journey ──────────────────────────────────────────────────────
// Mirrors /journey. JourneyPageClient already renders its own filter bar, KPI
// strip, funnel strip and board, so embedding it = the full journey view.
export async function JourneyTabBody({ sp }: { sp: TabSearchParams }) {
  const journeyFilters: JourneyFilters = { campaign: sp.campaign };
  const [{ columns, kpi, funnel }, filterOptions] = await Promise.all([
    fetchJourneyData(journeyFilters),
    fetchJourneyFilterOptions(),
  ]);
  return (
    <JourneyPageClient
      columns={columns}
      kpi={kpi}
      funnel={funnel}
      initialFilters={journeyFilters}
      filterOptions={filterOptions}
    />
  );
}

// ── TAT Analytics ────────────────────────────────────────────────────────────
// Mirrors /tat: filter bar above, then the full TatPageClient (KPI strip +
// three TAT section grids + campaign benchmark chart).
export async function TatTabBody({ sp }: { sp: TabSearchParams }) {
  const tatFilters: TatFilters = {
    campaign: sp.campaign,
    tier: sp.tier,
    status:
      sp.status === "posted" || sp.status === "delivered"
        ? sp.status
        : undefined,
    reachOutFrom: sp.reachOutFrom,
    reachOutTo: sp.reachOutTo,
  };
  const [{ tatData, campaignTats, kpi }, options] = await Promise.all([
    fetchTatData(tatFilters),
    fetchTatFilterOptions(),
  ]);
  return (
    <>
      <TatFiltersBar initial={tatFilters} options={options} />
      <TatPageClient tatData={tatData} campaignTats={campaignTats} kpi={kpi} />
    </>
  );
}

// ── Ad Status ─────────────────────────────────────────────────────────────────
// Mirrors /performance/ad-run-status: filter bar, KPI strip, then the ad board
// (untested + ad-run sections).
export async function AdStatusTabBody({ sp }: { sp: TabSearchParams }) {
  const adFilters: AdStatusFilters = {
    campaign: sp.campaign,
    classification: sp.classification,
    adStatus: sp.adStatus,
    search: sp.search,
  };
  const [{ untested, adRun, kpi }, options] = await Promise.all([
    fetchAdStatusData(adFilters),
    fetchAdStatusFilterOptions(),
  ]);
  return (
    <>
      <AdStatusFiltersBar initial={adFilters} options={options} />
      <AdStatusKpiStrip kpi={kpi} />
      <AdStatusBoard untested={untested} adRun={adRun} filters={adFilters} />
    </>
  );
}

// ── Compliance KPIs ────────────────────────────────────────────────────────────
// Mirrors /compliance — the full ComplianceBody view (no filters at page level).
export async function ComplianceTabBody() {
  const data = await fetchComplianceData();
  return <ComplianceBody data={data} />;
}

// ── Cost Analytics ─────────────────────────────────────────────────────────────
// Mirrors /cost-analytics — the full CostAnalyticsBody view.
export async function CostTabBody() {
  const data = await fetchCostAnalyticsData();
  return <CostAnalyticsBody data={data} />;
}

// ── Funnel View ────────────────────────────────────────────────────────────────
// Mirrors /funnel — the full FunnelBody view.
export async function FunnelTabBody() {
  const data = await fetchFunnelData();
  return <FunnelBody data={data} />;
}

// ── Internal Dashboard ─────────────────────────────────────────────────────────
// Mirrors /internal-dashboard — the full InternalDashboardBody view.
export async function InternalTabBody() {
  const data = await fetchInternalDashboardData();
  return <InternalDashboardBody data={data} />;
}
