import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Mirrors /reach-out/inbound: PageHeader (mode pill + Historic Creator
 * action) → campaign step card (fields + capacity card) → Inbound Roster
 * card (toolbar + row grid) → submit row. */
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="reachout-form space-y-3 mt-4" aria-busy aria-hidden>
        {/* Step 1 — Campaign (2/1 split: campaign select + capacity card) */}
        <div className="glass-card rounded-[var(--radius-lg)] border border-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
            <div className="md:col-span-2 space-y-2">
              <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
              <Skeleton className="h-6 w-56 rounded-full" />
            </div>
            <div className="rounded-md border border-border bg-bg-white p-3 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          </div>
        </div>

        {/* Step 2 — Inbound Roster: title + toolbar buttons + row grid */}
        <div className="glass-card rounded-[var(--radius-lg)] border border-border p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2.5 w-64" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-[8px]" />
              <Skeleton className="h-8 w-24 rounded-[8px]" />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, r) => (
            <div key={r} className="grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, c) => (
                <Skeleton key={c} className="h-9 rounded-[0.5rem]" />
              ))}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Skeleton className="h-10 w-44 rounded-[10px]" />
        </div>
      </div>
    </>
  );
}
