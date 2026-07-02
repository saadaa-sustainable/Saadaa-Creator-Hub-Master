import {
  HeroKpiSkeleton,
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

/** Mirrors /order-status: PageHeader → filter bar (search + 6 selects) →
 * OrderVolumeStrip (6 KPIs) → CommerceIntelStrip (6 KPIs) → board toolbar
 * (count + view toggle) → order table. */
export default function Loading() {
  return (
    <div className="onboarding-stage order-status-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      {/* .onboarding-filter-card */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-[1.4rem] shadow-sm">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-[0.38rem] min-w-0">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
      </div>

      {/* Order volume strip — 6 bucket KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </div>

      {/* Commerce intel strip — 6 KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </div>

      {/* Board toolbar: row-count pill + view toggle */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-[8px]" />
      </div>

      <TableSkeleton rows={8} cols={10} />
    </div>
  );
}
