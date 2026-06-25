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
 * (the Dashboard shell already owns one): the SAME outer wrapper element
 * (`<div className="onboarding-stage <name>-stage">`) holding the SAME children
 * (filter bar, Suspense(s), KPI strips, boards) in the SAME order, reusing the
 * SAME components. Because `.onboarding-stage` supplies the `display:grid;
 * gap:1.25rem` rhythm that spaces filter → KPI → board on the standalone pages,
 * applying it on the tab body too makes each tab byte-for-byte identical to its
 * sidebar route below the title — at every breakpoint. No bespoke dashboard
 * sizing layer is involved.
 *
 * Filter bars that a view renders at its own page level (Journey embeds its bar
 * inside the client; TAT + Ad Status render theirs above the body; Overview
 * uses the dashboard aggregate bar) are kept so the experience is identical.
 * Their URL keys (campaign / tier / status / search / classification / …) don't
 * collide with `?tab=`, so they coexist.
 */

// ── Overview (dashboard-native aggregate) ───────────────────────────────────
import { fetchDashboardData } from "./queries";
import { DashboardFiltersBar } from "./filters";
import { DashboardOverviewStrip } from "./overview-strip";
import { DashboardBento } from "./dashboard-bento";
import type { DashboardFilterOptions, DashboardFilters } from "./types";

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

// ── Creator Analytics ──────────────────────────────────────────────────────────
import { CreatorAnalyticsFiltersBar } from "@/features/creator-analytics/filters";
import { CreatorAnalyticsView } from "@/features/creator-analytics/creator-analytics-view";
import {
  fetchCreatorAnalytics,
  fetchCreatorAnalyticsFilterOptions,
} from "@/features/creator-analytics/queries";
import type { CreatorAnalyticsFilters } from "@/features/creator-analytics/types";

/**
 * Raw search params for the Dashboard route. Carries the `tab` slug plus every
 * embedded view's own filter keys (campaign, tier, status, search, …). Each tab
 * body picks the keys its feature fetch understands.
 */
export type TabSearchParams = Record<string, string | undefined> & {
  tab?: string;
};

// ── Overview ──────────────────────────────────────────────────────────────
// Dashboard-native aggregate (no standalone sidebar route). Reuses the existing
// dashboard aggregate filter bar + headline cross-system KPI strip + the full
// bento command-centre. Wrapped in `.onboarding-stage` so its filter bar / KPI
// strip / bento get the same grid rhythm (gap 1.25rem) as every standalone
// page, keeping the Overview tab consistent with its siblings.
export async function OverviewTabBody({
  params,
  options,
}: {
  params: DashboardFilters;
  options: DashboardFilterOptions;
}) {
  const data = await fetchDashboardData(params);
  return (
    <div className="onboarding-stage dash-overview-stage">
      <DashboardFiltersBar initial={params} options={options} />
      <DashboardOverviewStrip data={data} />
      <DashboardBento data={data} />
    </div>
  );
}

// ── Creator Analytics ──────────────────────────────────────────────────────
// Dashboard-native creator roster directory (no standalone sidebar route).
// Filter bar ABOVE the roster, then the list/card view with a per-creator
// collab-history modal. Wrapped in `.onboarding-stage` so the filter bar +
// view get the same grid rhythm as every standalone page.
export async function CreatorAnalyticsTabBody({ sp }: { sp: TabSearchParams }) {
  const creatorFilters: CreatorAnalyticsFilters = {
    q: sp.q,
    tier: sp.tier,
    region: sp.region,
    creatorType: sp.creatorType,
    stage: sp.stage,
    reachOutFrom: sp.reachOutFrom,
    reachOutTo: sp.reachOutTo,
    postedFrom: sp.postedFrom,
    postedTo: sp.postedTo,
  };
  const [rows, options] = await Promise.all([
    fetchCreatorAnalytics(creatorFilters),
    fetchCreatorAnalyticsFilterOptions(),
  ]);
  return (
    <div className="onboarding-stage creator-analytics-stage">
      <CreatorAnalyticsFiltersBar initial={creatorFilters} options={options} />
      <CreatorAnalyticsView
        rows={rows}
        initialView={sp.view === "cards" ? "cards" : "list"}
      />
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
  // Mirrors /journey verbatim below its header: same
  // `<div className="onboarding-stage journey-stage">` wrapper holding the
  // JourneyPageClient (which renders its own filter bar + KPI + funnel + board).
  return (
    <div className="onboarding-stage journey-stage">
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
  // Mirrors /tat verbatim below its header: same `<div className="onboarding-
  // stage">` (TAT has no extra stage class) holding the filter bar then the
  // client body as direct grid children, so the `.onboarding-stage` gap spaces
  // them exactly as on the standalone route.
  return (
    <div className="onboarding-stage">
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
  // Mirrors /performance/ad-run-status verbatim below its header: same
  // `<div className="onboarding-stage ad-status-stage">` holding the filter
  // bar, then the KPI strip and the board as direct grid children (the
  // standalone renders the latter two inside a fragment in one Suspense slot,
  // which the `.onboarding-stage` grid lays out the same way). The
  // `ad-status-stage` class scopes the card layout, link actions and ad-list
  // table column widths.
  return (
    <div className="onboarding-stage ad-status-stage">
      <AdStatusFiltersBar initial={adFilters} options={options} />
      <AdStatusKpiStrip kpi={kpi} />
      <AdStatusBoard untested={untested} adRun={adRun} filters={adFilters} />
    </div>
  );
}

// ── Compliance KPIs ────────────────────────────────────────────────────────────
// Mirrors /compliance — the full ComplianceBody view (no filters at page level).
export async function ComplianceTabBody() {
  const data = await fetchComplianceData();
  // Mirrors /compliance verbatim below its header: same
  // `<div className="onboarding-stage compliance-stage">` holding the body.
  return (
    <div className="onboarding-stage compliance-stage">
      <ComplianceBody data={data} />
    </div>
  );
}

// ── Cost Analytics ─────────────────────────────────────────────────────────────
// Mirrors /cost-analytics — the full CostAnalyticsBody view.
export async function CostTabBody() {
  const data = await fetchCostAnalyticsData();
  // Mirrors /cost-analytics verbatim below its header: same
  // `<div className="onboarding-stage cost-analytics-stage">` holding the body.
  return (
    <div className="onboarding-stage cost-analytics-stage">
      <CostAnalyticsBody data={data} />
    </div>
  );
}

// ── Funnel View ────────────────────────────────────────────────────────────────
// Mirrors /funnel — the full FunnelBody view.
export async function FunnelTabBody() {
  const data = await fetchFunnelData();
  // Mirrors /funnel verbatim below its header: same
  // `<div className="onboarding-stage funnel-stage">` holding the body.
  return (
    <div className="onboarding-stage funnel-stage">
      <FunnelBody data={data} />
    </div>
  );
}

// ── Internal Dashboard ─────────────────────────────────────────────────────────
// Mirrors /internal-dashboard — the full InternalDashboardBody view.
export async function InternalTabBody() {
  const data = await fetchInternalDashboardData();
  // Mirrors /internal-dashboard verbatim below its header: same
  // `<div className="onboarding-stage internal-dashboard-stage">` holding body.
  return (
    <div className="onboarding-stage internal-dashboard-stage">
      <InternalDashboardBody data={data} />
    </div>
  );
}
