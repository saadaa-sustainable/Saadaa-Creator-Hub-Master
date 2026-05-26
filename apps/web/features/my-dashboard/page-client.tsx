"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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
          <label className="onboarding-filter-field">
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
            <select
              value={filters.campaign}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  campaign: event.target.value,
                }))
              }
              className="onboarding-filter-select"
            >
              <option value="">All campaigns</option>
              {filterOptions.campaigns.map((campaign) => (
                <option key={campaign} value={campaign}>
                  {campaign}
                </option>
              ))}
            </select>
          </label>
          <label className="onboarding-filter-field">
            <span>Stage</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
              className="onboarding-filter-select"
            >
              <option value="">All stages</option>
              {filterOptions.statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="onboarding-filter-field">
            <span>Tier</span>
            <select
              value={filters.tier}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, tier: event.target.value }))
              }
              className="onboarding-filter-select"
            >
              <option value="">All tiers</option>
              {filterOptions.tiers.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
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
