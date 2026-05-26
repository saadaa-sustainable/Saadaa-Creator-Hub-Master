"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdStatusFilterOptions, AdStatusFilters } from "./types";

const FILTER_KEYS = [
  "search",
  "campaign",
  "classification",
  "adStatus",
] as const satisfies readonly (keyof AdStatusFilters)[];

export function AdStatusFiltersBar({
  initial,
  options,
  resultCount,
}: {
  initial: AdStatusFilters;
  options: AdStatusFilterOptions;
  resultCount?: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof AdStatusFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startTransition(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    [params, router, startTransition],
  );

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((k) => next.delete(k));
    startTransition(() =>
      router.replace(`?${next.toString()}` as never, { scroll: false }),
    );
  };

  const hasAny = FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className="onboarding-filter-card" aria-busy={pending}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <label className="onboarding-filter-field col-span-2 md:col-span-1">
          <span>Search</span>
          <div className="relative flex items-center">
            <Search size={13} aria-hidden className="absolute left-2.5 text-text-tertiary pointer-events-none" />
            <input
              type="search"
              defaultValue={initial.search ?? ""}
              placeholder="Creator name, @username, post ID…"
              onBlur={(e) => setParam("search", e.target.value || undefined)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setParam(
                    "search",
                    (e.target as HTMLInputElement).value || undefined,
                  );
                }
              }}
              className="onboarding-filter-select pl-7"
            />
          </div>
        </label>

        <label className="onboarding-filter-field">
          <span>Campaign</span>
          <select
            value={initial.campaign ?? ""}
            onChange={(e) => setParam("campaign", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All Campaigns</option>
            {options.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
                {c.name && c.name !== c.id ? ` · ${c.name}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Classification</span>
          <select
            value={initial.classification ?? ""}
            onChange={(e) =>
              setParam("classification", e.target.value || undefined)
            }
            className="onboarding-filter-select"
          >
            <option value="">All Results</option>
            <option value="Winner">Winner</option>
            <option value="ITE">ITE</option>
            <option value="Discarded but analyse">Discarded (Analyse)</option>
            <option value="Discarded">Discarded</option>
            <option value="__untested">Untested only</option>
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Ad Status</span>
          <select
            value={initial.adStatus ?? ""}
            onChange={(e) => setParam("adStatus", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="run">Run</option>
            <option value="running">Running</option>
          </select>
        </label>
      </div>

      {(typeof resultCount === "number" || hasAny) && (
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          {typeof resultCount === "number" && (
            <span className="text-[0.74rem] font-bold tabular text-text-secondary bg-bg-ecru border border-border rounded-full px-3 py-1">
              {resultCount} post{resultCount === 1 ? "" : "s"}
            </span>
          )}
          {hasAny && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="gap-1.5 ml-auto"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
