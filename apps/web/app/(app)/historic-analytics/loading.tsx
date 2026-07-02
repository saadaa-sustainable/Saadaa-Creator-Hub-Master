import {
  BentoSkeleton,
  PageHeaderSkeleton,
  StageSkeleton,
  TabRailSkeleton,
} from "@/components/ui/skeleton";

/**
 * Mirrors /historic-analytics (default `overview` view): PageHeader →
 * HistoricViewToggle (3 pills) → filter card + 4-KPI strip (the page's own
 * overview Suspense fallback shape) → overview bento. Same triple-class
 * wrapper as the page so grid rhythm matches.
 */
export default function Loading() {
  return (
    <div
      className="onboarding-stage dash-overview-stage historic-analytics-stage"
      aria-busy
    >
      <PageHeaderSkeleton />
      <TabRailSkeleton pills={3} />
      <StageSkeleton kind="board" kpiCount={4} />
      <BentoSkeleton />
    </div>
  );
}
