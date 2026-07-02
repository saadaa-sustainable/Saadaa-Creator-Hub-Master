import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("skeleton-shimmer rounded", className)}
      style={style}
      aria-hidden
    />
  );
}

/** One HeroKpi-shaped placeholder — 3px top accent bar + icon chip + label,
 * big value, sub line. Mirrors `features/dashboard/bento-kit.tsx#HeroKpi`,
 * which every converted KPI strip now renders. */
export function HeroKpiSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[16px] border border-border bg-bg-white p-3.5 min-w-0">
      <span
        className="absolute inset-x-0 top-0 h-[3px] bg-bg-muted"
        aria-hidden
      />
      <div className="mb-2 flex items-center gap-1.5">
        <Skeleton className="h-6 w-6 rounded-[8px]" />
        <Skeleton className="h-2.5 w-20" />
      </div>
      <Skeleton className="h-7 w-16" />
      <Skeleton className="mt-1.5 h-2.5 w-24" />
    </div>
  );
}

export function KpiStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
      aria-busy
    >
      {Array.from({ length: count }).map((_, i) => (
        <HeroKpiSkeleton key={i} />
      ))}
    </div>
  );
}

/** Mirrors the shared `PageHeader` (icon chip + title + Know More pill) so the
 * loading state and the loaded page share the exact same top row. */
export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-busy aria-hidden>
      <Skeleton className="h-11 w-11 rounded-[14px]" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-7 w-28 rounded-full" />
    </div>
  );
}

/** Kanban-shaped body — N lanes of stacked cards (Journey, Accounts board,
 * Partnership Status, workload boards). Lanes keep a real min-width and the
 * container scrolls horizontally on small screens, mirroring the boards'
 * `.dashboard-kanban-scroll` rail behaviour. */
export function KanbanSkeleton({
  lanes = 4,
  cards = 3,
}: {
  lanes?: number;
  cards?: number;
}) {
  return (
    <div
      className="grid gap-3 overflow-x-auto"
      style={{
        gridTemplateColumns: `repeat(${lanes}, minmax(min(240px, 80vw), 1fr))`,
      }}
      aria-busy
    >
      {Array.from({ length: lanes }).map((_, l) => (
        <div
          key={l}
          className="rounded-[var(--radius)] border border-border bg-bg-surface p-2.5 space-y-2.5"
        >
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-4 w-6 rounded-full" />
          </div>
          {Array.from({ length: cards }).map((_, c) => (
            <div
              key={c}
              className="rounded-[12px] border border-border bg-bg-white p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Dashboard tab rail — the segmented pill bar under the page header. */
export function TabRailSkeleton({ pills = 8 }: { pills?: number }) {
  return (
    <div className="flex items-center gap-1 overflow-hidden" aria-busy>
      {Array.from({ length: pills }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-8 rounded-[7px]"
          style={{ width: `${64 + ((i * 17) % 40)}px` }}
        />
      ))}
    </div>
  );
}

/** Overview-bento-shaped body: hero row (8/4 split) + a row of tiles. */
export function BentoSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3" aria-busy>
      <div className="lg:col-span-8">
        <ChartSkeleton height={180} />
      </div>
      <div className="lg:col-span-4">
        <ChartSkeleton height={180} />
      </div>
      <div className="lg:col-span-6">
        <ChartSkeleton height={160} />
      </div>
      <div className="lg:col-span-6">
        <ChartSkeleton height={160} />
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div
      className="rounded-[var(--radius)] border border-border bg-bg-white p-4"
      aria-busy
    >
      <Skeleton className="mb-3 h-4 w-32" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

/**
 * Stage-shaped loading skeleton.
 *
 * Mirrors the real `.onboarding-stage` layout that every Dashboard tab / sidebar
 * stage renders — so the fallback resembles the stage that's about to appear
 * rather than a generic stack of random KPI blocks:
 *
 *   1. a FILTER BAR block shaped like `.onboarding-filter-card` (surface card)
 *      holding a `.onboarding-filter-grid`-style row of field placeholders;
 *   2. a KPI-GRID block matching the `.acc-kpi-grid` shape (cards with the
 *      accent left-rail, a label line, a value line and a sub line);
 *   3. a BOARD / TABLE / CHART block depending on `kind`.
 *
 * Built only from the `Skeleton` primitive + design tokens (no new colours), and
 * meant to be rendered INSIDE an `.onboarding-stage` wrapper so it inherits the
 * same filter → KPI → board grid rhythm (gap 1.25rem) as the loaded stage.
 *
 * `kind`:
 *   - "board"  (default) — workflow/list stages: filter + KPIs + a table board.
 *   - "chart"  — analytics stages (TAT / Cost / Funnel): filter + KPIs + charts.
 *
 * `filter`: render the filter-bar block. Set `false` on routes where the real
 * filter bar lives OUTSIDE the Suspense boundary (e.g. TAT, Ad Status render
 * their `<FiltersBar>` in the page shell, so the fallback should NOT show a
 * second one) — there the skeleton starts at the KPI grid.
 */
export function StageSkeleton({
  kind = "board",
  kpiCount = 4,
  filterFields = 4,
  filter = true,
}: {
  kind?: "board" | "chart";
  kpiCount?: number;
  filterFields?: number;
  filter?: boolean;
}) {
  return (
    <div className="dash-stage-skeleton" aria-busy aria-hidden>
      {/* 1 — Filter bar (mirrors .onboarding-filter-card + .onboarding-filter-grid) */}
      {filter && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-[1.4rem] shadow-sm">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: filterFields }).map((_, i) => (
              <div key={i} className="flex flex-col gap-[0.38rem] min-w-0">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2 — KPI strip (mirrors the HeroKpi cards every converted strip renders) */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <HeroKpiSkeleton key={i} />
        ))}
      </div>

      {/* 3 — Board / charts */}
      {kind === "chart" ? (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          <ChartSkeleton height={220} />
          <ChartSkeleton height={220} />
        </div>
      ) : (
        <TableSkeleton rows={8} cols={6} />
      )}
    </div>
  );
}

export function TableSkeleton({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div
      className="rounded-[var(--radius)] border border-border bg-bg-white p-2 space-y-2"
      aria-busy
    >
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-6" />
          ))}
        </div>
      ))}
    </div>
  );
}
