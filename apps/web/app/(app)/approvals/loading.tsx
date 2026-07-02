import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Mirrors /approvals: PageHeader → 4 compact stat cards → 2-col grid of
 * pending-campaign approval cards. */
export default function Loading() {
  return (
    <div className="onboarding-stage approvals-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-4 min-w-0">
        {/* Compact stat row (icon chip + value + label) */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[14px] border border-border bg-bg-white p-3"
            >
              <Skeleton className="h-9 w-9 rounded-[10px]" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          ))}
        </div>

        {/* Pending-campaign cards */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <article
              key={i}
              className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-bg-white p-3.5"
            >
              <div className="flex items-start gap-2">
                <Skeleton className="h-8 w-8 rounded-[10px]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-2.5 w-32" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Skeleton className="h-3" />
                <Skeleton className="h-3" />
                <Skeleton className="h-3" />
                <Skeleton className="h-3" />
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-2">
                <Skeleton className="h-8 w-20 rounded-[8px]" />
                <Skeleton className="h-8 w-20 rounded-[8px]" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
