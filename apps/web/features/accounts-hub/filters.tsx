"use client";
import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { AccountsFilters } from "./types";

interface FilterOptions {
  campaigns: { campaign_id: string; campaign_name: string | null }[];
  statuses: readonly string[];
  adsRights: readonly string[];
}

const FILTER_KEYS = [
  "q",
  "campaign",
  "statusFilter",
  "adsRights",
] as const satisfies readonly (keyof AccountsFilters)[];

export function AccountsFiltersBar({
  initial,
  options,
  resultCount,
}: {
  initial: AccountsFilters;
  options: FilterOptions;
  resultCount?: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof AccountsFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startTransition(() =>
        router.replace(`?${next.toString()}`, { scroll: false }),
      );
    },
    [params, router, startTransition],
  );

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((k) => next.delete(k));
    startTransition(() =>
      router.replace(`?${next.toString()}`, { scroll: false }),
    );
  };

  const hasAny = FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className="onboarding-filter-card" aria-busy={pending}>
      <div className="onboarding-filter-grid acc-filter-grid">
        <label className="onboarding-filter-field acc-filter-search">
          <span>Search</span>
          <div className="acc-search-input">
            <Search size={13} aria-hidden />
            <input
              type="search"
              defaultValue={initial.q ?? ""}
              placeholder="Post ID, creator, UTR, campaign…"
              onBlur={(e) => setParam("q", e.target.value || undefined)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setParam("q", (e.target as HTMLInputElement).value || undefined);
                }
              }}
              className="onboarding-filter-select"
            />
          </div>
        </label>

        <label className="onboarding-filter-field">
          <span>Campaign</span>
          <SearchableSelect
            value={initial.campaign ?? ""}
            onChange={(v) => setParam("campaign", v || undefined)}
            options={[
              { value: "", label: "All campaigns" },
              ...options.campaigns.map((c) => ({
                value: c.campaign_id,
                label: `${c.campaign_id}${c.campaign_name ? ` · ${c.campaign_name}` : ""}`,
              })),
            ]}
            placeholder="All campaigns"
            searchPlaceholder="Search campaigns…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Payment Status</span>
          <SearchableSelect
            value={initial.statusFilter ?? ""}
            onChange={(v) => setParam("statusFilter", v || undefined)}
            options={[
              { value: "", label: "All statuses" },
              ...options.statuses.map((s) => ({ value: s, label: s })),
            ]}
            placeholder="All statuses"
            searchPlaceholder="Search statuses…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Ads Rights</span>
          <SearchableSelect
            value={initial.adsRights ?? ""}
            onChange={(v) => setParam("adsRights", v || undefined)}
            options={[
              { value: "", label: "All" },
              ...options.adsRights.map((r) => ({
                value: r,
                label: r === "yes" ? "Yes" : "No",
              })),
            ]}
            placeholder="All"
            searchPlaceholder="Search…"
          />
        </label>

        <div className="onboarding-filter-actions">
          {typeof resultCount === "number" && (
            <span className="acc-result-chip tabular">
              {resultCount} row{resultCount === 1 ? "" : "s"}
            </span>
          )}
          {hasAny && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
