import type {
  CreatorsRow,
  PostsRow,
  CampaignsRow,
} from "@/lib/supabase/types.gen";

export interface OnboardingRow {
  /** Bigserial primary key — identifies reach-out rows whose post_id is still NULL. */
  id: number;
  post_id: PostsRow["post_id"];
  post_id_short: PostsRow["post_id_short"];
  workflow_status: PostsRow["workflow_status"];
  /** Who logged the reach-out / who onboarded — row + overview attribution. */
  logged_by?: string | null;
  onboarded_by?: string | null;
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
  collab_id?: string | null;
  inf_id?: string | null;
  campaign: Pick<CampaignsRow, "campaign_id" | "campaign_name"> | null;
  creator: Pick<
    CreatorsRow,
    | "inf_id"
    | "username"
    | "inf_name"
    | "followers"
    | "category"
    | "gender"
    | "verification"
    | "language"
    | "er"
    | "avg_likes"
    | "state"
    | "profile_pic"
    | "instagram_link"
    | "is_active"
  > | null;
  /**
   * Presentation-only: total deliverables across the whole collab
   * (parent + children), pre-computed when the board collapses children into
   * the parent. Not persisted. Absent on raw query rows.
   */
  _collabDeliverableCount?: number;
  /** Presentation-only: collab-level "NR + NP + NS" breakdown. Not persisted. */
  _collabDeliverableBreakdown?: string;
  /** Presentation-only: agreed commercial total summed across collab siblings. */
  _collabCommercialTotal?: number;
  /**
   * Presentation-only: prior-collab history for a Reach Out row, stamped
   * server-side from `prior_collab_summary`. Lets the board show how many times
   * this creator collaborated before + what the next collab (C) will mint.
   * Not persisted; absent on raw query rows and on non-reach-out rows.
   */
  _priorCollabCount?: number;
  /** Presentation-only: full prior collab ids, e.g. ["SIF-1-C1","SIF-1-C2"]. */
  _priorCollabIds?: string[];
  /** Presentation-only: the C number the next onboard will mint for this creator. */
  _nextCollab?: number;
  /**
   * Presentation-only: Shopify's INTERNAL order id (shopify_orders.
   * shopify_internal_id) for this row's order_id — powers the direct
   * "View Order" admin deep link. Absent → link falls back to admin search.
   */
  _shopifyInternalId?: number | string | null;
}

/**
 * Onboarding KPI strip aggregates — all counts are per-collab (parent rows
 * only). Rates are percentages already rounded to 1 dp.
 */
export interface OnboardingKpi {
  /** Collabs with onboarding form filled (On Board / Order Sent / Posted / Delivered). */
  totalOnboarded: number;
  /** Collabs still in Reach Out (onboarding pending). */
  pendingOnboardings: number;
  /** Onboarded ÷ (Onboarded + Pending) × 100. */
  completionRate: number;
  /** Onboarded collabs with ads_usage_rights = Yes. */
  adRightsSelected: number;
  /** Onboarded collabs without ad rights. */
  noAdRights: number;
  /** Onboarded collabs whose collab email is neither sent nor skipped. */
  pendingEmail: number;
  /** Mean reels per onboarded collab. */
  avgReels: number;
  /** Mean static posts per onboarded collab. */
  avgStatic: number;
  /** Mean stories per onboarded collab. */
  avgStories: number;
  /** Matched-to-shopify ÷ collabs-with-order_id × 100. */
  shopifyValidationRate: number;
  /** Count of onboarded collabs whose order_id matched a shopify_orders row. */
  shopifyMatched: number;
  /** Count of onboarded collabs that have an order_id entered. */
  shopifyWithOrderId: number;
  /** Funnel-parity Overdue: parent rows onboarded >15 days ago with no post yet. */
  overdue: number;
}

export interface OnboardingFilters {
  /** Free-text search across post/collab id, name, username, IG URL, email. */
  q?: string;
  /** "yes" → only rows past their promised delivery (est_delivery-anchored). */
  overdue?: string;
  campaign?: string;
  statusFilter?: string;
  creatorTier?: string;
  region?: string;
  /** Team member who logged the reach-out (posts.logged_by). */
  reachedOutBy?: string;
  /** Content type code (posts.content_type). */
  contentType?: string;
  /** Collab type (posts.collab_type): Barter / Barter + Paid. */
  collabType?: string;
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
