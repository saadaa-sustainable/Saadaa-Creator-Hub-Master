"use client";

import { useCallback, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { DASHBOARD_TABS, TAB_LABELS, type DashboardTab } from "./tab-config";

/**
 * Underline-active tab bar for the command-centre Dashboard.
 *
 * - Active tab written to the `?tab=` URL search param (linkable +
 *   server-rendered). Other params (filters) are preserved.
 * - Horizontally scrollable on mobile (overflow-x-auto, no wrap).
 * - Keyboard accessible: role=tablist / role=tab / aria-selected, with
 *   ArrowLeft / ArrowRight / Home / End roving navigation.
 * - Design-system fidelity: warm ecru base, accent-gold underline + label on
 *   the active tab, muted secondary text on the rest. No reference palette.
 */
export function DashboardTabs({ active }: { active: DashboardTab }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const go = useCallback(
    (tab: DashboardTab) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", tab);
      startTransition(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    [params, router, startTransition],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === "ArrowRight")
        nextIndex = (index + 1) % DASHBOARD_TABS.length;
      else if (e.key === "ArrowLeft")
        nextIndex =
          (index - 1 + DASHBOARD_TABS.length) % DASHBOARD_TABS.length;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = DASHBOARD_TABS.length - 1;
      if (nextIndex === null) return;
      e.preventDefault();
      const target = tabRefs.current[nextIndex];
      target?.focus();
      go(DASHBOARD_TABS[nextIndex]);
    },
    [go],
  );

  return (
    <div
      role="tablist"
      aria-label="Dashboard views"
      aria-busy={pending}
      className={cn(
        "dash-tabbar flex items-stretch gap-1 overflow-x-auto",
        "border-b border-border -mx-1 px-1",
        "scrollbar-thin",
      )}
      style={{ scrollbarWidth: "thin" }}
    >
      {DASHBOARD_TABS.map((tab, i) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`dash-tab-${tab}`}
            aria-selected={isActive}
            aria-controls="dash-tabpanel"
            tabIndex={isActive ? 0 : -1}
            onClick={() => go(tab)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3.5 pb-2.5 pt-2",
              "text-[0.82rem] font-semibold transition-colors",
              "border-b-2 -mb-px focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60 rounded-t-md",
              isActive
                ? "border-accent text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border",
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}
