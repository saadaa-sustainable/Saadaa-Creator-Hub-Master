"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

type HistoricView = "overview" | "funnel";

const HISTORIC_VIEWS: { id: HistoricView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "funnel", label: "Funnel" },
];

/**
 * Overview / Funnel sub-tab for the Historic Analytics page. Writes the active
 * view to the `?view=` URL param (linkable + server-rendered) while preserving
 * every other param (the archive filters).
 *
 * Chrome matches the main Dashboard tab rail (`.dash-tabbar` trough +
 * `.dash-tab-pill` pills, dark active fill) rather than the cramped legacy
 * `.ob-viewtoggle`, so the two analytics surfaces read identically.
 */
export function HistoricViewToggle({ active }: { active: HistoricView }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = useCallback(
    (view: HistoricView) => {
      const next = new URLSearchParams(params.toString());
      if (view === "overview") next.delete("view");
      else next.set("view", view);
      const qs = next.toString();
      return `${pathname}${qs ? `?${qs}` : ""}`;
    },
    [params, pathname],
  );

  return (
    <div
      role="tablist"
      aria-label="Historic view"
      className="dash-tabbar flex items-center gap-1 overflow-x-auto"
      style={{ scrollbarWidth: "thin" }}
    >
      {HISTORIC_VIEWS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <Link
            key={id}
            href={hrefFor(id) as never}
            scroll={false}
            role="tab"
            aria-selected={isActive}
            data-active={isActive ? "true" : undefined}
            className={cn(
              "dash-tab-pill inline-flex items-center justify-center shrink-0",
              "whitespace-nowrap rounded-[7px]",
              "px-3 py-1.5 text-[0.74rem] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-accent/60",
              !isActive && "text-text-secondary hover:text-text-primary",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
