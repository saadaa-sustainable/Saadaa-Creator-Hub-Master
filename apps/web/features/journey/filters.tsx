"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <select
            value={initial.campaign ?? ""}
            onChange={(e) => setCampaignParam(e.target.value || undefined)}
            className="onboarding-filter-select"
          >
            <option value="">All Campaigns</option>
            {options.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
                {c.name && c.name !== c.id ? ` · ${c.name}` : ""}
              </option>
            ))}
          </select>
        </label>

        {/* Influencer — client-side */}
        <label className="onboarding-filter-field">
          <span>Influencer</span>
          <select
            value={clientFilters.influencer}
            onChange={(e) =>
              onClientFiltersChange({ influencer: e.target.value })
            }
            className="onboarding-filter-select"
          >
            <option value="">All Influencers</option>
            {influencerOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>

        {/* Team Member — client-side */}
        <label className="onboarding-filter-field">
          <span>Team Member</span>
          <select
            value={clientFilters.teamMember}
            onChange={(e) =>
              onClientFiltersChange({ teamMember: e.target.value })
            }
            className="onboarding-filter-select"
          >
            <option value="">All Members</option>
            {teamMemberOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        {/* Tier — client-side */}
        <label className="onboarding-filter-field">
          <span>Tier</span>
          <select
            value={clientFilters.tier}
            onChange={(e) =>
              onClientFiltersChange({ tier: e.target.value })
            }
            className="onboarding-filter-select"
          >
            <option value="">All Tiers</option>
            {TIER_LABELS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/* Order Status — client-side */}
        <label className="onboarding-filter-field">
          <span>Order Status</span>
          <select
            value={clientFilters.orderStatus}
            onChange={(e) =>
              onClientFiltersChange({ orderStatus: e.target.value })
            }
            className="onboarding-filter-select"
          >
            <option value="">All Statuses</option>
            {ORDER_STATUS_LABELS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {/* Collab Type — client-side */}
        <label className="onboarding-filter-field">
          <span>Collab Type</span>
          <select
            value={clientFilters.collabType}
            onChange={(e) =>
              onClientFiltersChange({ collabType: e.target.value })
            }
            className="onboarding-filter-select"
          >
            <option value="">All Types</option>
            {COLLAB_TYPE_LABELS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
