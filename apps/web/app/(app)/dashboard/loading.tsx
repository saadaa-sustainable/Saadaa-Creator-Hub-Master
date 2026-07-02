import {
  BentoSkeleton,
  HeroKpiSkeleton,
  PageHeaderSkeleton,
  Skeleton,
  TabRailSkeleton,
} from "@/components/ui/skeleton";

/**
 * Route-level fallback for the FIRST navigation into the Dashboard. Mirrors the
 * real shell top-to-bottom for the DEFAULT (Overview) tab: PageHeader → pill
 * tab rail (10 tabs) → aggregate filter card → the Overview strip's three
 * labelled HeroKpi bands (4 tiles each) → the bento chart mosaic — inside the
 * same `.dash-stage` / `.onboarding-stage` wrappers so nothing jumps on load.
 */
function KpiBand() {
  return (
    <div>
      <Skeleton className="mb-2 h-3 w-40" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="dash-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      <div className="dash-tabbar-wrap">
        <div className="dash-tabbar">
          <TabRailSkeleton pills={10} />
        </div>
      </div>

      <div id="dash-tabpanel">
        <div className="onboarding-stage dash-overview-stage">
          {/* Aggregate filter card */}
          <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-[1.4rem] shadow-sm">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex min-w-0 flex-col gap-[0.38rem]">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
                </div>
              ))}
            </div>
          </div>

          {/* Overview strip — 3 labelled HeroKpi bands */}
          <div className="flex flex-col gap-4">
            <KpiBand />
            <KpiBand />
            <KpiBand />
          </div>

          {/* Bento mosaic */}
          <BentoSkeleton />
        </div>
      </div>
    </div>
  );
}
