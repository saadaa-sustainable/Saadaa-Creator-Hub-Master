import {
  HeroKpiSkeleton,
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

/**
 * Mirrors the loaded Onboarding anatomy (page.tsx): PageHeader → filter bar →
 * KPI strip (TWO `.acc-kpi-grid` rows of 4) → table (10 cols). Same
 * `.onboarding-stage` wrapper so the grid rhythm/gap matches the page.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      {/* Filter bar */}
      <section className="onboarding-filter-card">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-[0.38rem] min-w-0">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-[2.35rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
      </section>

      {/* KPI strip — two rows of 4 */}
      <section className="flex flex-col gap-3">
        {[0, 1].map((r) => (
          <div key={r} className="acc-kpi-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <HeroKpiSkeleton key={i} />
            ))}
          </div>
        ))}
      </section>

      <TableSkeleton rows={10} cols={10} />
    </div>
  );
}
