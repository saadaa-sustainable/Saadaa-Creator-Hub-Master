"use client";
import { useCallback, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmissionToggle } from "@/components/ui";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { PostingFilters } from "./types";

interface FilterOptions {
  campaigns: {
    campaign_id: string;
    campaign_name: string | null;
  }[];
  tiers: readonly string[];
  teamMembers: readonly string[];
  contentTypes: readonly string[];
  statuses: readonly string[];
  adsRights: readonly string[];
}

const FILTER_KEYS = [
  "q",
  "campaign",
  "creatorTier",
  "adsRights",
  "onboardedBy",
  "contentType",
  "collabType",
  "onboardDateFrom",
  "onboardDateTo",
  "submitted",
] as const satisfies readonly (keyof PostingFilters)[];

export function PostingFiltersBar({
  initial,
  options,
}: {
  initial: PostingFilters;
  options: FilterOptions;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: keyof PostingFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startTransition(() =>
        router.replace(`?${next.toString()}`, { scroll: false }),
      );
    },
    [params, router, startTransition],
  );

  // Atomic multi-key update (the date-range picker sets from + to together).
  const setParams = useCallback(
    (entries: Partial<Record<keyof PostingFilters, string | undefined>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(entries)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
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
              placeholder="ID, name, username, order ID…"
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
          label="Ads Rights"
          value={initial.adsRights ?? ""}
          onChange={(v) => setParam("adsRights", v)}
          options={[
            { label: "All", value: "" },
            ...options.adsRights.map((r) => ({ label: r, value: r })),
          ]}
        />
        <FilterSelect
          label="Onboarded by"
          value={initial.onboardedBy ?? ""}
          onChange={(v) => setParam("onboardedBy", v)}
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
        <FilterSelect
          label="Collab Type"
          value={initial.collabType ?? ""}
          onChange={(v) => setParam("collabType", v)}
          options={[
            { label: "All collab types", value: "" },
            { label: "Barter", value: "Barter" },
            { label: "Barter + Paid", value: "Barter + Paid" },
          ]}
        />
        <label className="onboarding-filter-field">
          <span>
            {initial.submitted === "yes" ? "Posted" : "Onboarded"} date
          </span>
          <DateRangePicker
            label={
              initial.submitted === "yes" ? "Posted date" : "Onboarded date"
            }
            value={{
              from: initial.onboardDateFrom ?? "",
              to: initial.onboardDateTo ?? "",
            }}
            onChange={(range) =>
              setParams({
                onboardDateFrom: range.from || undefined,
                onboardDateTo: range.to || undefined,
              })
            }
          />
        </label>
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
