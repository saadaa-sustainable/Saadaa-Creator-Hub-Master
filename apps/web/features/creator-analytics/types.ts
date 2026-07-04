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
  /** Instagram post URL for this collab, when one was captured. */
  postLink: string | null;
  /** Which corpus this collab came from. */
  source: "live" | "historic";
}

/**
 * One post-level Meta Ads rollup for a creator — drawn from the
 * `meta_ads_cache` warehouse mirror. Same counting unit as the Ad Status
 * board: one entry per post token, wearing its first-occurrence ad's
 * category/status/spend (board rule), with the variant count alongside.
 */
export interface CreatorAdInfo {
  /** Post token the ad names carry, e.g. "SIF-1905-P2". */
  token: string;
  /** Warehouse category of the first-occurrence ad. */
  category: string | null;
  /** Meta delivery status of the first-occurrence ad. */
  adStatus: string | null;
  /** Spend of the first-occurrence ad (₹). */
  amountSpent: number;
  /** Moving-average ROAS of the first-occurrence ad. */
  roasMa: number;
  /** ISO date the first-occurrence ad was created on Meta. */
  adCreated: string | null;
  /** Total ads (variants) that ran on this post. */
  adCount: number;
  /** Token carries a retired (pre-renumbering) SIF from the legacy archive. */
  retiredId: boolean;
}

export interface CreatorAnalyticsRow {
  inf_id: string;
  username: string;
  inf_name: string | null;
  followers: number | null;
  category: string | null;
  profile_pic: string | null;
  /** `historic_creator` | `new_creator` (creators.creator_type). */
  creator_type: string | null;
  /** Most-recent workflow_status across the creator's live ∪ historic posts. */
  current_stage: string | null;
  live_collab_count: number;
  historic_collab_count: number;
  total_collab_count: number;
  /** Sum of reels + static_posts + stories across live posts. */
  deliverable_count: number;
  last_onboard_date: string | null;
  last_post_date: string | null;
  /**
   * Pre-formatted per-collab-type tally text from the RPC, e.g.
   * "Barter: 2 · Barter + Paid: 1". Null when the creator has no typed collab.
   */
  collab_types: string | null;
  reach_out_from: string | null;
  reach_out_to: string | null;
  /** Region (creators.state) — also used by the region filter. */
  state: string | null;
  instagram_link: string | null;
  /** false = deactivated creator (dead/mangled IG handle, no profile_id). */
  is_active: boolean | null;
  /**
   * Meta branded-content permission state (posts.partnership_status —
   * pending | approved | rejected | revoked | none). Stamped creator-level,
   * so any of the creator's posts rows carries the same value. Null when the
   * creator has no stored state (or the lookup failed — fail-soft).
   */
  partnership_status: string | null;
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
