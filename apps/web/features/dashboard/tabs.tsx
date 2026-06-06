"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { DASHBOARD_TABS, TAB_LABELS, type DashboardTab } from "./tab-config";

/**
 * Segmented PILL tab bar for the command-centre Dashboard.
 *
 * - Active tab written to the `?tab=` URL search param (linkable +
 *   server-rendered). Other params (filters) are preserved.
 * - Each tab is a Next.js <Link prefetch>, NOT a button: Next prefetches every
 *   tab's RSC payload ahead of the click (default in prod), so switching is
 *   near-instant instead of waiting on a fresh server fetch per click. Plain
 *   <button onClick={router.replace()}> got no prefetching, which is what made
 *   switching feel slow. `scroll={false}` keeps the viewport put on switch.
 * - Horizontally scrollable on mobile (overflow-x-auto, no wrap).
 * - Keyboard accessible: role=tablist / role=tab / aria-selected, with
 *   ArrowLeft / ArrowRight / Home / End roving navigation. Each Arrow/Home/End
 *   move focuses the target tab AND navigates to it (clicking its Link).
 * - Design-system fidelity: the rail sits on the warm ecru surface; the ACTIVE
 *   tab is a solid white (`--bg-white`) rounded pill with a subtle shadow and
 *   dark primary text, inactive tabs are plain secondary text with a faint
 *   hover wash. White-on-ecru segmented control (NOT accent-gold fill).
 */
export function DashboardTabs({ active }: { active: DashboardTab }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Build the href for a tab, preserving every other search param (filters)
  // and only swapping `?tab=`.
  const hrefFor = useCallback(
    (tab: DashboardTab) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", tab);
      const qs = next.toString();
      return `${pathname}${qs ? `?${qs}` : ""}`;
    },
    [params, pathname],
  );

  const onKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % DASHBOARD_TABS.length;
    else if (e.key === "ArrowLeft")
      nextIndex = (index - 1 + DASHBOARD_TABS.length) % DASHBOARD_TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = DASHBOARD_TABS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const target = tabRefs.current[nextIndex];
    target?.focus();
    // Roving nav also activates the focused tab (follows the prefetched Link).
    target?.click();
  }, []);

  return (
    <div
      role="tablist"
      aria-label="Dashboard views"
      className={cn(
        "dash-tabbar flex items-center gap-1 overflow-x-auto",
        "scrollbar-thin",
      )}
      style={{ scrollbarWidth: "thin" }}
    >
      {DASHBOARD_TABS.map((tab, i) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            href={hrefFor(tab) as never}
            prefetch
            scroll={false}
            role="tab"
            id={`dash-tab-${tab}`}
            aria-selected={isActive}
            aria-controls="dash-tabpanel"
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            data-active={isActive ? "true" : undefined}
            className={cn(
              // inline-flex + items-center so the <a> honours the [role=tab]
              // min-height touch target exactly as the old <button> did.
              "dash-tab-pill inline-flex items-center justify-center shrink-0",
              "whitespace-nowrap rounded-[7px]",
              "px-3 py-1.5 text-[0.74rem] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-accent/60",
              !isActive && "text-text-secondary hover:text-text-primary",
            )}
          >
            {TAB_LABELS[tab]}
          </Link>
        );
      })}
    </div>
  );
}
