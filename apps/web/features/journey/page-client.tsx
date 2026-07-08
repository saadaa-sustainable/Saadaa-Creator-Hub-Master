"use client";

import { useMemo, useState } from "react";
import type {
  JourneyCard,
  JourneyClientFilters,
  JourneyFilterOptions,
  JourneyFilters,
} from "./types";
import { EMPTY_CLIENT_FILTERS } from "./types";
import { computeJourney } from "./compute";
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
    // A team member "owns" a row via either column: reach-out rows carry
    // logged_by (onboarded_by is null until onboarding), onboarded rows carry
    // onboarded_by. List both so the filter covers every stage.
    if (c.onboarded_by) teamMembers.add(c.onboarded_by);
    if (c.logged_by) teamMembers.add(c.logged_by);
  }

  return {
    influencers: Array.from(influencers).sort(),
    teamMembers: Array.from(teamMembers).sort(),
  };
}

/** Filter the flat card list by the client-side filter state. */
function applyClientFilters(
  cards: JourneyCard[],
  filters: JourneyClientFilters,
): JourneyCard[] {
  const { search, influencer, teamMember, tier, orderStatus, collabType } =
    filters;
  const hasAny =
    search || influencer || teamMember || tier || orderStatus || collabType;

  if (!hasAny) return cards;

  const searchLower = search.toLowerCase().trim();

  return cards.filter((card) => {
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

    // Team member: match either column (reach-out owner = logged_by,
    // onboard owner = onboarded_by) so a person's whole pipeline shows.
    if (
      teamMember &&
      card.onboarded_by !== teamMember &&
      card.logged_by !== teamMember
    )
      return false;

    // Tier: match by creator.category
    if (tier && card.creator?.category !== tier) return false;

    // Order status: match by order_status (case-insensitive)
    if (
      orderStatus &&
      (card.order_status ?? "").toLowerCase() !== orderStatus.toLowerCase()
    ) {
      return false;
    }

    // Collab type: match by content_type
    if (collabType && card.content_type !== collabType) return false;

    return true;
  });
}

export function JourneyPageClient({
  cards,
  initialFilters,
  filterOptions,
}: {
  cards: JourneyCard[];
  initialFilters: JourneyFilters;
  filterOptions: JourneyFilterOptions;
}) {
  const [clientFilters, setClientFilters] =
    useState<JourneyClientFilters>(EMPTY_CLIENT_FILTERS);

  const { influencers, teamMembers } = useMemo(
    () => deriveOptions(cards),
    [cards],
  );

  // Filter the flat set, then re-derive columns + KPI + funnel from it so the
  // KPI strip, funnel strip and board always reflect the SAME filtered data.
  const filteredCards = useMemo(
    () => applyClientFilters(cards, clientFilters),
    [cards, clientFilters],
  );
  const { columns, kpi, funnel } = useMemo(
    () => computeJourney(filteredCards),
    [filteredCards],
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
      <JourneyBoard columns={columns} />
    </>
  );
}
