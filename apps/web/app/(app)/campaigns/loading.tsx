import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Mirrors /campaigns: PageHeader → subhead + New Campaign button →
 * metrics rail (3 stats) → campaign card grid. */
export default function Loading() {
  return (
    <div className="campaign-list-page space-y-4" aria-busy>
      <PageHeaderSkeleton />

      {/* .campaign-list-subhead — copy line + New Campaign button */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-[28rem] max-w-[60%]" />
        <Skeleton className="h-9 w-36 rounded-[10px]" />
      </div>

      {/* .campaign-list-metrics — Campaigns / Target / Budget */}
      <div className="grid grid-cols-3 gap-3 rounded-[var(--radius)] border border-border bg-bg-surface p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>

      {/* .campaign-card-grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius)] border border-border bg-bg-white p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-4 w-14 rounded-full" />
                </div>
                <Skeleton className="h-5 w-3/4" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="ml-auto h-2.5 w-12" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
