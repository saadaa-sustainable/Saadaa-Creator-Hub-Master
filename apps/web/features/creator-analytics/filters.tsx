"use client";
import { useCallback, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { workflowStatusLabel } from "@/lib/formatters";
import type {
  CreatorAnalyticsFilterOptions,
  CreatorAnalyticsFilters,
} from "./types";

const FILTER_KEYS = [
  "q",
  "ads",
  "tier",
  "region",
  "creatorType",
  "stage",
  "reachOutBy",
  "onboardBy",
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
        <FilterSelect
          label="Meta Ads"
          value={initial.ads ?? ""}
          onChange={(v) => setParam("ads", v)}
          options={[
            { label: "All creators", value: "" },
            { label: "In Meta Ads", value: "in-ads" },
            { label: "Winner creators", value: "winners" },
            { label: "Winners · no live collab", value: "winners-idle" },
          ]}
        />
        <FilterSelect
          label="Reach Out By"
          value={initial.reachOutBy ?? ""}
          onChange={(v) => setParam("reachOutBy", v)}
          options={[
            { label: "All team members", value: "" },
            ...options.teamMembers.map((t) => ({ label: t, value: t })),
          ]}
        />
        <FilterSelect
          label="Onboard By"
          value={initial.onboardBy ?? ""}
          onChange={(v) => setParam("onboardBy", v)}
          options={[
            { label: "All team members", value: "" },
            ...options.teamMembers.map((t) => ({ label: t, value: t })),
          ]}
        />

        <label className="onboarding-filter-field">
          <span>Date range</span>
          <DateRangePicker
            label="Date range"
            value={{
              from:
                (initial.postedFrom ?? "")
                  ? (initial.postedFrom ?? "")
                  : (initial.reachOutFrom ?? ""),
              to:
                (initial.postedTo ?? "")
                  ? (initial.postedTo ?? "")
                  : (initial.reachOutTo ?? ""),
            }}
            modes={[
              { value: "reached", label: "Reached" },
              { value: "posted", label: "Posted" },
            ]}
            mode={initial.postedFrom || initial.postedTo ? "posted" : "reached"}
            onModeChange={(m) => {
              // Switching the basis moves the active range onto the new pair.
              const next = new URLSearchParams(params.toString());
              const from =
                next.get("postedFrom") ?? next.get("reachOutFrom") ?? "";
              const to = next.get("postedTo") ?? next.get("reachOutTo") ?? "";
              ["reachOutFrom", "reachOutTo", "postedFrom", "postedTo"].forEach(
                (k) => next.delete(k),
              );
              if (from)
                next.set(m === "posted" ? "postedFrom" : "reachOutFrom", from);
              if (to) next.set(m === "posted" ? "postedTo" : "reachOutTo", to);
              next.delete("cpage");
              next.delete("page");
              startTransition(() =>
                router.replace(`?${next.toString()}` as never, {
                  scroll: false,
                }),
              );
            }}
            onChange={(r) => {
              const posted = Boolean(initial.postedFrom || initial.postedTo);
              const next = new URLSearchParams(params.toString());
              ["reachOutFrom", "reachOutTo", "postedFrom", "postedTo"].forEach(
                (k) => next.delete(k),
              );
              if (r.from)
                next.set(posted ? "postedFrom" : "reachOutFrom", r.from);
              if (r.to) next.set(posted ? "postedTo" : "reachOutTo", r.to);
              next.delete("cpage");
              next.delete("page");
              startTransition(() =>
                router.replace(`?${next.toString()}` as never, {
                  scroll: false,
                }),
              );
            }}
          />
        </label>

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
