"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardFilterOptions, DashboardFilters } from "./types";

const FILTER_KEYS = [
  "campaign",
  "status",
  "contentType",
  "influencerType",
  "dateFrom",
  "dateTo",
] as const satisfies readonly (keyof DashboardFilters)[];

const TIERS = ["Nano", "Micro", "Mid tier", "Macro", "Mega"];

export function DashboardFiltersBar({
  initial,
  options,
}: {
  initial: DashboardFilters;
  options: DashboardFilterOptions;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof DashboardFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startTransition(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    [params, router, startTransition],
  );

  const reset = () => {
    const next = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((k) => next.delete(k));
    startTransition(() =>
      router.replace(`?${next.toString()}` as never, { scroll: false }),
    );
  };

  const hasAny = FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className="onboarding-filter-card" aria-busy={pending}>
      <div className="onboarding-filter-grid acc-filter-grid">
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
          <span>Date from</span>
          <input
            type="date"
            value={initial.dateFrom ?? ""}
            onChange={(e) => setParam("dateFrom", e.target.value || undefined)}
            className="onboarding-filter-select"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Date to</span>
          <input
            type="date"
            value={initial.dateTo ?? ""}
            onChange={(e) => setParam("dateTo", e.target.value || undefined)}
            className="onboarding-filter-select"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Content type</span>
          <select
            value={initial.contentType ?? ""}
            onChange={(e) => setParam("contentType", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All content</option>
            {options.contentTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="onboarding-filter-field">
          <span>Tier</span>
          <select
            value={initial.influencerType ?? ""}
            onChange={(e) => setParam("influencerType", e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All tiers</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
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
            <option value="">All status</option>
            <option value="Reach Out">Reach Out</option>
            <option value="On Board">On Board</option>
            <option value="Posted">Posted</option>
            <option value="Delivered">Delivered</option>
          </select>
        </label>

        <div className="onboarding-filter-actions">
          {hasAny && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
