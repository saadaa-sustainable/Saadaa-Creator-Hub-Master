/**
 * Placeholder for Supabase generated types.
 *
 * Run:
 *   pnpm db:types
 *
 * That executes:
 *   supabase gen types typescript --project-id xynyvbagcudjrzklwnqp > lib/supabase/types.gen.ts
 *
 * Until then this file ships a hand-written subset matching
 * `CreatorHub-Supabase-Schema-Map.txt`.
 */

export type WorkflowStatus =
  | "Reach Out"
  | "On Board"
  | "Order Sent"
  | "Posted"
  | "Delivered"
  | "RTO"
  | "Cancelled"
  | "Cancelled After RTO"
  | "Offboarding"
  | "Awaiting Reply"
  | "Declined";

export type CollabType = "Barter" | "Barter + Paid";
export type ReachoutDirection = "inbound" | "outbound";
export type DeliverableType = "reel" | "post";
export type AdResult =
  | "Winner"
  | "ITE"
  | "Discarded"
  | "Discarded but analyse"
  | "Pending";
export type PaymentStatus = "Not Due" | "Due" | "Done";

export interface PostsRow {
  id: string;
  post_id: string;
  post_id_short: string | null;
  post_number: number | null;
  collab_number: number | null;
  deliverable_index: number | null;
  deliverable_type: DeliverableType | null;
  inf_id: string | null;
  campaign_id: string | null;
  workflow_status: WorkflowStatus;
  reach_out_date: string | null;
  reachout_type: string | null;
  reachout_direction: ReachoutDirection | null;
  onboard_date: string | null;
  onboarded_by: string | null;
  posting_dispatch_date: string | null;
  collab_type: CollabType | null;
  commercial_amount: number | null;
  creator_brief_link: string | null;
  shopify_order_id: string | null;
  order_id: string | null;
  garments: string | null;
  garment_qty: number | null;
  tracking_id: string | null;
  order_status: string | null;
  delivery_date: string | null;
  est_delivery: string | null;
  order_placed_date: string | null;
  reels: number | null;
  static_posts: number | null;
  stories: number | null;
  ads_usage_rights: string | null;
  post_date: string | null;
  post_link: string | null;
  download_link: string | null;
  duration_days: number | null;
  raw_dump: string | null;
  partnership_id: string | null;
  ad_partnership_valid: boolean | null;
  content_name: string | null;
  content_type: string | null;
  ads_status: AdResult | null;
  ads_results: string | null;
  collab_email_sent_at: string | null;
  collab_email_skipped: boolean | null;
  bank_name: string | null;
  bank_number: string | null;
  ifsc: string | null;
  username: string | null;
  email: string | null;
  agency_name: string | null;
  nomenclature: string | null;
  notes: string | null;
  remarks: string | null;
  utr: string | null;
  payment_date: string | null;
  payment_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorsRow {
  id: string;
  inf_id: string;
  username: string;
  inf_name: string | null;
  instagram_url: string | null;
  instagram_link: string | null;
  followers: number | null;
  gender: string | null;
  verification: string | null;
  category: "Nano" | "Micro" | "Mid tier" | "Macro" | "Mega" | null;
  content_type: string | null;
  email: string | null;
  contact: string | null;
  address: string | null;
  agency_name: string | null;
  state: string | null;
  language: string | null;
  er_percent: number | null;
  er: number | null;
  avg_likes: number | null;
  profile_pic: string | null;
  bank_name: string | null;
  bank_number: string | null;
  ifsc: string | null;
  ig_status: "auto" | "private" | "not_found" | "manual" | null;
  ig_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignsRow {
  id: string;
  campaign_id: string;
  campaign_num: number | null;
  name_identifier: string | null;
  name: string | null;
  campaign_name: string | null;
  month: string | null;
  brief_pdf_url: string | null;
  brief_link: string | null;
  internal_brief_link: string | null;
  key_message: string | null;
  start_date: string | null;
  end_date: string | null;
  no_of_creators: number | null;
  budget: number | null;
  total_budget: number | null;
  status: "Active" | "Completed" | "Paused" | "Draft" | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentsRow {
  id: string;
  post_id: string;
  inf_id: string | null;
  username: string | null;
  collab_number: number | null;
  deliverable_index: number | null;
  utr: string | null;
  amount: number | null;
  payment_date: string | null;
  bank_name: string | null;
  bank_number: string | null;
  ifsc: string | null;
  logged_by: string | null;
  status: PaymentStatus | null;
  due_date: string | null;
  estimated_payable_date: string | null;
  payment_advice_sent: boolean | null;
  deliverable_post_id: string | null;
  posted_but_not_tested: boolean | null;
  created_at: string;
}

export interface UserAccessRow {
  id: string;
  email: string;
  name: string | null;
  role: "Owner" | "Global Admin" | "User" | "Accounts Team" | string;
  active: boolean;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      posts: {
        Row: PostsRow;
        Insert: Partial<PostsRow>;
        Update: Partial<PostsRow>;
      };
      creators: {
        Row: CreatorsRow;
        Insert: Partial<CreatorsRow>;
        Update: Partial<CreatorsRow>;
      };
      campaigns: {
        Row: CampaignsRow;
        Insert: Partial<CampaignsRow>;
        Update: Partial<CampaignsRow>;
      };
      payments: {
        Row: PaymentsRow;
        Insert: Partial<PaymentsRow>;
        Update: Partial<PaymentsRow>;
      };
      user_access: {
        Row: UserAccessRow;
        Insert: Partial<UserAccessRow>;
        Update: Partial<UserAccessRow>;
      };
    };
  };
}
