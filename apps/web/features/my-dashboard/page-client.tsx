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
      return true;
    });
  }, [filters, posts]);

  const clearFilters = () =>
    setFilters({ q: "", campaign: "", status: "", tier: "" });

  return (
    <>
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
              onChange={(v) => setFilters((prev) => ({ ...prev, campaign: v }))}
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
      <MyDashboardWorkloadBoard
        posts={filteredPosts}
        leaderboard={leaderboard}
      />
    </>
  );
}
