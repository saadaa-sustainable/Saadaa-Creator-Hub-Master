import type {
  CreatorsRow,
  PostsRow,
  CampaignsRow,
} from "@/lib/supabase/types.gen";

export interface OnboardingRow {
  post_id: PostsRow["post_id"];
  post_id_short: PostsRow["post_id_short"];
  workflow_status: PostsRow["workflow_status"];
  content_type?: PostsRow["content_type"];
  nomenclature?: PostsRow["nomenclature"];
  reach_out_date: PostsRow["reach_out_date"];
  reachout_direction?: string | null;
  onboard_date: PostsRow["onboard_date"];
  posting_dispatch_date: PostsRow["posting_dispatch_date"];
  reels: PostsRow["reels"];
  static_posts: PostsRow["static_posts"];
  stories: PostsRow["stories"];
  ads_usage_rights: PostsRow["ads_usage_rights"];
  commercial_amount: PostsRow["commercial_amount"];
  barter_amount?: number | string | null;
  collab_type?: string | null;
  order_id?: string | null;
  order_status?: string | null;
  tracking_id?: PostsRow["tracking_id"];
  garment_qty?: PostsRow["garment_qty"];
  garments_sent?: string | null;
  payment_status?: PostsRow["payment_status"];
  email?: string | null;
  est_delivery?: string | null;
  collab_email_sent_at?: string | null;
  collab_email_skipped?: boolean | null;
  deliverable_index?: number | null;
  deliverable_type?: PostsRow["deliverable_type"];
  collab_number?: number | null;
  inf_id?: string | null;
  campaign: Pick<CampaignsRow, "campaign_id" | "campaign_name"> | null;
  creator: Pick<
    CreatorsRow,
    | "inf_id"
    | "username"
    | "inf_name"
    | "followers"
    | "category"
    | "state"
    | "profile_pic"
  > | null;
}

export interface OnboardingFilters {
  campaign?: string;
  statusFilter?: string;
  creatorTier?: string;
  region?: string;
  reachoutDateFrom?: string;
  reachoutDateTo?: string;
  /**
   * Submission state of the onboarding form. Absent ⇒ "no" (default view =
   * the not-yet-onboarded work queue). "yes" ⇒ rows whose onboarding form is
   * already filled. Maps to `workflow_status` sets — see queries.ts.
   */
  submitted?: "yes" | "no";
  view?: "list" | "cards";
}
