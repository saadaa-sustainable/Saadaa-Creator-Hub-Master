import {
  HeroKpiSkeleton,
  KanbanSkeleton,
  PageHeaderSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

/**
 * Mirrors the loaded Journey anatomy (JourneyPageClient): PageHeader →
 * filter bar → KPI strip (4 HeroKpi) → funnel strip (4 HeroKpi) → 4-lane
 * kanban board. Same `.onboarding-stage journey-stage` wrapper so the grid
 * rhythm/gap matches the page.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage journey-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      {/* Filter bar — 7 fields, matching JourneyFiltersBar */}
      <section className="onboarding-filter-card">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-[0.38rem] min-w-0">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-[2.35rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
      </section>

      {/* KPI strip (4) */}
      <div className="acc-kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </div>

      {/* Funnel strip (4) */}
      <div className="acc-kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </div>

      {/* Journey board — 4 lanes */}
      <KanbanSkeleton lanes={4} cards={3} />
    </div>
  );
}
