"use client";
import { useCallback, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmissionToggle } from "@/components/ui";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { OnboardingFilters } from "./types";

interface FilterOptions {
  campaigns: {
    campaign_id: string;
    campaign_name: string | null;
  }[];
  tiers: readonly string[];
  regions: readonly string[];
  teamMembers: readonly string[];
  contentTypes: readonly string[];
  statuses: readonly string[];
}

const FILTER_KEYS = [
  "q",
  "campaign",
  "creatorTier",
  "region",
  "reachedOutBy",
  "contentType",
  "reachoutDateFrom",
  "reachoutDateTo",
  "submitted",
] as const satisfies readonly (keyof OnboardingFilters)[];

export function OnboardingFiltersBar({
  initial,
  options,
}: {
  initial: OnboardingFilters;
  options: FilterOptions;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof OnboardingFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startTransition(() =>
        router.replace(`?${next.toString()}`, { scroll: false }),
      );
    },
    [params, router, startTransition],
  );

  // Debounced free-text search → `q` URL param (300ms after the last keystroke).
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
    startTransition(() =>
      router.replace(`?${next.toString()}`, { scroll: false }),
    );
  };

  const hasAny = FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className="onboarding-filter-card" aria-busy={pending}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-text-secondary">Show</span>
        <SubmissionToggle
          submittedYes={initial.submitted === "yes"}
          onChange={(yes) => setParam("submitted", yes ? "yes" : undefined)}
        />
      </div>
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
              placeholder="ID, name, username, URL…"
              onChange={(e) => onSearch(e.target.value)}
              className="onboarding-filter-select pl-7"
            />
          </span>
        </label>
        <FilterSelect
          label="Campaign"
          value={initial.campaign ?? ""}
          onChange={(v) => setParam("campaign", v)}
          options={[
            { label: "All campaigns", value: "" },
            ...options.campaigns.map((c) => ({
              label: `${c.campaign_id}${c.campaign_name ? ` · ${c.campaign_name}` : ""}`,
              value: c.campaign_id,
            })),
          ]}
        />
        <FilterSelect
          label="Tier"
          value={initial.creatorTier ?? ""}
          onChange={(v) => setParam("creatorTier", v)}
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
          label="Reached out by"
          value={initial.reachedOutBy ?? ""}
          onChange={(v) => setParam("reachedOutBy", v)}
          options={[
            { label: "All team members", value: "" },
            ...options.teamMembers.map((m) => ({ label: m, value: m })),
          ]}
        />
        <FilterSelect
          label="Content Type"
          value={initial.contentType ?? ""}
          onChange={(v) => setParam("contentType", v)}
          options={[
            { label: "All content types", value: "" },
            ...options.contentTypes.map((c) => ({ label: c, value: c })),
          ]}
        />
        <FilterDate
          label="Reach Out from"
          value={initial.reachoutDateFrom ?? ""}
          onBlur={(value) => setParam("reachoutDateFrom", value)}
        />
        <FilterDate
          label="Reach Out to"
          value={initial.reachoutDateTo ?? ""}
          onBlur={(value) => setParam("reachoutDateTo", value)}
        />
        <div className="onboarding-filter-actions">
          {hasAny && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="gap-1.5"
            >
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
