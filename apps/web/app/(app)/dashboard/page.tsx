import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiStripSkeleton } from "@/components/ui/skeleton";
import { DashboardFiltersBar } from "@/features/dashboard/filters";
import { DashboardTabs } from "@/features/dashboard/tabs";
import { resolveTab, type DashboardTab } from "@/features/dashboard/tab-config";
import {
  AdStatusTabBody,
  CostTabBody,
  JourneyTabBody,
  OnboardingTabBody,
  OrderStatusTabBody,
  OverviewTabBody,
  PaymentsTabBody,
  PostingTabBody,
  ReachOutTabBody,
  TatTabBody,
} from "@/features/dashboard/tab-bodies";
import { fetchDashboardFilterOptions } from "@/features/dashboard/queries";
import type { DashboardFilters } from "@/features/dashboard/types";

export const metadata = { title: "Dashboard" };

type DashboardSearchParams = DashboardFilters & { tab?: string };

/**
 * Tabbed command-centre Dashboard.
 *
 * - Underline-active tab bar; first tab "Overview", then one tab per workflow
 *   view. Active tab lives in the `?tab=` URL search param (linkable +
 *   server-rendered; default `overview`).
 * - Only the ACTIVE tab's data is fetched — each tab body is its own async
 *   server component rendered inside a keyed <Suspense> so it streams in.
 *   Inactive tabs run no queries (perf).
 * - Filters apply only to the Overview tab (the only tab driven by the
 *   client-filterable dashboard aggregate). Other tabs read their own
 *   feature's global KPI aggregate.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { tab: tabParam, ...filters } = await searchParams;
  const tab = resolveTab(tabParam);
  const options = await fetchDashboardFilterOptions();

  return (
    <div className="onboarding-stage dash-stage">
      <PageHeader icon={LayoutDashboard} title="Dashboard" knowMore="dashboard" />

      <DashboardTabs active={tab} />

      {tab === "overview" && (
        <DashboardFiltersBar initial={filters} options={options} />
      )}

      <div
        id="dash-tabpanel"
        role="tabpanel"
        aria-labelledby={`dash-tab-${tab}`}
        className="mt-2"
      >
        <Suspense
          key={`${tab}:${JSON.stringify(filters)}`}
          fallback={<KpiStripSkeleton count={4} />}
        >
          <TabBody tab={tab} filters={filters} />
        </Suspense>
      </div>
    </div>
  );
}

function TabBody({
  tab,
  filters,
}: {
  tab: DashboardTab;
  filters: DashboardFilters;
}) {
  switch (tab) {
    case "overview":
      return <OverviewTabBody params={filters} />;
    case "reach-out":
      return <ReachOutTabBody params={filters} />;
    case "onboarding":
      return <OnboardingTabBody />;
    case "order-status":
      return <OrderStatusTabBody />;
    case "posting":
      return <PostingTabBody />;
    case "ad-status":
      return <AdStatusTabBody />;
    case "payments":
      return <PaymentsTabBody />;
    case "cost":
      return <CostTabBody />;
    case "tat":
      return <TatTabBody />;
    case "journey":
      return <JourneyTabBody />;
    default:
      return <OverviewTabBody params={filters} />;
  }
}
