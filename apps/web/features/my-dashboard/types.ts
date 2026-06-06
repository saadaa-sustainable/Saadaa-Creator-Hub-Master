/**
 * Types for the My Dashboard personal workload view.
 * Data is always scoped to posts where onboarded_by = current user email.
 */

export interface MyPost {
  post_id: string | null;
  post_id_short?: string | null;
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
  post_link?: string | null;
  download_link?: string | null;
  raw_dump?: string | null;
  inf_id?: string | null;
  collab_number?: number | null;
  deliverable_index?: number | null;
  ads_usage_rights?: string | null;
  commercial_amount?: number | null;
  collab_type?: string | null;
  reels?: number | null;
  static_posts?: number | null;
  stories?: number | null;
  payment_status?: string | null;
  partnership_id?: string | null;
  creator?: {
    inf_name: string | null;
    profile_pic: string | null;
    category: string | null;
    followers: number | null;
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
  post_id: string | null;
  inf_name: string | null;
  username: string | null;
  campaign_id: string | null;
  workflow_status: string | null;
  est_delivery: string | null;
  post_date: string | null;
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
