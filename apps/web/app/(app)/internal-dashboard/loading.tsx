import { PageHeaderSkeleton, StageSkeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /internal-dashboard: PageHeader → chart-stage body (filter card +
 * KPI strip + 12-col bento), identical to the page's own Suspense fallback.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage internal-dashboard-stage" aria-busy>
      <PageHeaderSkeleton />
      <StageSkeleton kind="chart" kpiCount={5} />
    </div>
  );
}
