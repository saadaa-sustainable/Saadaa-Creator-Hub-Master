/**
 * Types for the My Dashboard personal workload view.
 * Data is scoped to posts the member OWNS at any stage: reach-outs they
 * logged (logged_by), collabs they onboarded (onboarded_by), and postings
 * they submitted (posted_by) — same ownership rule as the Journey team filter.
 */

export interface MyPost {
  id: number;
  post_id: string | null;
  post_id_short?: string | null;
  collab_id?: string | null;
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
  onboarded_by: string | null;
  /** Reach-out owner — reach-out rows carry ONLY logged_by (onboarded_by is
   *  null until onboarding). */
  logged_by?: string | null;
  /** Posting-form submitter (older posted rows: null → onboarder). */
  posted_by?: string | null;
  post_link?: string | null;
  download_link?: string | null;
  raw_dump?: string | null;
  inf_id?: string | null;
  collab_number?: number | null;
  deliverable_index?: number | null;
  deliverable_type?: string | null;
  content_type?: string | null;
  tracking_id?: string | null;
  /** Bank presence — drives the posting-form mandatory-bank gate for
   *  Barter + Paid collabs that skipped bank at onboarding (collab-level). */
  bank_number?: string | null;
  ifsc?: string | null;
  ads_usage_rights?: string | null;
  commercial_amount?: number | null;
  collab_type?: string | null;
  reels?: number | null;
  static_posts?: number | null;
  stories?: number | null;
  payment_status?: string | null;
  partnership_id?: string | null;
  is_test?: boolean | null;
  creator?: {
    inf_id?: string | null;
    inf_name: string | null;
    profile_pic: string | null;
    category: string | null;
    followers: number | null;
    gender?: string | null;
    state?: string | null;
    language?: string | null;
    instagram_link?: string | null;
    er?: number | null;
    avg_likes?: number | null;
    creator_type?: string | null;
    agency_name?: string | null;
  } | null;
}

export interface MyDashboardKpi {
  /** workflow_status IN ('Reach Out', 'On Board', 'Order Sent') */
  myActive: number;
  /** workflow_status IN ('On Board', 'Order Sent') */
  pendingPost: number;
  /** workflow_status IN ('Posted', 'Delivered') */
  posted: number;
  /** workflow_status IN ('RTO', 'Cancelled', 'RTO - Reverse Picked', 'RTO - Delivered') */
  rtos: number;
  /** Distinct campaign_id across my posts. */
  totalCampaigns: number;
  /** Distinct campaign_id among my active posts (Reach Out / On Board / Order Sent). */
  activeCampaigns: number;
  /** My posts in Reach Out status. */
  totalReachouts: number;
}

export interface PendingAction {
  post: MyPost;
  /** "Overdue delivery" | "Awaiting post" */
  label: "Overdue delivery" | "Awaiting post";
  /** Days overdue (positive = overdue, 0 = today) */
  daysOverdue: number;
}

export interface MyDashboardFilterOptions {
  campaigns: string[];
  statuses: string[];
  tiers: string[];
}

export interface TeamLeaderboardEntry {
  name: string;
  active: number;
  posted: number;
  paid: number;
  score: number;
}
