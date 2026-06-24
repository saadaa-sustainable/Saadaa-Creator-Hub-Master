"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
          <SearchableSelect
            value={initial.contentType ?? ""}
            onChange={(v) => setParam("contentType", v || undefined)}
            options={[
              { value: "", label: "All content" },
              ...options.contentTypes.map((c) => ({ value: c, label: c })),
            ]}
            placeholder="All content"
            searchPlaceholder="Search content…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Tier</span>
          <SearchableSelect
            value={initial.influencerType ?? ""}
            onChange={(v) => setParam("influencerType", v || undefined)}
            options={[
              { value: "", label: "All tiers" },
              ...TIERS.map((t) => ({ value: t, label: t })),
            ]}
            placeholder="All tiers"
            searchPlaceholder="Search tiers…"
          />
        </label>

        <label className="onboarding-filter-field">
          <span>Status</span>
          <SearchableSelect
            value={initial.status ?? ""}
            onChange={(v) => setParam("status", v || undefined)}
            options={[
              { value: "", label: "All status" },
              { value: "Reach Out", label: "Reach Out" },
              { value: "On Board", label: "Onboard" },
              { value: "Posted", label: "Posted" },
              { value: "Delivered", label: "Delivered" },
            ]}
            placeholder="All status"
            searchPlaceholder="Search status…"
          />
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
