import { PageHeaderSkeleton, StageSkeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /cost-analytics: PageHeader → chart-stage body (filter card +
 * 5-KPI strip + chart bento), identical to the page's own Suspense fallback.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage cost-analytics-stage" aria-busy>
      <PageHeaderSkeleton />
      <StageSkeleton kind="chart" kpiCount={5} />
    </div>
  );
}
