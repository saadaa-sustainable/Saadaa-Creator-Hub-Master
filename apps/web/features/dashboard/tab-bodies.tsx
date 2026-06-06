/**
 * Dashboard tab bodies.
 *
 * Every non-Overview tab MIRRORS a SYSTEM-section sidebar page and renders the
 * SAME full view component that the standalone route renders — same feature
 * data-fetch, same KPI strips, same boards/charts, AND the same per-page stage
 * wrapper class (`.journey-stage`, `.ad-status-stage`, `.compliance-stage`, …).
 * That wrapper is load-bearing: each standalone route applies it on its outer
 * <div className="onboarding-stage <name>-stage">, and a large body of scoped
 * CSS (filter cards, KPI sizing, board/table layout, mobile-compact rules) is
 * keyed off it. Dropping it was why the tabs looked different from the sidebar
 * pages — the components rendered, but their stage-scoped styling did not.
 *
 * Each tab body therefore re-creates the standalone page MINUS its <PageHeader>
 * (the Dashboard shell already owns one): same wrapper class + same filter bar
 * + same body components in the same order. The result is pixel-identical to
 * the standalone route below its title.
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
  // `dash-tab-stack` gives the overview strip + bento the same compact-aware
  // vertical rhythm as the other tabs (1rem desktop / 0.72rem mobile under
  // `.dash-compact`).
  return (
    <div className="dash-tab-stack">
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
  // Wrapper class mirrors /journey's `<div className="onboarding-stage
  // journey-stage">`; JourneyPageClient renders its own filter bar inside.
  return (
    <div className="journey-stage">
      <JourneyPageClient
        columns={columns}
        kpi={kpi}
        funnel={funnel}
        initialFilters={journeyFilters}
        filterOptions={filterOptions}
      />
    </div>
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
  // Mirrors /tat's `<div className="onboarding-stage">` — TAT has no extra
  // stage class, but the filter bar and the client body are separated by the
  // `.onboarding-stage` grid gap, reproduced here via `dash-tab-stack`.
  return (
    <div className="dash-tab-stack">
      <TatFiltersBar initial={tatFilters} options={options} />
      <TatPageClient tatData={tatData} campaignTats={campaignTats} kpi={kpi} />
    </div>
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
  // Mirrors /performance/ad-run-status's `<div className="onboarding-stage
  // ad-status-stage">` — the `ad-status-stage` class scopes the card layout,
  // link actions and ad-list table column widths, so it must wrap the body.
  // The standalone separates the filter bar from the KPI+board block by the
  // `.onboarding-stage` grid gap; here `dash-tab-stack` reproduces that gap
  // and keeps the KPI strip + board as one gap-free unit (the standalone
  // renders them inside one Suspense slot with no gap between them).
  return (
    <div className="ad-status-stage dash-tab-stack">
      <AdStatusFiltersBar initial={adFilters} options={options} />
      <div>
        <AdStatusKpiStrip kpi={kpi} />
        <AdStatusBoard untested={untested} adRun={adRun} filters={adFilters} />
      </div>
    </div>
  );
}

// ── Compliance KPIs ────────────────────────────────────────────────────────────
// Mirrors /compliance — the full ComplianceBody view (no filters at page level).
export async function ComplianceTabBody() {
  const data = await fetchComplianceData();
  // Mirrors /compliance's `<div className="onboarding-stage compliance-stage">`
  // — the `compliance-stage` class scopes section radii, table layout and the
  // mobile-compact rules, so it must wrap the body.
  return (
    <div className="compliance-stage">
      <ComplianceBody data={data} />
    </div>
  );
}

// ── Cost Analytics ─────────────────────────────────────────────────────────────
// Mirrors /cost-analytics — the full CostAnalyticsBody view.
export async function CostTabBody() {
  const data = await fetchCostAnalyticsData();
  // Mirrors /cost-analytics's `<div className="onboarding-stage
  // cost-analytics-stage">`.
  return (
    <div className="cost-analytics-stage">
      <CostAnalyticsBody data={data} />
    </div>
  );
}

// ── Funnel View ────────────────────────────────────────────────────────────────
// Mirrors /funnel — the full FunnelBody view.
export async function FunnelTabBody() {
  const data = await fetchFunnelData();
  // Mirrors /funnel's `<div className="onboarding-stage funnel-stage">` — the
  // `funnel-stage` class scopes section radii, table layout and mobile-compact.
  return (
    <div className="funnel-stage">
      <FunnelBody data={data} />
    </div>
  );
}

// ── Internal Dashboard ─────────────────────────────────────────────────────────
// Mirrors /internal-dashboard — the full InternalDashboardBody view.
export async function InternalTabBody() {
  const data = await fetchInternalDashboardData();
  // Mirrors /internal-dashboard's `<div className="onboarding-stage
  // internal-dashboard-stage">`.
  return (
    <div className="internal-dashboard-stage">
      <InternalDashboardBody data={data} />
    </div>
  );
}
