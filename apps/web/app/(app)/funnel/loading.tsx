import { PageHeaderSkeleton, StageSkeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /funnel: PageHeader → chart-stage body (filter card + KPI strip +
 * funnel chart), identical to the page's own Suspense fallback.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage funnel-stage" aria-busy>
      <PageHeaderSkeleton />
      <StageSkeleton kind="chart" kpiCount={5} />
    </div>
  );
}
