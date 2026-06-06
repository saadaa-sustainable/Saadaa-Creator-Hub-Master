import { StageSkeleton } from "@/components/ui/skeleton";
import { DASHBOARD_TABS, TAB_LABELS } from "@/features/dashboard/tab-config";

/**
 * Route-level fallback for the FIRST navigation into the Dashboard (before the
 * shell + tabs render). Mirrors the real shell so the initial load resembles
 * what's coming: a title block, the pill tab RAIL (same `.dash-tabbar` trough
 * with a pill per tab), then the stage skeleton for the default Overview tab —
 * not a generic title + random KPI/chart blocks.
 */
export default function Loading() {
  return (
    <div className="dash-stage" aria-busy aria-hidden>
      <div className="mb-1 h-7 w-44 rounded bg-bg-muted animate-pulse" />

      <div className="dash-tabbar-wrap">
        <div className="dash-tabbar flex items-center gap-1 overflow-x-auto">
          {DASHBOARD_TABS.map((tab, i) => (
            <span
              key={tab}
              className="dash-tab-pill inline-flex items-center justify-center shrink-0 whitespace-nowrap rounded-[7px] px-3 py-1.5"
              data-active={i === 0 ? "true" : undefined}
            >
              <span
                className="h-3 rounded bg-bg-muted animate-pulse"
                style={{ width: `${Math.max(40, TAB_LABELS[tab].length * 7)}px` }}
              />
            </span>
          ))}
        </div>
      </div>

      <div id="dash-tabpanel">
        <StageSkeleton kind="board" kpiCount={4} />
      </div>
    </div>
  );
}
