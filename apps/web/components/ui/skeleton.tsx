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
      className={cn("animate-pulse rounded bg-bg-muted", className)}
      style={style}
      aria-hidden
    />
  );
}

export function KpiStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
      aria-busy
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius)] border border-border bg-bg-white px-4 py-3 min-w-[140px] space-y-2"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
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

      {/* 2 — KPI strip (mirrors .acc-kpi-grid of .acc-kpi cards) */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-[12px] border border-border bg-bg-white px-4 pb-4 pt-3.5 min-w-0"
          >
            {/* accent left-rail, like .acc-kpi::before */}
            <span
              className="absolute inset-y-0 left-0 w-[3px] rounded-l-[12px] bg-bg-muted"
              aria-hidden
            />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
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
