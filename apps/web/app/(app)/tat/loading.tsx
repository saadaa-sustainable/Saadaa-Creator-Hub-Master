import {
  PageHeaderSkeleton,
  Skeleton,
  StageSkeleton,
} from "@/components/ui/skeleton";

/**
 * Mirrors /tat: PageHeader → TatFiltersBar (pre-Suspense, so skeletoned here)
 * → chart-stage body (4 HeroKpi strip + chart grid). Same `.onboarding-stage`
 * wrapper as the page so the gap rhythm matches.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage" aria-busy>
      <PageHeaderSkeleton />
      {/* TatFiltersBar shape — onboarding-filter-card holding a field grid */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-[1.4rem] shadow-sm">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-[0.38rem] min-w-0">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
      </div>
      {/* Same fallback the page's Suspense boundary renders */}
      <StageSkeleton kind="chart" filter={false} />
    </div>
  );
}
