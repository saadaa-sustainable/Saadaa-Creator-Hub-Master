"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type {
  JourneyClientFilters,
  JourneyFilterOptions,
  JourneyFilters,
} from "./types";

/** Category → Tier label mapping (mirrors legacy). */
export const TIER_LABELS = [
  { value: "Nano", label: "Nano (<10K)" },
  { value: "Micro", label: "Micro (10K–50K)" },
  { value: "Mid-tier", label: "Mid-tier (50K–500K)" },
  { value: "Macro", label: "Macro (500K–1M)" },
  { value: "Mega", label: "Mega (>1M)" },
];

export const ORDER_STATUS_LABELS = [
  "Unfulfilled",
  "Fulfilled",
  "Delivered",
  "RTO",
  "Cancelled",
];

export const COLLAB_TYPE_LABELS = ["Barter", "Barter + Paid"];

/**
 * Journey filter bar — URL-driven campaign filter + client-side filters.
 * Renders all 7 filters. Campaign filter pushes to URL via router.
 * Other filters are managed as client-side state passed via callbacks.
 */
export function JourneyFiltersBar({
  initial,
  options,
  clientFilters,
  onClientFiltersChange,
  influencerOptions,
  teamMemberOptions,
}: {
  initial: JourneyFilters;
  options: JourneyFilterOptions;
  clientFilters: JourneyClientFilters;
  onClientFiltersChange: (updates: Partial<JourneyClientFilters>) => void;
  influencerOptions: string[];
  teamMemberOptions: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setCampaignParam = useCallback(
    (value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete("campaign");
      else next.set("campaign", value);
      startTransition(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    [params, router],
  );

  const hasUrlFilter = !!params.get("campaign");
  const hasClientFilter = Object.values(clientFilters).some(Boolean);
  const hasAny = hasUrlFilter || hasClientFilter;

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("campaign");
    startTransition(() =>
      router.replace(`?${next.toString()}` as never, { scroll: false }),
    );
    onClientFiltersChange({
      search: "",
      influencer: "",
      teamMember: "",
      tier: "",
      orderStatus: "",
      collabType: "",
    });
  };

  return (
    <div className="onboarding-filter-card" aria-busy={pending}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        {/* Search — spans 2 cols on all breakpoints */}
        <label className="onboarding-filter-field col-span-2">
          <span>Search</span>
          <input
            type="text"
            className="onboarding-filter-select"
            placeholder="Creator name, @username, post ID…"
            value={clientFilters.search}
            onChange={(e) =>
              onClientFiltersChange({ search: e.target.value })
            }
          />
        </label>

        {/* Campaign — URL-driven */}
        <label className="onboarding-filter-field">
          <span>Campaign</span>
          <SearchableSelect
            value={initial.campaign ?? ""}
            onChange={(v) => setCampaignParam(v || undefined)}
            options={[
              { value: "", label: "All Campaigns" },
              ...options.campaigns.map((c) => ({
                value: c.id,
                label: `${c.id}${c.name && c.name !== c.id ? ` · ${c.name}` : ""}`,
              })),
            ]}
            placeholder="All Campaigns"
            searchPlaceholder="Search campaigns…"
          />
        </label>

        {/* Influencer — client-side */}
        <label className="onboarding-filter-field">
          <span>Influencer</span>
          <SearchableSelect
            value={clientFilters.influencer}
            onChange={(v) => onClientFiltersChange({ influencer: v })}
            options={[
              { value: "", label: "All Influencers" },
              ...influencerOptions.map((u) => ({ value: u, label: u })),
            ]}
            placeholder="All Influencers"
            searchPlaceholder="Search influencers…"
          />
        </label>

        {/* Team Member — client-side */}
        <label className="onboarding-filter-field">
          <span>Team Member</span>
          <SearchableSelect
            value={clientFilters.teamMember}
            onChange={(v) => onClientFiltersChange({ teamMember: v })}
            options={[
              { value: "", label: "All Members" },
              ...teamMemberOptions.map((m) => ({ value: m, label: m })),
            ]}
            placeholder="All Members"
            searchPlaceholder="Search members…"
          />
        </label>

        {/* Tier — client-side */}
        <label className="onboarding-filter-field">
          <span>Tier</span>
          <SearchableSelect
            value={clientFilters.tier}
            onChange={(v) => onClientFiltersChange({ tier: v })}
            options={[
              { value: "", label: "All Tiers" },
              ...TIER_LABELS.map((t) => ({ value: t.value, label: t.label })),
            ]}
            placeholder="All Tiers"
            searchPlaceholder="Search tiers…"
          />
        </label>

        {/* Order Status — client-side */}
        <label className="onboarding-filter-field">
          <span>Order Status</span>
          <SearchableSelect
            value={clientFilters.orderStatus}
            onChange={(v) => onClientFiltersChange({ orderStatus: v })}
            options={[
              { value: "", label: "All Statuses" },
              ...ORDER_STATUS_LABELS.map((s) => ({ value: s, label: s })),
            ]}
            placeholder="All Statuses"
            searchPlaceholder="Search statuses…"
          />
        </label>

        {/* Collab Type — client-side */}
        <label className="onboarding-filter-field">
          <span>Collab Type</span>
          <SearchableSelect
            value={clientFilters.collabType}
            onChange={(v) => onClientFiltersChange({ collabType: v })}
            options={[
              { value: "", label: "All Types" },
              ...COLLAB_TYPE_LABELS.map((t) => ({ value: t, label: t })),
            ]}
            placeholder="All Types"
            searchPlaceholder="Search types…"
          />
        </label>
      </div>

      {hasAny && (
        <div className="flex items-center justify-end mt-3">
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5">
            <X className="h-3.5 w-3.5" aria-hidden /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}
