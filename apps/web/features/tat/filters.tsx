"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Filter, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TatFilterOptions, TatFilters } from "./types";

const FILTER_KEYS = [
  "campaign",
  "tier",
  "status",
  "reachOutFrom",
  "reachOutTo",
] as const satisfies readonly (keyof TatFilters)[];

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
      <div className="onboarding-filter-grid">
        <label className="onboarding-filter-field">
          <span>
            <Filter size={10} aria-hidden /> Campaign
          </span>
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
          <span>
            <Layers size={10} aria-hidden /> Tier
          </span>
          <select
            value={initial.tier ?? ""}
            onChange={(e) => setParam("tier", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All Tiers</option>
            {options.tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>
            <Filter size={10} aria-hidden /> Status
          </span>
          <select
            value={initial.status ?? ""}
            onChange={(e) =>
              setParam(
                "status",
                (e.target.value as TatFilters["status"]) || undefined,
              )
            }
            className="onboarding-filter-select"
          >
            <option value="">Posted + Delivered</option>
            <option value="posted">Posted only</option>
            <option value="delivered">Delivered only</option>
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>
            <Calendar size={10} aria-hidden /> Reach Out From
          </span>
          <input
            type="date"
            value={initial.reachOutFrom ?? ""}
            onChange={(e) =>
              setParam("reachOutFrom", e.target.value || undefined)
            }
            className="onboarding-filter-select"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>
            <Calendar size={10} aria-hidden /> Reach Out To
          </span>
          <input
            type="date"
            value={initial.reachOutTo ?? ""}
            onChange={(e) =>
              setParam("reachOutTo", e.target.value || undefined)
            }
            className="onboarding-filter-select"
          />
        </label>

        {hasAny && (
          <div className="onboarding-filter-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
