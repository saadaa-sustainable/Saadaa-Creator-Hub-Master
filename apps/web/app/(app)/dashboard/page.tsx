import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
import { DashboardTabs } from "@/features/dashboard/tabs";
import {
  resolveTab,
  tabKnowMoreSlug,
  type DashboardTab,
} from "@/features/dashboard/tab-config";
import {
  AdStatusTabBody,
  ComplianceTabBody,
  CostTabBody,
  CreatorAnalyticsTabBody,
  FunnelTabBody,
  InternalTabBody,
  JourneyTabBody,
  OverviewTabBody,
  PartnershipTabBody,
  TatTabBody,
  type TabSearchParams,
} from "@/features/dashboard/tab-bodies";
import { fetchDashboardFilterOptions } from "@/features/dashboard/queries";
import type {
  DashboardFilterOptions,
  DashboardFilters,
} from "@/features/dashboard/types";

export const metadata = { title: "Dashboard" };

/**
 * Tabs whose loaded body is chart-heavy (analytics) rather than a table board.
 * The stage skeleton swaps its third block (charts vs table) accordingly so the
 * fallback resembles what actually streams in. Everything else (filter bar +
 * KPI grid) is shared across both kinds.
 */
const CHART_TABS = new Set<DashboardTab>([
  "tat",
  "cost",
  "funnel",
  "compliance",
  "internal",
]);

/**
 * Tabbed command-centre Dashboard.
 *
 * - Segmented pill tab bar; first tab "Overview" (cross-system aggregate),
 *   then one tab per SYSTEM-section view in sidebar order — Influencer Journey
 *   → TAT Analytics → Ad Status → Compliance KPIs → Cost Analytics → Funnel
 *   View → Internal Dashboard. Each view tab REUSES that feature's full
 *   page-view component + data fetch so it is identical to the standalone
 *   route, minus the duplicate per-page header (the Dashboard shell owns one).
 * - Active tab lives in the `?tab=` URL search param (linkable +
 *   server-rendered; default `overview`).
 * - Only the ACTIVE tab's data is fetched — each tab body is its own async
 *   server component rendered inside a keyed <Suspense> so it streams in.
 *   Inactive tabs run no queries (perf).
 * - Each tab body reproduces its standalone route's content BELOW the header
 *   verbatim: the same `<div className="onboarding-stage <name>-stage">` grid
 *   wrapper holding the same filter bar / KPI strips / boards in the same order.
 *   The Dashboard shell adds only the neutral `.dash-stage` block container
 *   (header → tab rail → panel) and the single PageHeader; the tab body's own
 *   `.onboarding-stage` owns all inter-section spacing, so each tab is
 *   byte-for-byte identical to its sidebar page at every breakpoint.
 * - Every tab carries its own feature filter bar inside its body (Overview's
 *   aggregate bar included). Their URL keys coexist with `?tab=` without
 *   collision.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<TabSearchParams>;
}) {
  const sp = await searchParams;
  const { tab: tabParam, ...rest } = sp;
  const tab = resolveTab(tabParam);
  const options = await fetchDashboardFilterOptions();

  // Overview tab is driven by the dashboard aggregate filter bar.
  const overviewFilters: DashboardFilters = {
    campaign: rest.campaign,
    status: rest.status,
    contentType: rest.contentType,
    influencerType: rest.influencerType,
    dateFrom: rest.dateFrom,
    dateTo: rest.dateTo,
  };

  return (
    <div className="dash-stage">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        knowMore={tabKnowMoreSlug(tab)}
      />

      <div className="dash-tabbar-wrap">
        <DashboardTabs active={tab} />
      </div>

      <div
        id="dash-tabpanel"
        role="tabpanel"
        aria-labelledby={`dash-tab-${tab}`}
        key={tab}
        className="dash-tab-swap"
      >
        <Suspense
          key={`${tab}:${JSON.stringify(rest)}`}
          fallback={
            <StageSkeleton
              kind={CHART_TABS.has(tab) ? "chart" : "board"}
              kpiCount={4}
            />
          }
        >
          <TabBody
            tab={tab}
            sp={sp}
            overviewFilters={overviewFilters}
            overviewOptions={options}
          />
        </Suspense>
      </div>
    </div>
  );
}

function TabBody({
  tab,
  sp,
  overviewFilters,
  overviewOptions,
}: {
  tab: DashboardTab;
  sp: TabSearchParams;
  overviewFilters: DashboardFilters;
  overviewOptions: DashboardFilterOptions;
}) {
  switch (tab) {
    case "overview":
      return (
        <OverviewTabBody params={overviewFilters} options={overviewOptions} />
      );
    case "creators":
      return <CreatorAnalyticsTabBody sp={sp} />;
    case "partnerships":
      return <PartnershipTabBody sp={sp} />;
    case "journey":
      return <JourneyTabBody sp={sp} />;
    case "tat":
      return <TatTabBody sp={sp} />;
    case "ad-status":
      return <AdStatusTabBody sp={sp} />;
    case "compliance":
      return <ComplianceTabBody />;
    case "cost":
      return <CostTabBody />;
    case "funnel":
      return <FunnelTabBody />;
    case "internal":
      return <InternalTabBody />;
    default:
      return (
        <OverviewTabBody params={overviewFilters} options={overviewOptions} />
      );
  }
}
