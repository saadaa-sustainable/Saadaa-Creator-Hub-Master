"use client";

import { useMemo, useState } from "react";
import type {
  JourneyCard,
  JourneyClientFilters,
  JourneyColumn,
  JourneyFilterOptions,
  JourneyFilters,
  JourneyFunnel,
  JourneyKpi,
} from "./types";
import { EMPTY_CLIENT_FILTERS } from "./types";
import { JourneyKpiStrip } from "./kpi-strip";
import { JourneyFunnelStrip } from "./funnel-strip";
import { JourneyBoard } from "./journey-board";
import { JourneyFiltersBar } from "./filters";

/** Derive unique sorted options from the fetched cards. */
function deriveOptions(cards: JourneyCard[]): {
  influencers: string[];
  teamMembers: string[];
} {
  const influencers = new Set<string>();
  const teamMembers = new Set<string>();

  for (const c of cards) {
    if (c.username) influencers.add(c.username);
    if (c.onboarded_by) teamMembers.add(c.onboarded_by);
  }

  return {
    influencers: Array.from(influencers).sort(),
    teamMembers: Array.from(teamMembers).sort(),
  };
}

/** Apply client-side filters to the columns, preserving column structure. */
function applyClientFilters(
  columns: JourneyColumn[],
  filters: JourneyClientFilters,
): JourneyColumn[] {
  const { search, influencer, teamMember, tier, orderStatus, collabType } =
    filters;
  const hasAny =
    search || influencer || teamMember || tier || orderStatus || collabType;

  if (!hasAny) return columns;

  const searchLower = search.toLowerCase().trim();

  return columns.map((col) => ({
    ...col,
    cards: col.cards.filter((card) => {
      // Search: name, username, post_id
      if (searchLower) {
        const nameMatch = (card.inf_name ?? "")
          .toLowerCase()
          .includes(searchLower);
        const handleMatch = (card.username ?? "")
          .toLowerCase()
          .includes(searchLower);
        const postMatch = (card.post_id ?? "").toLowerCase().includes(searchLower);
        if (!nameMatch && !handleMatch && !postMatch) return false;
      }

      // Influencer: match by username
      if (influencer && card.username !== influencer) return false;

      // Team member: match by onboarded_by
      if (teamMember && card.onboarded_by !== teamMember) return false;

      // Tier: match by creator.category
      if (tier && card.creator?.category !== tier) return false;

      // Order status: match by order_status (case-insensitive)
      if (
        orderStatus &&
        (card.order_status ?? "").toLowerCase() !==
          orderStatus.toLowerCase()
      ) {
        return false;
      }

      // Collab type: match by content_type
      if (collabType && card.content_type !== collabType) return false;

      return true;
    }),
  }));
}

export function JourneyPageClient({
  columns,
  kpi,
  funnel,
  initialFilters,
  filterOptions,
}: {
  columns: JourneyColumn[];
  kpi: JourneyKpi;
  funnel: JourneyFunnel;
  initialFilters: JourneyFilters;
  filterOptions: JourneyFilterOptions;
}) {
  const [clientFilters, setClientFilters] =
    useState<JourneyClientFilters>(EMPTY_CLIENT_FILTERS);

  // Flatten all cards across all columns for deriving select options.
  const allCards: JourneyCard[] = useMemo(
    () => columns.flatMap((c) => c.cards),
    [columns],
  );

  const { influencers, teamMembers } = useMemo(
    () => deriveOptions(allCards),
    [allCards],
  );

  const filteredColumns = useMemo(
    () => applyClientFilters(columns, clientFilters),
    [columns, clientFilters],
  );

  const handleClientFilterChange = (updates: Partial<JourneyClientFilters>) => {
    setClientFilters((prev) => ({ ...prev, ...updates }));
  };

  return (
    <>
      <JourneyFiltersBar
        initial={initialFilters}
        options={filterOptions}
        clientFilters={clientFilters}
        onClientFiltersChange={handleClientFilterChange}
        influencerOptions={influencers}
        teamMemberOptions={teamMembers}
      />
      <JourneyKpiStrip kpi={kpi} />
      <JourneyFunnelStrip funnel={funnel} />
      <JourneyBoard columns={filteredColumns} />
    </>
  );
}
