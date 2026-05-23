import type {
  CreatorsRow,
  PostsRow,
  CampaignsRow,
} from "@/lib/supabase/types.gen";

export interface PostingRow {
  post_id: PostsRow["post_id"];
  post_id_short: PostsRow["post_id_short"];
  workflow_status: PostsRow["workflow_status"];
  content_type?: PostsRow["content_type"];
  nomenclature?: PostsRow["nomenclature"];
  onboard_date: PostsRow["onboard_date"];
  posting_dispatch_date?: PostsRow["posting_dispatch_date"];
  post_date?: string | null;
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
  post_link?: string | null;
  download_link?: string | null;
  raw_dump?: string | null;
  partnership_id?: string | null;
  deliverable_index?: number | null;
  deliverable_type?: PostsRow["deliverable_type"];
  collab_number?: number | null;
  inf_id?: string | null;
  est_delivery?: string | null;
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

export interface PostingFilters {
  campaign?: string;
  statusFilter?: string;
  creatorTier?: string;
  adsRights?: string;
  onboardDateFrom?: string;
  onboardDateTo?: string;
  view?: "list" | "cards";
}
