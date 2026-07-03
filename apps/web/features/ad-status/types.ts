import type { WarehouseAd } from "@/lib/supabase/meta-ads";

export type { WarehouseAd };

export interface AdStatusRow {
  postId: string;
  postIdShort: string;
  infId: string | null;
  /** Stamped collab_id, or fallback inf_id||'-C'||collab_number for legacy rows. */
  collabId: string | null;
  name: string;
  username: string;
  profilePicUrl: string | null;
  campaign: string;
  category: string | null;
  followers: number | null;
  workflowStatus: string;
  postDate: string | null;
  /** Days elapsed since post_date — used for urgency indicator in Untested section. */
  daysSince: number | null;
  linkToPost: string;
  downloadLink: string;
  adsUsageRights: string;
  /** Classification from warehouse sync: Winner / ITE / Discarded / Discarded but analyse / "" */
  adsResults: string;
  /** Raw Meta Ads platform status: active / paused / deleted / "" */
  adsStatus: string;
  isClassified: boolean;
  isInMetaAds: boolean;
  partnershipId: string;
  collabType: string;
  /** live = posts table; historic = historic_posts archive (always Ad Run). */
  source: "live" | "historic";
  /** True when the ad name carries a PRE-DEDUP (renumbered-away) SIF — the
   *  row is attached at CREATOR level via the raw-archive alias; there is no
   *  specific post behind it. */
  retiredId?: boolean;
  /** Warehouse ads whose ad_name carries this post's SIF token, in
   *  first-occurrence order (earliest ad_created first, null last). */
  ads: WarehouseAd[];
  /** FIRST-occurrence ad (earliest ad_created) — the creative shown inline. */
  primaryAd: WarehouseAd | null;
  /** The first-occurrence ad's warehouse category — drives the row status chip. */
  warehouseCategory: string | null;
}

/** Per-warehouse-category row counts (first-occurrence ad's category per matched post). */
export interface AdStatusCategoryCounts {
  incrementalWinners: number;
  winners: number;
  p0: number;
  p1: number;
  p2: number;
  discarded: number;
}

export interface AdStatusKpi {
  totalEligible: number;
  classified: number;
  inMetaAds: number;
  pendingClassification: number;
  winners: number;
  discarded: number;
  /** Counts by warehouse category across all matched rows (live + historic). */
  categories: AdStatusCategoryCounts;
}

export interface AdStatusFilters {
  campaign?: string;
  /** Legacy result (Winner | ITE | Discarded | Discarded but analyse), a
   * warehouse category (Incremental Winner | P0 analysis | …), or __untested */
  classification?: string;
  /** Substring match on adsStatus — e.g. "run" matches "running" */
  adStatus?: string;
  search?: string;
}

export interface AdStatusFilterOptions {
  campaigns: { id: string; name: string }[];
}
