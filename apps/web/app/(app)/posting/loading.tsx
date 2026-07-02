import {
  HeroKpiSkeleton,
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

/**
 * Mirrors the loaded Posting anatomy (page.tsx): PageHeader → filter bar →
 * KPI strip (4 cards in `.acc-kpi-grid`) → table (10 cols). Same
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

      {/* KPI strip */}
      <section className="acc-kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </section>

      <TableSkeleton rows={10} cols={10} />
    </div>
  );
}
