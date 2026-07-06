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

import type { WarehouseAd } from "@/lib/supabase/meta-ads";

/**
 * One post-level Meta Ads rollup for a creator — drawn from the
 * `meta_ads_cache` warehouse mirror. Same counting unit as the Ad Status
 * board: one entry per post token, wearing its first-occurrence ad's
 * category/status/spend (board rule), with every ad variant carried along
 * for the modal's per-ad cards.
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
  /** Every ad variant on this token, first-occurrence order (earliest first). */
  ads: WarehouseAd[];
  /** Instagram post URL (posts.post_link → archive link_to_post fallback). */
  postLink: string | null;
}

/**
 * Creator-level Meta Ads rollup from the `creator_ads_rollup` RPC — one row
 * per creator with ≥1 warehouse-matched ad. Token→creator resolution and the
 * first-occurrence rule live in the RPC (board semantics).
 */
export interface CreatorAdsSummary {
  /** Distinct post tokens that ran as ads. */
  tokens: number;
  /** Total ad variants across those tokens. */
  ads: number;
  /** Tokens whose first-occurrence ad is Winner / Incremental Winner. */
  winners: number;
  /** Best first-occurrence category across tokens (rank order). */
  bestCategory: string | null;
  /** Total spend across ALL ad variants (₹). */
  spend: number;
  /** Creator's live collab count (0 = not currently working with us). */
  liveCollabs: number;
  /** Distinct first-occurrence categories across the creator's tokens. */
  categories: string[];
  /** Every warehouse ad id on the creator's tokens. */
  adIds: string[];
  /** Every warehouse ad name on the creator's tokens. */
  adNames: string[];
}

/** Counts for the clickable ads KPI tiles above the roster. */
export interface CreatorAdsKpi {
  inAds: number;
  winners: number;
  winnersIdle: number;
  spend: number;
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
  /** Meta Ads rollup for this creator — null when they never ran as an ad. */
  adsSummary: CreatorAdsSummary | null;
  /** When the creator accepted the Meta partnership (creators mirror). */
  partnership_accepted_at: string | null;
  /** When the creator declined/revoked the Meta partnership. */
  partnership_declined_at: string | null;
}

export interface CreatorAnalyticsFilters {
  /** Free-text search across inf_id / name / username. */
  q?: string;
  /** Ads-derived filter: in-ads | winners | winners-idle. */
  ads?: string;
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
