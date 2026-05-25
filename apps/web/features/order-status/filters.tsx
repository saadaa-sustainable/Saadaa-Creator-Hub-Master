"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import type { OrderStatusFilterOptions, OrderStatusFilters } from "./types";

/**
 * Filter strip — search + 6 selects. Same chrome as other stages
 * (.onboarding-filter-card, .onboarding-filter-grid, .onboarding-filter-field,
 * .onboarding-filter-label, .onboarding-filter-select). URL-driven so links
 * are shareable + the server query re-runs on change.
 */
export function OrderStatusFiltersBar({
  initial,
  options,
}: {
  initial: OrderStatusFilters;
  options: OrderStatusFilterOptions;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const patch = (key: keyof OrderStatusFilters, value: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    startTransition(() =>
      router.replace(`/order-status?${sp.toString()}`, { scroll: false }),
    );
  };

  return (
    <section className="onboarding-filter-card">
      <header className="onboarding-filter-card__head">
        <span className="onboarding-filter-card__title">
          <Filter size={11} aria-hidden />
          Filters
        </span>
        {pending && (
          <span className="onboarding-filter-card__pending">updating…</span>
        )}
      </header>
      <div className="onboarding-filter-grid">
        <label className="onboarding-filter-field onboarding-filter-field--search">
          <span className="onboarding-filter-label">Search</span>
          <input
            type="search"
            defaultValue={initial.search ?? ""}
            placeholder="Creator, order ID, tracking, campaign…"
            onChange={(e) => patch("search", e.target.value)}
            className="onboarding-filter-select"
          />
        </label>
        <label className="onboarding-filter-field">
          <span className="onboarding-filter-label">Campaign</span>
          <select
            defaultValue={initial.campaign ?? ""}
            onChange={(e) => patch("campaign", e.target.value)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            {options.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
                {c.name && c.name !== c.id ? ` · ${c.name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="onboarding-filter-field">
          <span className="onboarding-filter-label">Status</span>
          <select
            defaultValue={initial.status ?? ""}
            onChange={(e) => patch("status", e.target.value)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="pending">Pending Dispatch</option>
            <option value="transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="rto">RTO</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="onboarding-filter-field">
          <span className="onboarding-filter-label">Collab</span>
          <select
            defaultValue={initial.collab ?? ""}
            onChange={(e) => patch("collab", e.target.value)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="Barter">Barter</option>
            <option value="Barter + Paid">Barter + Paid</option>
          </select>
        </label>
        <label className="onboarding-filter-field">
          <span className="onboarding-filter-label">Financial</span>
          <select
            defaultValue={initial.financial ?? ""}
            onChange={(e) => patch("financial", e.target.value)}
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
          <span className="onboarding-filter-label">Discount</span>
          <select
            defaultValue={initial.discount ?? ""}
            onChange={(e) => patch("discount", e.target.value)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="yes">Has code</option>
            <option value="no">No code</option>
          </select>
        </label>
        <label className="onboarding-filter-field">
          <span className="onboarding-filter-label">Repeat creator</span>
          <select
            defaultValue={initial.repeat ?? ""}
            onChange={(e) => patch("repeat", e.target.value)}
            className="onboarding-filter-select"
          >
            <option value="">All</option>
            <option value="yes">Repeat</option>
            <option value="no">First-time</option>
          </select>
        </label>
      </div>
    </section>
  );
}
