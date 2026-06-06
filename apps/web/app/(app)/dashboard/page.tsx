import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiStripSkeleton } from "@/components/ui/skeleton";
import { DashboardFiltersBar } from "@/features/dashboard/filters";
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
  FunnelTabBody,
  InternalTabBody,
  JourneyTabBody,
  OverviewTabBody,
  TatTabBody,
  type TabSearchParams,
} from "@/features/dashboard/tab-bodies";
import { fetchDashboardFilterOptions } from "@/features/dashboard/queries";
import type { DashboardFilters } from "@/features/dashboard/types";

export const metadata = { title: "Dashboard" };

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
 * - The Overview filter bar applies only to the Overview tab. The other tabs
 *   carry their own feature filter bars (Journey / TAT / Ad Status) whose URL
 *   keys coexist with `?tab=` without collision.
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
    <div className="onboarding-stage dash-stage dash-compact">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        knowMore={tabKnowMoreSlug(tab)}
      />

      <div className="dash-tabbar-wrap">
        <DashboardTabs active={tab} />
      </div>

      {tab === "overview" && (
        <DashboardFiltersBar initial={overviewFilters} options={options} />
      )}

      <div
        id="dash-tabpanel"
        role="tabpanel"
        aria-labelledby={`dash-tab-${tab}`}
        className="mt-2"
      >
        <Suspense
          key={`${tab}:${JSON.stringify(rest)}`}
          fallback={<KpiStripSkeleton count={4} />}
        >
          <TabBody tab={tab} sp={sp} overviewFilters={overviewFilters} />
        </Suspense>
      </div>
    </div>
  );
}

function TabBody({
  tab,
  sp,
  overviewFilters,
}: {
  tab: DashboardTab;
  sp: TabSearchParams;
  overviewFilters: DashboardFilters;
}) {
  switch (tab) {
    case "overview":
      return <OverviewTabBody params={overviewFilters} />;
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
      return <OverviewTabBody params={overviewFilters} />;
  }
}
