import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /admin/users/[email] (no Suspense boundary — the whole page blocks
 * on data): PageHeader → UserDetailBody's stacked white section cards:
 * identity card (avatar row + 4-up meta grid), activity card, scopes card
 * (2-col grid), audit-events card. Same `.onboarding-stage user-panel-stage`
 * wrapper as the page.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage user-panel-stage" aria-busy>
      <PageHeaderSkeleton />

      {/* Identity card */}
      <section className="rounded-2xl bg-bg-white border border-border p-3.5 sm:p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </section>

      {/* Activity card */}
      <section className="rounded-2xl bg-bg-white border border-border p-4 sm:p-5 flex flex-col gap-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-20 w-full" />
      </section>

      {/* Scopes card */}
      <section className="rounded-2xl bg-bg-white border border-border p-4 sm:p-5 flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-[10px]" />
          ))}
        </div>
      </section>

      {/* Audit events card */}
      <section className="rounded-2xl bg-bg-white border border-border p-4 sm:p-5 flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-[10px]" />
        ))}
      </section>
    </div>
  );
}
