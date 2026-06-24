"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { OrderStatusFilterOptions, OrderStatusFilters } from "./types";

const FILTER_KEYS = [
  "search",
  "campaign",
  "status",
  "collab",
  "financial",
  "discount",
  "repeat",
] as const satisfies readonly (keyof OrderStatusFilters)[];

/**
 * Filter strip — mirrors Accounts Hub's `AccountsFiltersBar` shell so the
 * visual language matches every other stage. `.onboarding-filter-card`
 * wraps `.onboarding-filter-grid.acc-filter-grid` with field labels that
 * use a plain `<span>` (no `.onboarding-filter-label` class).
 */
export function OrderStatusFiltersBar({
  initial,
  options,
  resultCount,
}: {
  initial: OrderStatusFilters;
  options: OrderStatusFilterOptions;
  resultCount?: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof OrderStatusFilters, value: string | undefined) => {
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
      <div className="onboarding-filter-grid acc-filter-grid order-status-filter-grid">
        <label className="onboarding-filter-field acc-filter-search">
          <span>Search</span>
          <div className="acc-search-input">
            <Search size={13} aria-hidden />
            <input
              type="search"
              defaultValue={initial.search ?? ""}
              placeholder="Creator, order ID, tracking, campaign…"
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
                value: c.id,
                label: `${c.id}${c.name && c.name !== c.id ? ` · ${c.name}` : ""}`,
              })),
            ]}
            placeholder="All campaigns"
            searchPlaceholder="Search campaigns…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Status</span>
          <SearchableSelect
            value={initial.status ?? ""}
            onChange={(v) => setParam("status", v || undefined)}
            options={[
              { value: "", label: "All statuses" },
              { value: "pending", label: "Pending Dispatch" },
              { value: "transit", label: "In Transit" },
              { value: "delivered", label: "Delivered" },
              { value: "rto", label: "RTO" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            placeholder="All statuses"
            searchPlaceholder="Search statuses…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Collab</span>
          <SearchableSelect
            value={initial.collab ?? ""}
            onChange={(v) => setParam("collab", v || undefined)}
            options={[
              { value: "", label: "All" },
              { value: "Barter", label: "Barter" },
              { value: "Barter + Paid", label: "Barter + Paid" },
            ]}
            placeholder="All"
            searchPlaceholder="Search…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Financial</span>
          <SearchableSelect
            value={initial.financial ?? ""}
            onChange={(v) => setParam("financial", v || undefined)}
            options={[
              { value: "", label: "All" },
              { value: "paid", label: "Paid" },
              { value: "refunded", label: "Refunded" },
              { value: "partially_refunded", label: "Partial refund" },
              { value: "pending", label: "Pending" },
            ]}
            placeholder="All"
            searchPlaceholder="Search…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Discount</span>
          <SearchableSelect
            value={initial.discount ?? ""}
            onChange={(v) => setParam("discount", v || undefined)}
            options={[
              { value: "", label: "All" },
              { value: "yes", label: "Has code" },
              { value: "no", label: "No code" },
            ]}
            placeholder="All"
            searchPlaceholder="Search…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Repeat creator</span>
          <SearchableSelect
            value={initial.repeat ?? ""}
            onChange={(v) => setParam("repeat", v || undefined)}
            options={[
              { value: "", label: "All" },
              { value: "yes", label: "Repeat" },
              { value: "no", label: "First-time" },
            ]}
            placeholder="All"
            searchPlaceholder="Search…"
          />
        </label>

        <div className="onboarding-filter-actions">
          {typeof resultCount === "number" && (
            <span className="acc-result-chip tabular">
              {resultCount} order{resultCount === 1 ? "" : "s"}
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
