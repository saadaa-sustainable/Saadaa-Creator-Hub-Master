/**
 * Journey feature types — Influencer pipeline kanban.
 * Read-only view: all posts grouped by workflow_status across 4 stages.
 */

export interface JourneyPost {
  post_id: string;
  username: string | null;
  campaign_id: string | null;
  workflow_status: string | null;
  reach_out_date: string | null;
  onboard_date: string | null;
  post_date: string | null;
  est_delivery: string | null;
  order_id: string | null;
  order_status: string | null;
  inf_name: string | null;
  payment_status: string | null;
  deliverable_index: number | null;
  content_type: string | null;
  ads_usage_rights: string | null;
  collab_number: number | null;
  collab_id: string | null;
  inf_id: string | null;
  onboarded_by: string | null;
}

export interface JourneyCreator {
  inf_name: string | null;
  profile_pic: string | null;
  category: string | null;
  followers: number | null;
  state: string | null;
}

/** Enriched post row — base post + creator lookup merged in. */
export interface JourneyCard extends JourneyPost {
  creator: JourneyCreator | null;
}

export type JourneyColumnId =
  | "reach-out"
  | "on-board"
  | "posted"
  | "payment";

export interface JourneyColumn {
  id: JourneyColumnId;
  title: string;
  accent: string;
  statuses: string[];
  cards: JourneyCard[];
}

export interface JourneyKpi {
  inPipeline: number;
  active: number;
  posted: number;
  closed: number;
}

/**
 * Funnel conversion metrics across the pipeline stages. Stage counts are
 * cumulative collab counts (parent rows only): each collab is counted at every
 * stage it has reached or passed, so conversion rates are monotonic.
 *
 *   reachToOnboard = Onboarded ÷ Reached × 100
 *   onboardToPost  = Posted    ÷ Onboarded × 100
 *   postToPayment  = Paid      ÷ Posted × 100
 */
export interface JourneyFunnel {
  reached: number;
  onboarded: number;
  posted: number;
  paid: number;
  reachToOnboard: number;
  onboardToPost: number;
  postToPayment: number;
}

export interface JourneyFilters {
  campaign?: string;
}

export interface JourneyFilterOptions {
  campaigns: { id: string; name: string }[];
}

/** Client-side filter state (not persisted to URL). */
export interface JourneyClientFilters {
  search: string;
  influencer: string;
  teamMember: string;
  tier: string;
  orderStatus: string;
  collabType: string;
}

export const EMPTY_CLIENT_FILTERS: JourneyClientFilters = {
  search: "",
  influencer: "",
  teamMember: "",
  tier: "",
  orderStatus: "",
  collabType: "",
};
