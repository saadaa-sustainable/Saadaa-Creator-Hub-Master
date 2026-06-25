"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, Filter } from "lucide-react";
import { cn } from "@/lib/cn";

type HistoricView = "overview" | "funnel";

/**
 * Overview / Funnel sub-tab for the Historic Analytics page. Writes the active
 * view to the `?view=` URL param (linkable + server-rendered) while preserving
 * every other param (the archive filters). Reuses the shared `.ob-viewtoggle`
 * pill chrome so it matches the rest of the app.
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
    <div className="ob-viewtoggle" role="tablist" aria-label="Historic view">
      <Link
        href={hrefFor("overview") as never}
        scroll={false}
        role="tab"
        aria-selected={active === "overview"}
        className={cn(active === "overview" && "active")}
      >
        <Filter size={12} aria-hidden />
        Overview
      </Link>
      <Link
        href={hrefFor("funnel") as never}
        scroll={false}
        role="tab"
        aria-selected={active === "funnel"}
        className={cn(active === "funnel" && "active")}
      >
        <BarChart3 size={12} aria-hidden />
        Funnel
      </Link>
    </div>
  );
}
