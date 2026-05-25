"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <select
            value={initial.campaign ?? ""}
            onChange={(e) => setParam("campaign", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All campaigns</option>
            {options.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
                {c.name && c.name !== c.id ? ` · ${c.name}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Status</span>
          <select
            value={initial.status ?? ""}
            onChange={(e) => setParam("status", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending Dispatch</option>
            <option value="transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="rto">RTO</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Collab</span>
          <select
            value={initial.collab ?? ""}
            onChange={(e) => setParam("collab", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="Barter">Barter</option>
            <option value="Barter + Paid">Barter + Paid</option>
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Financial</span>
          <select
            value={initial.financial ?? ""}
            onChange={(e) => setParam("financial", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partial refund</option>
            <option value="pending">Pending</option>
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Discount</span>
          <select
            value={initial.discount ?? ""}
            onChange={(e) => setParam("discount", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="yes">Has code</option>
            <option value="no">No code</option>
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Repeat creator</span>
          <select
            value={initial.repeat ?? ""}
            onChange={(e) => setParam("repeat", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="yes">Repeat</option>
            <option value="no">First-time</option>
          </select>
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
