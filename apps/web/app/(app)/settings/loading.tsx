import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Mirrors /settings: PageHeader → 12-col grid with Account tile (5) +
 * Administration tile (7) → Workflow Preferences card → Test Mode block. */
export default function Loading() {
  return (
    <div className="onboarding-stage settings-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      <div className="grid grid-cols-12 gap-3">
        {/* Account tile */}
        <section className="col-span-12 rounded-[16px] border border-border bg-bg-white p-4 sm:p-5 lg:col-span-5">
          <Skeleton className="mb-3 h-3 w-28" />
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
          <div className="mb-3 flex gap-1.5">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
        </section>

        {/* Administration shortcuts tile — 2-col link grid */}
        <section className="col-span-12 rounded-[16px] border border-border bg-bg-white p-4 sm:p-5 lg:col-span-7">
          <Skeleton className="mb-3 h-3 w-32" />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-[12px] border border-border p-3"
              >
                <Skeleton className="h-8 w-8 rounded-[9px]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow preferences */}
        <div className="col-span-12 mt-1">
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <Skeleton className="h-24 w-full rounded-[16px]" />
        </div>

        {/* Test mode danger zone */}
        <div className="col-span-12 mt-1">
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="col-span-12">
          <Skeleton className="h-40 w-full rounded-[16px]" />
        </div>
      </div>
    </div>
  );
}
