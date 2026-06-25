/**
 * Creator Analytics — a roster directory of every creator with their merged
 * live (`posts`) + historic (`historic_posts`) collaboration history. Lives as
 * the `?tab=creators` tab inside the main Dashboard.
 */

/** One collab in a creator's history — drawn from posts ∪ historic_posts. */
export interface CreatorCollab {
  /** Display collab id (collab_id, else inf_id-C{n}, else post id). */
  collabId: string;
  contentType: string | null;
  postDate: string | null;
  paymentStatus: string | null;
  /** Which corpus this collab came from. */
  source: "live" | "historic";
}

/** Per-collab-type tally, e.g. { Barter: 3, "Barter + Paid": 1 }. */
export type CollabTypeBreakdown = Record<string, number>;

export interface CreatorAnalyticsRow {
  inf_id: string;
  username: string;
  inf_name: string | null;
  followers: number | null;
  category: string | null;
  profile_pic: string | null;
  /** `historic_creator` | `new_creator` (creators.creator_type). */
  creator_type: string | null;
  /** Most-recent workflow_status across the creator's live posts. */
  current_stage: string | null;
  live_collab_count: number;
  historic_collab_count: number;
  total_collab_count: number;
  /** Sum of reels + static_posts + stories across live posts. */
  deliverable_count: number;
  last_onboard_date: string | null;
  last_post_date: string | null;
  collab_type_breakdown: CollabTypeBreakdown;
  reach_out_from: string | null;
  reach_out_to: string | null;
  /** Full merged collab history, newest first — feeds the per-creator modal. */
  collabs: CreatorCollab[];
  /** Region (creators.state) — also used by the region filter. */
  state: string | null;
  instagram_link: string | null;
}

export interface CreatorAnalyticsFilters {
  /** Free-text search across inf_id / name / username. */
  q?: string;
  /** Tier = creators.category. */
  tier?: string;
  /** Region = creators.state. */
  region?: string;
  /** historic_creator | new_creator. */
  creatorType?: string;
  /** Current workflow stage of the creator's most-recent live post. */
  stage?: string;
  reachOutFrom?: string;
  reachOutTo?: string;
  postedFrom?: string;
  postedTo?: string;
  view?: "list" | "cards";
}

export interface CreatorAnalyticsFilterOptions {
  tiers: string[];
  regions: string[];
  statuses: string[];
  creatorTypes: string[];
}
