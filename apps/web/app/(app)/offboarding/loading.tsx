import {
  HeroKpiSkeleton,
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

/** Mirrors /offboarding: PageHeader → filter bar (search + selects) →
 * "Move a collab to Offboarding" panel → 4-KPI strip → board table. */
export default function Loading() {
  return (
    <div className="onboarding-stage offboarding-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      {/* .onboarding-filter-card */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-[1.4rem] shadow-sm">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-[0.38rem] min-w-0">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
      </div>

      {/* Move-to-Offboarding panel: title + hint + select + button */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-[1.4rem] shadow-sm space-y-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-2.5 w-80 max-w-full" />
        <div className="flex flex-wrap items-end gap-2">
          <Skeleton className="h-[2.85rem] w-64 rounded-[0.65rem]" />
          <Skeleton className="h-[2.85rem] w-48 rounded-[0.65rem]" />
        </div>
      </div>

      {/* KPI strip — Offboarding / Awaiting Payment / Fully Paid / Committed Spend */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </div>

      <TableSkeleton rows={8} cols={8} />
    </div>
  );
}
