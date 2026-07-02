import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /audit-log: PageHeader → body (page's own Suspense fallback is an
 * 8-row table). Same `.onboarding-stage audit-log-stage` wrapper as the page.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage audit-log-stage" aria-busy>
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}
