"use client";
import { useCallback, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { workflowStatusLabel } from "@/lib/formatters";
import type {
  CreatorAnalyticsFilterOptions,
  CreatorAnalyticsFilters,
} from "./types";

const FILTER_KEYS = [
  "q",
  "tier",
  "region",
  "creatorType",
  "stage",
  "reachOutFrom",
  "reachOutTo",
  "postedFrom",
  "postedTo",
] as const satisfies readonly (keyof CreatorAnalyticsFilters)[];

const CREATOR_TYPE_LABELS: Record<string, string> = {
  historic_creator: "Historic",
  new_creator: "New",
};

export function CreatorAnalyticsFiltersBar({
  initial,
  options,
}: {
  initial: CreatorAnalyticsFilters;
  options: CreatorAnalyticsFilterOptions;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof CreatorAnalyticsFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      // Any filter change lands the user on page 1 of the new result set.
      next.delete("cpage");
      next.delete("page");
      startTransition(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    [params, router, startTransition],
  );

  // Debounced free-text search → `q` (300ms after the last keystroke).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(
        () => setParam("q", value.trim() || undefined),
        300,
      );
    },
    [setParam],
  );

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((k) => next.delete(k));
    // Reset pagination too, so the cleared view starts on page 1.
    next.delete("cpage");
    next.delete("page");
    startTransition(() =>
      router.replace(`?${next.toString()}` as never, { scroll: false }),
    );
  };

  const hasAny = FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className="onboarding-filter-card" aria-busy={pending}>
      <div className="onboarding-filter-grid">
        <label className="onboarding-filter-field">
          <span>Search</span>
          <span className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-text-tertiary"
              aria-hidden
            />
            <input
              type="search"
              defaultValue={initial.q ?? ""}
              placeholder="INF ID, name, username…"
              onChange={(e) => onSearch(e.target.value)}
              className="onboarding-filter-select pl-7"
            />
          </span>
        </label>

        <FilterSelect
          label="Tier"
          value={initial.tier ?? ""}
          onChange={(v) => setParam("tier", v)}
          options={[
            { label: "All tiers", value: "" },
            ...options.tiers.map((t) => ({ label: t, value: t })),
          ]}
        />
        <FilterSelect
          label="Region"
          value={initial.region ?? ""}
          onChange={(v) => setParam("region", v)}
          options={[
            { label: "All regions", value: "" },
            ...options.regions.map((r) => ({ label: r, value: r })),
          ]}
        />
        <FilterSelect
          label="Creator Type"
          value={initial.creatorType ?? ""}
          onChange={(v) => setParam("creatorType", v)}
          options={[
            { label: "All creators", value: "" },
            ...options.creatorTypes.map((t) => ({
              label: CREATOR_TYPE_LABELS[t] ?? t,
              value: t,
            })),
          ]}
        />
        <FilterSelect
          label="Current Stage"
          value={initial.stage ?? ""}
          onChange={(v) => setParam("stage", v)}
          options={[
            { label: "All stages", value: "" },
            ...options.statuses.map((s) => ({
              label: workflowStatusLabel(s),
              value: s,
            })),
          ]}
        />

        <FilterDate
          label="Reach Out from"
          value={initial.reachOutFrom ?? ""}
          onBlur={(v) => setParam("reachOutFrom", v)}
        />
        <FilterDate
          label="Reach Out to"
          value={initial.reachOutTo ?? ""}
          onBlur={(v) => setParam("reachOutTo", v)}
        />
        <FilterDate
          label="Posted from"
          value={initial.postedFrom ?? ""}
          onBlur={(v) => setParam("postedFrom", v)}
        />
        <FilterDate
          label="Posted to"
          value={initial.postedTo ?? ""}
          onBlur={(v) => setParam("postedTo", v)}
        />

        <div className="onboarding-filter-actions">
          {hasAny && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5">
              <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string | undefined) => void;
  options: { label: string; value: string }[];
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label className="onboarding-filter-field">
      <span>{label}</span>
      <SearchableSelect
        value={value ?? ""}
        onChange={(v) => onChange(v || undefined)}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        placeholder={`All ${label.toLowerCase()}`}
        searchPlaceholder={`Search ${label.toLowerCase()}…`}
      />
    </label>
  );
}

interface FilterDateProps {
  label: string;
  value: string;
  onBlur: (value: string | undefined) => void;
}

function FilterDate({ label, value, onBlur }: FilterDateProps) {
  return (
    <label className="onboarding-filter-field">
      <span>{label}</span>
      <input
        type="date"
        defaultValue={value}
        onBlur={(e) => onBlur(e.target.value || undefined)}
        className="onboarding-filter-select"
      />
    </label>
  );
}
