import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /admin/users: PageHeader → body (page's own Suspense fallback is a
 * 6-row table). Same `.onboarding-stage user-panel-stage` wrapper as the page.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage user-panel-stage" aria-busy>
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
