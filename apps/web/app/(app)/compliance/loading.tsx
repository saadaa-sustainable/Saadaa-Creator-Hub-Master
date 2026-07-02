import { PageHeaderSkeleton, StageSkeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /compliance: PageHeader → chart-stage body (filter card + 5-KPI
 * strip + charts), identical to the page's own Suspense fallback.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage compliance-stage" aria-busy>
      <PageHeaderSkeleton />
      <StageSkeleton kind="chart" kpiCount={5} />
    </div>
  );
}
