import type {
  CreatorsRow,
  PostsRow,
  CampaignsRow,
} from "@/lib/supabase/types.gen";

export interface PostingRow {
  post_id: PostsRow["post_id"];
  post_id_short: PostsRow["post_id_short"];
  workflow_status: PostsRow["workflow_status"];
  /** Who onboarded / who submitted the posting — row + overview attribution. */
  onboarded_by?: string | null;
  posted_by?: string | null;
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
  /** Bank presence — drives the mandatory-bank gate in the posting form when
   *  a Barter + Paid collab skipped bank details at onboarding. */
  bank_number?: string | null;
  ifsc?: string | null;
  order_id?: string | null;
  order_status?: string | null;
  tracking_id?: PostsRow["tracking_id"];
  post_link?: string | null;
  /** Durable re-hosted post cover (post-thumbs/{post_id}.jpg). */
  post_thumbnail?: string | null;
  /** Durable re-hosted reel video (post-media/{post_id}.mp4) — native playback. */
  post_media?: string | null;
  download_link?: string | null;
  raw_dump?: string | null;
  partnership_id?: string | null;
  /** Normalized branded-content permission state (posts.partnership_status). */
  partnership_status?: PostsRow["partnership_status"];
  deliverable_index?: number | null;
  deliverable_type?: PostsRow["deliverable_type"];
  collab_number?: number | null;
  collab_id?: string | null;
  inf_id?: string | null;
  est_delivery?: string | null;
  reach_out_date?: string | null;
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
    | "instagram_link"
    | "is_active"
  > | null;
}

/**
 * Posting KPI strip aggregates. Counts PER POST_ID — each posts row is one
 * deliverable, so every tile counts rows directly (no per-collab grouping, no
 * reels+static+stories summation).
 */
export interface PostingKpi {
  /** Post_ids yet to be submitted (workflow_status ∈ {On Board, Order Sent}). */
  totalPostsDue: number;
  /** Post_ids with workflow_status = Posted. */
  totalPostsSubmitted: number;
  /** Submitted ÷ (Submitted + Due) × 100 = Submitted ÷ total post_ids. */
  completionRate: number;
  /** Submitted post_ids whose post_date is after est_delivery. */
  delayedPosts: number;
  /** Funnel-parity Overdue: parent rows onboarded >15 days ago with no post yet. */
  overdue: number;
}

export interface PostingFilters {
  /** Free-text search across post/collab id, name, username, IG URL, post link. */
  q?: string;
  /** "yes" → only rows past their promised delivery (est_delivery-anchored). */
  overdue?: string;
  campaign?: string;
  statusFilter?: string;
  creatorTier?: string;
  adsRights?: string;
  /** Team member who onboarded the collab (posts.onboarded_by). */
  onboardedBy?: string;
  /** Content type code (posts.content_type). */
  contentType?: string;
  /** Collab type (posts.collab_type): Barter / Barter + Paid. */
  collabType?: string;
  onboardDateFrom?: string;
  onboardDateTo?: string;
  /**
   * Submission state of the posting form. Absent ⇒ "no" (default view = rows
   * not yet Posted, i.e. the posting work queue). "yes" ⇒ rows whose posting
   * form is filled (Posted). Maps to `workflow_status` sets — see queries.ts.
   */
  submitted?: "yes" | "no";
  view?: "list" | "cards";
}
