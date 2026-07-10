"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Filter, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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
          <SearchableSelect
            value={initial.campaign ?? ""}
            onChange={(v) => setParam("campaign", v || undefined)}
            options={[
              { value: "", label: "All Campaigns" },
              ...options.campaigns.map((c) => ({
                value: c.id,
                label: `${c.id}${c.name && c.name !== c.id ? ` · ${c.name}` : ""}`,
              })),
            ]}
            placeholder="All Campaigns"
            searchPlaceholder="Search campaigns…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>
            <Layers size={10} aria-hidden /> Tier
          </span>
          <SearchableSelect
            value={initial.tier ?? ""}
            onChange={(v) => setParam("tier", v || undefined)}
            options={[
              { value: "", label: "All Tiers" },
              ...options.tiers.map((t) => ({ value: t, label: t })),
            ]}
            placeholder="All Tiers"
            searchPlaceholder="Search tiers…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>
            <Filter size={10} aria-hidden /> Status
          </span>
          <SearchableSelect
            value={initial.status ?? ""}
            onChange={(v) =>
              setParam("status", (v as TatFilters["status"]) || undefined)
            }
            options={[
              { value: "", label: "Posted + Delivered" },
              { value: "posted", label: "Posted only" },
              { value: "delivered", label: "Delivered only" },
            ]}
            placeholder="Posted + Delivered"
            searchPlaceholder="Search…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>
            <Calendar size={10} aria-hidden /> Reach Out date
          </span>
          <DateRangePicker
            label="Reach Out date"
            value={{
              from: initial.reachOutFrom ?? "",
              to: initial.reachOutTo ?? "",
            }}
            onChange={(r) => {
              // Atomic two-key update — sequential setParam calls would race.
              const next = new URLSearchParams(params.toString());
              if (r.from) next.set("reachOutFrom", r.from);
              else next.delete("reachOutFrom");
              if (r.to) next.set("reachOutTo", r.to);
              else next.delete("reachOutTo");
              startTransition(() =>
                router.replace(`?${next.toString()}` as never, {
                  scroll: false,
                }),
              );
            }}
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
