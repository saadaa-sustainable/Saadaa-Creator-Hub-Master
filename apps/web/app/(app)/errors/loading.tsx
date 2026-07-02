import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /errors: PageHeader → body (page's own Suspense fallback is a
 * 6-row table). Same `.onboarding-stage errors-stage` wrapper as the page.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage errors-stage" aria-busy>
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
