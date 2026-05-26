"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TatFilterOptions, TatFilters } from "./types";

const FILTER_KEYS = ["campaign"] as const satisfies readonly (keyof TatFilters)[];

export function TatFiltersBar({
  initial,
  options,
}: {
  initial: TatFilters;
  options: TatFilterOptions;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof TatFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startTransition(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    [params, router],
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-end">
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
      </div>

      {hasAny && (
        <div className="flex items-center justify-end mt-3">
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5">
            <X className="h-3.5 w-3.5" aria-hidden /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}
