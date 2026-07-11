"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, Hash, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { AdStatusFilterOptions, AdStatusFilters } from "./types";

const FILTER_KEYS = [
  "search",
  "campaign",
  "classification",
  "adStatus",
  "sort",
  "postedFrom",
  "postedTo",
] as const satisfies readonly (keyof AdStatusFilters)[];

const SORT_OPTIONS = [
  { value: "", label: "Default order" },
  { value: "spend-desc", label: "Spend high to low" },
  { value: "spend-asc", label: "Spend low to high" },
  { value: "roas-desc", label: "ROAS high to low" },
  { value: "newest", label: "Newest post first" },
  { value: "oldest", label: "Oldest post first" },
  { value: "days-desc", label: "Needs review longest" },
];

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
    <div
      className="campaign-list-toolbar ad-status-filter-toolbar"
      aria-busy={pending}
    >
      <label className="campaign-search-field ad-status-search-field">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          defaultValue={initial.search ?? ""}
          placeholder="Search creator, @username, post ID, ad name"
          aria-label="Search ads by creator, username, post ID, or ad name"
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
        />
      </label>

      <div className="campaign-filter-controls ad-status-filter-controls">
        <div className="campaign-filter-select campaign-filter-select--combo ad-status-filter-select ad-status-filter-select--campaign">
          <Hash size={14} aria-hidden="true" />
          <SearchableSelect
            value={initial.campaign ?? ""}
            onChange={(v) => setParam("campaign", v || undefined)}
            options={[
              {
                value: "",
                label: "All Campaigns",
                hint: `${options.campaigns.length} campaign IDs`,
              },
              ...options.campaigns.map((c) => ({
                value: c.id,
                label: c.id,
                hint: c.name && c.name !== c.id ? c.name : undefined,
              })),
            ]}
            placeholder="All Campaigns"
            searchPlaceholder="Search campaigns…"
            className="campaign-filter-combobox"
            contentClassName="campaign-id-filter-popover ad-status-id-filter-popover"
            optionLayout="stacked"
          />
        </div>

        <div className="campaign-filter-select campaign-filter-select--combo ad-status-filter-select">
          <SlidersHorizontal size={14} aria-hidden="true" />
          <SearchableSelect
            value={initial.classification ?? ""}
            onChange={(v) => setParam("classification", v || undefined)}
            options={[
              { value: "", label: "All Results" },
              { value: "Incremental Winner", label: "Incremental Winner" },
              { value: "Winner", label: "Winner" },
              { value: "P0 analysis", label: "P0 Analysis" },
              { value: "P1 analysis", label: "P1 Analysis" },
              { value: "P2 analysis", label: "P2 Analysis" },
              { value: "ITE", label: "ITE" },
              { value: "Discarded but analyse", label: "Discarded (Analyse)" },
              { value: "Discarded", label: "Discarded" },
              { value: "__untested", label: "Untested only" },
            ]}
            placeholder="All Results"
            searchPlaceholder="Search…"
            className="campaign-filter-combobox"
          />
        </div>

        <div className="campaign-filter-select campaign-filter-select--combo ad-status-filter-select">
          <SlidersHorizontal size={14} aria-hidden="true" />
          <SearchableSelect
            value={initial.adStatus ?? ""}
            onChange={(v) => setParam("adStatus", v || undefined)}
            options={[
              { value: "", label: "All" },
              // Meta delivery statuses as they exist in the warehouse mirror;
              // matched exactly against the row's first-occurrence ad.
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "campaign_paused", label: "Campaign Paused" },
              { value: "adset_paused", label: "Adset Paused" },
              { value: "with_issues", label: "With Issues" },
              { value: "archived", label: "Archived" },
            ]}
            placeholder="All"
            searchPlaceholder="Search…"
            className="campaign-filter-combobox"
          />
        </div>

        <div className="campaign-filter-select campaign-filter-select--combo ad-status-filter-select">
          <ArrowDownUp size={14} aria-hidden="true" />
          <SearchableSelect
            value={initial.sort ?? ""}
            onChange={(v) => setParam("sort", v || undefined)}
            options={SORT_OPTIONS}
            placeholder="Default order"
            searchPlaceholder="Search sort…"
            className="campaign-filter-combobox"
          />
        </div>

        <div className="min-w-[190px]">
          <DateRangePicker
            label="Posted date"
            value={{
              from: initial.postedFrom ?? "",
              to: initial.postedTo ?? "",
            }}
            onChange={(r) => {
              // Atomic two-key update — sequential setParam calls would race.
              const next = new URLSearchParams(params.toString());
              if (r.from) next.set("postedFrom", r.from);
              else next.delete("postedFrom");
              if (r.to) next.set("postedTo", r.to);
              else next.delete("postedTo");
              startTransition(() =>
                router.replace(`?${next.toString()}` as never, {
                  scroll: false,
                }),
              );
            }}
          />
        </div>
      </div>

      {(typeof resultCount === "number" || hasAny) && (
        <div className="campaign-list-toolbar__meta ad-status-filter-meta">
          {typeof resultCount === "number" && (
            <span>
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
