"use client";
import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmissionToggle } from "@/components/ui";
import { workflowStatusLabel } from "@/lib/formatters";
import type { PostingFilters } from "./types";

interface FilterOptions {
  campaigns: {
    campaign_id: string;
    campaign_name: string | null;
  }[];
  tiers: readonly string[];
  statuses: readonly string[];
  adsRights: readonly string[];
}

const FILTER_KEYS = [
  "campaign",
  "statusFilter",
  "creatorTier",
  "adsRights",
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
          label="Stage"
          value={initial.statusFilter ?? ""}
          onChange={(v) => setParam("statusFilter", v)}
          options={[
            { label: "All stages", value: "" },
            ...options.statuses.map((s) => ({
              label: workflowStatusLabel(s),
              value: s,
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
        <FilterDate
          label="Onboarded from"
          value={initial.onboardDateFrom ?? ""}
          onBlur={(value) => setParam("onboardDateFrom", value)}
        />
        <FilterDate
          label="Onboarded to"
          value={initial.onboardDateTo ?? ""}
          onBlur={(value) => setParam("onboardDateTo", value)}
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="onboarding-filter-select"
      >
        {options.map((o) => (
          <option key={o.value || "__all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
