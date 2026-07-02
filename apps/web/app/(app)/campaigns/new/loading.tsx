import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Mirrors /campaigns/new: PageHeader → helper line →
 * segmented control (Create / Existing) → create-form card. */
export default function Loading() {
  return (
    <div className="campaign-create-page space-y-4" aria-busy>
      <PageHeaderSkeleton />
      <Skeleton className="h-4 w-96 max-w-full" />

      {/* .campaign-segmented-control — two mode pills */}
      <div className="flex items-center gap-1">
        <Skeleton className="h-9 w-32 rounded-[9px]" />
        <Skeleton className="h-9 w-36 rounded-[9px]" />
      </div>

      {/* Create-form card: field grid + budget block + submit */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg-white p-5 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-[0.65rem]" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-40 rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}
