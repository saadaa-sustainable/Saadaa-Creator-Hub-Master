"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type {
  MyDashboardFilterOptions,
  MyDashboardKpi,
  MyPost,
  PendingAction,
  TeamLeaderboardEntry,
} from "./types";
import { MyDashboardKpiStrip } from "./kpi-strip";
import { PendingActionsSection } from "./pending-actions";
import { MyDashboardWorkloadBoard } from "./workload-board";

/** Inclusive date-range test on an ISO date string (compares the YYYY-MM-DD
 *  prefix). Empty from/to means unbounded on that side. */
function inRange(d: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!d) return false;
  const day = d.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="onboarding-filter-field">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="onboarding-filter-select"
      />
    </label>
  );
}

export interface MyDashboardBodyProps {
  kpi: MyDashboardKpi;
  pendingActions: PendingAction[];
  posts: MyPost[];
  filterOptions: MyDashboardFilterOptions;
  leaderboard: TeamLeaderboardEntry[];
}

/**
 * Client shell for My Dashboard.
 * Receives pre-computed data from the RSC page — no client-side fetching.
 */
export function MyDashboardBody({
  kpi,
  pendingActions,
  posts,
  filterOptions,
  leaderboard,
}: MyDashboardBodyProps) {
  const [filters, setFilters] = useState({
    q: "",
    campaign: "",
    status: "",
    tier: "",
    reachFrom: "",
    reachTo: "",
    onboardFrom: "",
    onboardTo: "",
    postFrom: "",
    postTo: "",
  });

  const filteredPosts = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return posts.filter((post) => {
      if (q) {
        const hay =
          `${post.inf_name ?? ""} ${post.username ?? ""} ${post.post_id ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.campaign && post.campaign_id !== filters.campaign) {
        return false;
      }
      if (filters.status && post.workflow_status !== filters.status) {
        return false;
      }
      if (filters.tier && post.creator?.category !== filters.tier) {
        return false;
      }
      if (!inRange(post.reach_out_date, filters.reachFrom, filters.reachTo)) {
        return false;
      }
      if (!inRange(post.onboard_date, filters.onboardFrom, filters.onboardTo)) {
        return false;
      }
      if (!inRange(post.post_date, filters.postFrom, filters.postTo)) {
        return false;
      }
      return true;
    });
  }, [filters, posts]);

  const clearFilters = () =>
    setFilters({
      q: "",
      campaign: "",
      status: "",
      tier: "",
      reachFrom: "",
      reachTo: "",
      onboardFrom: "",
      onboardTo: "",
      postFrom: "",
      postTo: "",
    });

  return (
    <>
      {/* Bento composition: `contents` keeps each section a direct grid item
          of `.onboarding-stage` (gap preserved) while `.bento-stagger` gives
          the sections a one-shot staggered rise. This wrapper never remounts
          on filter changes, so the entrance never replays. The workload board
          stays outside — its conditional modals must not inherit stagger
          delays. */}
      <div className="contents bento-stagger">
        <section className="onboarding-filter-card">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-end">
            <label className="onboarding-filter-field acc-filter-search">
              <span>Search my posts</span>
              <div className="relative flex items-center">
                <Search
                  size={13}
                  aria-hidden
                  className="absolute left-2.5 text-text-tertiary pointer-events-none"
                />
                <input
                  value={filters.q}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, q: event.target.value }))
                  }
                  className="onboarding-filter-select pl-7"
                  placeholder="Creator, @username, post ID..."
                />
              </div>
            </label>
            <label className="onboarding-filter-field">
              <span>Campaign</span>
              <SearchableSelect
                value={filters.campaign}
                onChange={(v) =>
                  setFilters((prev) => ({ ...prev, campaign: v }))
                }
                options={[
                  { value: "", label: "All campaigns" },
                  ...filterOptions.campaigns.map((campaign) => ({
                    value: campaign,
                    label: campaign,
                  })),
                ]}
                placeholder="All campaigns"
                searchPlaceholder="Search campaigns…"
              />
            </label>
            <label className="onboarding-filter-field">
              <span>Stage</span>
              <SearchableSelect
                value={filters.status}
                onChange={(v) => setFilters((prev) => ({ ...prev, status: v }))}
                options={[
                  { value: "", label: "All stages" },
                  ...filterOptions.statuses.map((status) => ({
                    value: status,
                    label: status,
                  })),
                ]}
                placeholder="All stages"
                searchPlaceholder="Search stages…"
              />
            </label>
            <label className="onboarding-filter-field">
              <span>Tier</span>
              <SearchableSelect
                value={filters.tier}
                onChange={(v) => setFilters((prev) => ({ ...prev, tier: v }))}
                options={[
                  { value: "", label: "All tiers" },
                  ...filterOptions.tiers.map((tier) => ({
                    value: tier,
                    label: tier,
                  })),
                ]}
                placeholder="All tiers"
                searchPlaceholder="Search tiers…"
              />
            </label>
            <FilterDate
              label="Reached From"
              value={filters.reachFrom}
              onChange={(v) => setFilters((prev) => ({ ...prev, reachFrom: v }))}
            />
            <FilterDate
              label="Reached To"
              value={filters.reachTo}
              onChange={(v) => setFilters((prev) => ({ ...prev, reachTo: v }))}
            />
            <FilterDate
              label="Onboarded From"
              value={filters.onboardFrom}
              onChange={(v) => setFilters((prev) => ({ ...prev, onboardFrom: v }))}
            />
            <FilterDate
              label="Onboarded To"
              value={filters.onboardTo}
              onChange={(v) => setFilters((prev) => ({ ...prev, onboardTo: v }))}
            />
            <FilterDate
              label="Posted From"
              value={filters.postFrom}
              onChange={(v) => setFilters((prev) => ({ ...prev, postFrom: v }))}
            />
            <FilterDate
              label="Posted To"
              value={filters.postTo}
              onChange={(v) => setFilters((prev) => ({ ...prev, postTo: v }))}
            />
          </div>
          {Object.values(filters).some(Boolean) && (
            <div className="flex justify-end mt-3">
              <button
                type="button"
                className="btn btn-ghost h-8 px-3 text-xs"
                onClick={clearFilters}
              >
                <X size={13} aria-hidden />
                Clear
              </button>
            </div>
          )}
        </section>
        <MyDashboardKpiStrip kpi={kpi} />
        <PendingActionsSection actions={pendingActions} />
      </div>
      <MyDashboardWorkloadBoard
        posts={filteredPosts}
        leaderboard={leaderboard}
      />
    </>
  );
}
