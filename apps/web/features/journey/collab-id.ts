import type { JourneyCard } from "./types";

/**
 * Display-only Collab ID for a journey card. Prefers the stamped collab_id
 * (e.g. SIF-1-C1). Falls back to inf_id||'-C'||collab_number for legacy rows
 * that predate the collab_id column. Returns null when nothing is derivable.
 */
export function journeyCollabId(card: JourneyCard): string | null {
  if (card.collab_id) return card.collab_id;
  if (card.inf_id && card.collab_number != null) {
    return `${card.inf_id}-C${card.collab_number}`;
  }
  return null;
}
