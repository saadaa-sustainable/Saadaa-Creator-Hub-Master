"use client";
import { useCallback, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmissionToggle } from "@/components/ui";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { dispatchLiveSearch, syncSearchParam } from "@/lib/live-search";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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
  "collabType",
  "overdue",
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

  // Atomic multi-key update (the date-range picker sets from + to together).
  const setParams = useCallback(
    (entries: Partial<Record<keyof OnboardingFilters, string | undefined>>) => {
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

  // Instant search: broadcast every keystroke to the table (client-side
  // filtering over the already-loaded rows — no server round trip), and only
  // mirror the value into the URL for shareable links (history.replaceState,
  // never router.replace: that re-ran the whole server page per search).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = useCallback((value: string) => {
    dispatchLiveSearch("onboarding", value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => syncSearchParam(value), 400);
  }, []);

  const clearAll = () => {
    dispatchLiveSearch("onboarding", "");
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
          label="Region"
          value={initial.region ?? ""}
          onChange={(v) => setParam("region", v)}
          options={[
            { label: "All regions", value: "" },
            ...options.regions.map((r) => ({ label: r, value: r })),
          ]}
        />
        <FilterSelect
          label={
            initial.submitted === "yes" ? "Onboarded by" : "Reached out by"
          }
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
        <FilterSelect
          label="Delivery"
          value={initial.overdue ?? ""}
          onChange={(v) => setParam("overdue", v)}
          options={[
            { label: "All deliveries", value: "" },
            { label: "Overdue only", value: "yes" },
          ]}
        />
        <label className="onboarding-filter-field">
          <span>
            {initial.submitted === "yes" ? "Onboarded" : "Reach Out"} date
          </span>
          <DateRangePicker
            label={
              initial.submitted === "yes" ? "Onboarded date" : "Reach Out date"
            }
            value={{
              from: initial.reachoutDateFrom ?? "",
              to: initial.reachoutDateTo ?? "",
            }}
            onChange={(range) =>
              setParams({
                reachoutDateFrom: range.from || undefined,
                reachoutDateTo: range.to || undefined,
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

