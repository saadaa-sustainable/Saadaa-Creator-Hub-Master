"use client";
import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <select
            value={initial.campaign ?? ""}
            onChange={(e) => setParam("campaign", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All campaigns</option>
            {options.campaigns.map((c) => (
              <option key={c.campaign_id} value={c.campaign_id}>
                {c.campaign_id}
                {c.campaign_name ? ` · ${c.campaign_name}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Payment Status</span>
          <select
            value={initial.statusFilter ?? ""}
            onChange={(e) =>
              setParam("statusFilter", e.target.value || undefined)
            }
            className="onboarding-filter-select"
          >
            <option value="">All statuses</option>
            {options.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Ads Rights</span>
          <select
            value={initial.adsRights ?? ""}
            onChange={(e) =>
              setParam("adsRights", e.target.value || undefined)
            }
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            {options.adsRights.map((r) => (
              <option key={r} value={r}>
                {r === "yes" ? "Yes" : "No"}
              </option>
            ))}
          </select>
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
