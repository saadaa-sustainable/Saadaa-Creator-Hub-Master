import {
  HeroKpiSkeleton,
  KanbanSkeleton,
  PageHeaderSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

/**
 * Mirrors the loaded My Dashboard anatomy (page.tsx → MyDashboardBody):
 * PageHeader → filter card (4 fields) → KPI row 1 (4 HeroKpi) → KPI row 2
 * (3 HeroKpi) → standalone EOD snapshot → detailed Attention cards →
 * insight tiles → 4-lane workload kanban. Same `.my-dashboard-stage`
 * wrapper so the grid rhythm/gap matches the page.
 */
export default function Loading() {
  return (
    <div className="onboarding-stage my-dashboard-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      {/* Filter card (search + campaign + stage + tier) */}
      <section className="onboarding-filter-card">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-end">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-[0.38rem] min-w-0">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-[2.35rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
      </section>

      {/* KPI strip — two HeroKpi rows (4 + 3) inside the shared grid */}
      <section className="flex flex-col gap-3">
        <div className="acc-kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <HeroKpiSkeleton key={i} />
          ))}
        </div>
        <div className="acc-kpi-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <HeroKpiSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Standalone EOD snapshot */}
      <section className="overflow-hidden rounded-2xl border border-border bg-bg-white">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface/50 p-3 sm:px-4">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-9 w-48 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 bg-bg-white p-3 sm:p-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Attention — detailed overdue cards */}
      <section className="overflow-hidden rounded-2xl border border-border bg-bg-white">
        <div className="border-b border-border bg-danger-bg/35 p-3 sm:px-4">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-2.5 p-2.5 md:grid-cols-2 sm:p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-2xl border border-border p-3"
            >
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-3 flex-1" />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 6 }).map((__, j) => (
                  <Skeleton key={j} className="h-12 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Insights — 2-col tile row (workload summary | stage mix) */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-2.5 sm:gap-3 min-w-0">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-bg-white p-3 sm:p-4 space-y-3 min-w-0"
          >
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-full rounded-full" />
            <Skeleton className="h-2.5 w-5/6 rounded-full" />
            <Skeleton className="h-2.5 w-2/3 rounded-full" />
          </div>
        ))}
      </section>

      {/* Team Leaderboard — full-width tile */}
      <div className="rounded-2xl border border-border bg-bg-white p-3 sm:p-4 space-y-3">
        <Skeleton className="h-3 w-40" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[12px] border border-border p-2.5 space-y-2"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Workload board — 4 lanes */}
      <KanbanSkeleton lanes={4} cards={3} />
    </div>
  );
}
