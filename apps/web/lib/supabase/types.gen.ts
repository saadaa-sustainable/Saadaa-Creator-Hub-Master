/**
 * Supabase types — regenerated against the LIVE database on 2026-06-07
 * (via `supabase gen types` / the Supabase MCP `generate_typescript_types`).
 *
 * The DB models its "enums" as TEXT columns + CHECK constraints, so the raw
 * generator returns those status columns as plain `string`. To keep ergonomic
 * typing at call sites we layer hand-maintained UNION aliases (WorkflowStatus,
 * PaymentStatus, AdResult, …) and convenience Row interfaces (PostsRow, …) on
 * top, then ship the FULL generated `Database` (all tables/views/functions)
 * below for the Supabase client generics.
 *
 * Regenerate the bottom (generated) block with:  npm run db:types
 * When you do, re-reconcile the union aliases + Row interfaces above against any
 * new columns. Keep this header.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Union aliases (DB stores these as TEXT+CHECK; unions are app-side ergonomics).
// Kept as broad supersets of the live CHECK values AND the values used in code.
// ─────────────────────────────────────────────────────────────────────────────
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
  | "Offboarded"
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
export type PaymentStatus = "Not Due" | "Due" | "Partial" | "Done";

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Row interfaces (union-typed status cols for ergonomic call sites).
// Supersets of the live schema: every live column is present; a few aspirational
// columns the app references defensively (ads_status, ads_results, content_name,
// delivery_date, order_placed_date, shopify_order_id, duration_days, remarks,
// reachout_type, garments) are kept OPTIONAL — they 42703 at runtime until added,
// and the app guards them (e.g. dashboard's EXTENDED→BASE fallback).
// ─────────────────────────────────────────────────────────────────────────────
export interface PostsRow {
  id: number;
  post_id: string;
  post_id_short: string | null;
  post_number: number | null;
  collab_number: number | null;
  collab_id: string | null;
  deliverable_index: number | null;
  deliverable_role: string | null;
  deliverable_type: DeliverableType | null;
  parent_post_id: string | null;
  inf_id: string | null;
  campaign_id: string | null;
  workflow_status: WorkflowStatus;
  reach_out_date: string | null;
  reachout_direction: ReachoutDirection | null;
  onboard_date: string | null;
  onboarded_by: string | null;
  posting_dispatch_date: string | null;
  collab_type: CollabType | null;
  commercial_amount: number | null;
  barter_amount: number | null;
  creator_brief_link: string | null;
  order_id: string | null;
  garments_sent: string | null;
  garment_qty: string | null;
  tracking_id: string | null;
  order_status: string | null;
  est_delivery: string | null;
  reels: number | null;
  static_posts: number | null;
  stories: number | null;
  ads_usage_rights: string | null;
  post_date: string | null;
  post_link: string | null;
  download_link: string | null;
  raw_dump: string | null;
  partnership_id: string | null;
  ad_partnership_valid: boolean | null;
  content_type: string | null;
  collab_email_sent_at: string | null;
  collab_email_skipped: boolean | null;
  content_reminder_sent_at: string | null;
  posting_pending_sent_at: string | null;
  onboarding_pending_sent_at: string | null;
  bank_name: string | null;
  bank_number: string | null;
  ifsc: string | null;
  username: string | null;
  email: string | null;
  agency_name: string | null;
  nomenclature: string | null;
  notes: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  utr: string | null;
  payment_date: string | null;
  payment_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Aspirational / defensively-accessed (not yet on the live posts table):
  ads_status?: AdResult | null;
  ads_results?: string | null;
  content_name?: string | null;
  delivery_date?: string | null;
  order_placed_date?: string | null;
  shopify_order_id?: string | null;
  duration_days?: number | null;
  remarks?: string | null;
  reachout_type?: string | null;
  garments?: string | null;
  is_test?: boolean | null;
}

export interface CreatorsRow {
  id: number;
  inf_id: string;
  username: string;
  inf_name: string | null;
  instagram_link: string | null;
  followers: number | null;
  gender: string | null;
  verification: string | null;
  category: "Nano" | "Micro" | "Mid tier" | "Macro" | "Mega" | null;
  email: string | null;
  agency_name: string | null;
  state: string | null;
  language: string | null;
  er: number | null;
  avg_likes: number | null;
  profile_pic: string | null;
  bank_name: string | null;
  bank_number: string | null;
  ifsc: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Present in older rows / accessed defensively (not on the current live table):
  instagram_url?: string | null;
  content_type?: string | null;
  contact?: string | null;
  address?: string | null;
  er_percent?: number | null;
  ig_status?: "auto" | "private" | "not_found" | "manual" | null;
  ig_fetched_at?: string | null;
  is_test?: boolean | null;
}

export interface CampaignsRow {
  id: number;
  campaign_id: string;
  campaign_num: number | null;
  campaign_name: string | null;
  brief_link: string | null;
  internal_brief_link: string | null;
  key_message: string | null;
  start_date: string | null;
  end_date: string | null;
  no_of_creators: string | null;
  total_budget: number | null;
  status: "active" | "Active" | "Closed" | "Completed" | "Paused" | "Draft" | null;
  created_by: string | null;
  auto_closed_at: string | null;
  ending_alert_sent: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  // Dropped from the live table but referenced by legacy code paths:
  name_identifier?: string | null;
  name?: string | null;
  month?: string | null;
  brief_pdf_url?: string | null;
  budget?: number | null;
  is_test?: boolean | null;
}

export interface PaymentsRow {
  id: number;
  /** App always keys payments on post_id; the live column is technically nullable. */
  post_id: string;
  collab_id: string | null;
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
  status: PaymentStatus | null;
  due_date: string | null;
  estimated_payable_date: string | null;
  payment_advice_sent: boolean | null;
  deliverable_post_id: string | null;
  posted_but_not_tested: boolean;
  eligibility_email_sent: boolean | null;
  sla_breach_alert_sent: boolean | null;
  created_at: string | null;
  logged_by?: string | null;
  is_test?: boolean | null;
}

export interface UserAccessRow {
  id: number;
  email: string;
  name: string | null;
  role: "Owner" | "Global Admin" | "User" | "Accounts Team" | "Campaign Owner" | string;
  active: boolean | null;
  invited_by: string | null;
  invited_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  employee_id: string | null;
  department: string | null;
  notes: string | null;
  created_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generated schema — live as of 2026-06-07. Used for the Supabase client
// generics. Status columns are `string` here (TEXT+CHECK); use the union aliases
// above for typing in app code. Regenerate with `npm run db:types`.
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _hist_profile_backup: {
        Row: {
          post_id: string | null
          profile_id: string | null
          uname_key: string | null
        }
        Insert: {
          post_id?: string | null
          profile_id?: string | null
          uname_key?: string | null
        }
        Update: {
          post_id?: string | null
          profile_id?: string | null
          uname_key?: string | null
        }
        Relationships: []
      }
      access_role_permissions: {
        Row: {
          granted: boolean
          role_id: string
          scope: string
        }
        Insert: {
          granted?: boolean
          role_id: string
          scope: string
        }
        Update: {
          granted?: boolean
          role_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_role_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_roles: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      campaign_budget: {
        Row: {
          avg_comp: number
          campaign_id: string
          campaign_name: string | null
          collab_type: string | null
          created_at: string
          est_garment_cost: number | null
          id: number
          max_garments: number
          min_garments: number
          month_label: string
          num_influencers: number
          tier: string | null
          total_cost: number | null
          total_with_garments: number | null
        }
        Insert: {
          avg_comp?: number
          campaign_id: string
          campaign_name?: string | null
          collab_type?: string | null
          created_at?: string
          est_garment_cost?: number | null
          id?: number
          max_garments?: number
          min_garments?: number
          month_label: string
          num_influencers?: number
          tier?: string | null
          total_cost?: number | null
          total_with_garments?: number | null
        }
        Update: {
          avg_comp?: number
          campaign_id?: string
          campaign_name?: string | null
          collab_type?: string | null
          created_at?: string
          est_garment_cost?: number | null
          id?: number
          max_garments?: number
          min_garments?: number
          month_label?: string
          num_influencers?: number
          tier?: string | null
          total_cost?: number | null
          total_with_garments?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_budget_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          auto_closed_at: string | null
          brief_link: string | null
          campaign_id: string
          campaign_name: string
          campaign_num: number | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          ending_alert_sent: boolean | null
          id: number
          internal_brief_link: string | null
          is_test: boolean
          key_message: string | null
          no_of_creators: string | null
          start_date: string | null
          status: string | null
          total_budget: number | null
          updated_at: string | null
        }
        Insert: {
          auto_closed_at?: string | null
          brief_link?: string | null
          campaign_id: string
          campaign_name: string
          campaign_num?: number | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          ending_alert_sent?: boolean | null
          id?: number
          internal_brief_link?: string | null
          is_test?: boolean
          key_message?: string | null
          no_of_creators?: string | null
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_closed_at?: string | null
          brief_link?: string | null
          campaign_id?: string
          campaign_name?: string
          campaign_num?: number | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          ending_alert_sent?: boolean | null
          id?: number
          internal_brief_link?: string | null
          is_test?: boolean
          key_message?: string | null
          no_of_creators?: string | null
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cell_comments: {
        Row: {
          author_email: string
          body: string
          column_key: string
          created_at: string
          id: number
          mentions: string[]
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          row_pk: string
          table_id: string
          updated_at: string
        }
        Insert: {
          author_email: string
          body: string
          column_key: string
          created_at?: string
          id?: number
          mentions?: string[]
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          row_pk: string
          table_id: string
          updated_at?: string
        }
        Update: {
          author_email?: string
          body?: string
          column_key?: string
          created_at?: string
          id?: number
          mentions?: string[]
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          row_pk?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cell_comments_author_email_fkey"
            columns: ["author_email"]
            isOneToOne: false
            referencedRelation: "user_access"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "cell_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_access"
            referencedColumns: ["email"]
          },
        ]
      }
      cell_edits: {
        Row: {
          column_key: string
          edited_at: string
          edited_by: string | null
          id: number
          new_value: string | null
          old_value: string | null
          row_pk: string
          sheet_key: string
          table_name: string | null
        }
        Insert: {
          column_key: string
          edited_at?: string
          edited_by?: string | null
          id?: never
          new_value?: string | null
          old_value?: string | null
          row_pk: string
          sheet_key: string
          table_name?: string | null
        }
        Update: {
          column_key?: string
          edited_at?: string
          edited_by?: string | null
          id?: never
          new_value?: string | null
          old_value?: string | null
          row_pk?: string
          sheet_key?: string
          table_name?: string | null
        }
        Relationships: []
      }
      cleaned_data: {
        Row: {
          ad_partnership_status: string | null
          address: string | null
          agency_name: string | null
          avg_likes: string | null
          callout_by: string | null
          campaign_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          city: string | null
          collab_duration: string | null
          collab_id: string | null
          collab_type: string | null
          commercials: string | null
          contact_no: string | null
          content_delivery_date: string | null
          content_downloaded_link: string | null
          content_name: string | null
          content_type: string | null
          country: string | null
          customer_name: string | null
          customer_order_count: number | null
          delivery_date: string | null
          discount_codes: string | null
          discount_total: number | null
          email: string | null
          email_id: string | null
          engaged_rate: string | null
          entry_date: string | null
          financial_status: string | null
          followers: string | null
          fulfillment: string | null
          fulfillment_events: Json | null
          garment_qty: string | null
          garments_sent: string | null
          gender: string | null
          historic: string | null
          id: number
          ig_handle: string | null
          influencer_callout: string | null
          influencer_category: string | null
          influencer_name: string | null
          language: string | null
          line_skus: string | null
          link_to_post: string | null
          location: string | null
          month: string | null
          nomenclature: string | null
          notes: string | null
          onboard_date: string | null
          order_date: string | null
          order_id: string | null
          order_journey: string | null
          order_placed_date: string | null
          order_sent_date: string | null
          order_status: string | null
          order_tag_synced: boolean | null
          order_tags: string | null
          partnership_active_date: string | null
          payment_status: string | null
          phone: string | null
          pincode: string | null
          post_date: string | null
          post_id: string | null
          posting_journey: string | null
          profile_id: string | null
          profile_status: string | null
          raw_dump: string | null
          reachout_type: string | null
          referred_by: string | null
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          remarks: string | null
          remarks_2: string | null
          shopify_synced_at: string | null
          sif_id: string | null
          stage: string | null
          state: string | null
          street_address: string | null
          subtotal_price: number | null
          synced_at: string
          tag: string | null
          total_price: number | null
          tracking_id: string | null
          tracking_status: string | null
          username: string | null
        }
        Insert: {
          ad_partnership_status?: string | null
          address?: string | null
          agency_name?: string | null
          avg_likes?: string | null
          callout_by?: string | null
          campaign_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          city?: string | null
          collab_duration?: string | null
          collab_id?: string | null
          collab_type?: string | null
          commercials?: string | null
          contact_no?: string | null
          content_delivery_date?: string | null
          content_downloaded_link?: string | null
          content_name?: string | null
          content_type?: string | null
          country?: string | null
          customer_name?: string | null
          customer_order_count?: number | null
          delivery_date?: string | null
          discount_codes?: string | null
          discount_total?: number | null
          email?: string | null
          email_id?: string | null
          engaged_rate?: string | null
          entry_date?: string | null
          financial_status?: string | null
          followers?: string | null
          fulfillment?: string | null
          fulfillment_events?: Json | null
          garment_qty?: string | null
          garments_sent?: string | null
          gender?: string | null
          historic?: string | null
          id?: never
          ig_handle?: string | null
          influencer_callout?: string | null
          influencer_category?: string | null
          influencer_name?: string | null
          language?: string | null
          line_skus?: string | null
          link_to_post?: string | null
          location?: string | null
          month?: string | null
          nomenclature?: string | null
          notes?: string | null
          onboard_date?: string | null
          order_date?: string | null
          order_id?: string | null
          order_journey?: string | null
          order_placed_date?: string | null
          order_sent_date?: string | null
          order_status?: string | null
          order_tag_synced?: boolean | null
          order_tags?: string | null
          partnership_active_date?: string | null
          payment_status?: string | null
          phone?: string | null
          pincode?: string | null
          post_date?: string | null
          post_id?: string | null
          posting_journey?: string | null
          profile_id?: string | null
          profile_status?: string | null
          raw_dump?: string | null
          reachout_type?: string | null
          referred_by?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          remarks?: string | null
          remarks_2?: string | null
          shopify_synced_at?: string | null
          sif_id?: string | null
          stage?: string | null
          state?: string | null
          street_address?: string | null
          subtotal_price?: number | null
          synced_at?: string
          tag?: string | null
          total_price?: number | null
          tracking_id?: string | null
          tracking_status?: string | null
          username?: string | null
        }
        Update: {
          ad_partnership_status?: string | null
          address?: string | null
          agency_name?: string | null
          avg_likes?: string | null
          callout_by?: string | null
          campaign_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          city?: string | null
          collab_duration?: string | null
          collab_id?: string | null
          collab_type?: string | null
          commercials?: string | null
          contact_no?: string | null
          content_delivery_date?: string | null
          content_downloaded_link?: string | null
          content_name?: string | null
          content_type?: string | null
          country?: string | null
          customer_name?: string | null
          customer_order_count?: number | null
          delivery_date?: string | null
          discount_codes?: string | null
          discount_total?: number | null
          email?: string | null
          email_id?: string | null
          engaged_rate?: string | null
          entry_date?: string | null
          financial_status?: string | null
          followers?: string | null
          fulfillment?: string | null
          fulfillment_events?: Json | null
          garment_qty?: string | null
          garments_sent?: string | null
          gender?: string | null
          historic?: string | null
          id?: never
          ig_handle?: string | null
          influencer_callout?: string | null
          influencer_category?: string | null
          influencer_name?: string | null
          language?: string | null
          line_skus?: string | null
          link_to_post?: string | null
          location?: string | null
          month?: string | null
          nomenclature?: string | null
          notes?: string | null
          onboard_date?: string | null
          order_date?: string | null
          order_id?: string | null
          order_journey?: string | null
          order_placed_date?: string | null
          order_sent_date?: string | null
          order_status?: string | null
          order_tag_synced?: boolean | null
          order_tags?: string | null
          partnership_active_date?: string | null
          payment_status?: string | null
          phone?: string | null
          pincode?: string | null
          post_date?: string | null
          post_id?: string | null
          posting_journey?: string | null
          profile_id?: string | null
          profile_status?: string | null
          raw_dump?: string | null
          reachout_type?: string | null
          referred_by?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          remarks?: string | null
          remarks_2?: string | null
          shopify_synced_at?: string | null
          sif_id?: string | null
          stage?: string | null
          state?: string | null
          street_address?: string | null
          subtotal_price?: number | null
          synced_at?: string
          tag?: string | null
          total_price?: number | null
          tracking_id?: string | null
          tracking_status?: string | null
          username?: string | null
        }
        Relationships: []
      }
      creators: {
        Row: {
          agency_name: string | null
          avg_likes: number | null
          bank_name: string | null
          bank_number: string | null
          category: string | null
          collab_counter: number
          created_at: string | null
          er: number | null
          followers: number | null
          gender: string | null
          id: number
          ifsc: string | null
          inf_id: string
          inf_name: string | null
          instagram_link: string | null
          is_test: boolean
          language: string | null
          profile_id: string | null
          profile_pic: string | null
          state: string | null
          updated_at: string | null
          username: string
          verification: string | null
        }
        Insert: {
          agency_name?: string | null
          avg_likes?: number | null
          bank_name?: string | null
          bank_number?: string | null
          category?: string | null
          collab_counter?: number
          created_at?: string | null
          er?: number | null
          followers?: number | null
          gender?: string | null
          id?: number
          ifsc?: string | null
          inf_id: string
          inf_name?: string | null
          instagram_link?: string | null
          is_test?: boolean
          language?: string | null
          profile_id?: string | null
          profile_pic?: string | null
          state?: string | null
          updated_at?: string | null
          username: string
          verification?: string | null
        }
        Update: {
          agency_name?: string | null
          avg_likes?: number | null
          bank_name?: string | null
          bank_number?: string | null
          category?: string | null
          collab_counter?: number
          created_at?: string | null
          er?: number | null
          followers?: number | null
          gender?: string | null
          id?: number
          ifsc?: string | null
          inf_id?: string
          inf_name?: string | null
          instagram_link?: string | null
          is_test?: boolean
          language?: string | null
          profile_id?: string | null
          profile_pic?: string | null
          state?: string | null
          updated_at?: string | null
          username?: string
          verification?: string | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          collab_id: string
          created_at: string
          email_type: string
          error: string | null
          id: string
          post_id: string
          sent_to: string
          status: string
          subject: string
        }
        Insert: {
          collab_id: string
          created_at?: string
          email_type?: string
          error?: string | null
          id?: string
          post_id: string
          sent_to: string
          status?: string
          subject: string
        }
        Update: {
          collab_id?: string
          created_at?: string
          email_type?: string
          error?: string | null
          id?: string
          post_id?: string
          sent_to?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      historic_creator_data: {
        Row: {
          ad_partnership_status: string | null
          address: string | null
          agency_name: string | null
          avg_likes: string | null
          callout_by: string | null
          campaign_id: string | null
          collab_duration: string | null
          collab_type: string | null
          commercials: string | null
          contact_no: string | null
          content_delivery_date: string | null
          content_downloaded_link: string | null
          content_name: string | null
          content_type: string | null
          email_id: string | null
          engaged_rate: string | null
          entry_date: string | null
          followers: string | null
          garments_sent: string | null
          gender: string | null
          historic: string | null
          id: number
          ig_handle: string | null
          influencer_callout: string | null
          influencer_category: string | null
          influencer_name: string | null
          language: string | null
          link_to_post: string | null
          location: string | null
          month: string | null
          nomenclature: string | null
          onboard_date: string | null
          order_id: string | null
          order_journey: string | null
          order_sent_date: string | null
          order_status: string | null
          partnership_active_date: string | null
          payment_status: string | null
          post_date: string | null
          post_id: string | null
          posting_journey: string | null
          profile_id: string | null
          raw_dump: string | null
          reachout_type: string | null
          referred_by: string | null
          remarks: string | null
          remarks_2: string | null
          sif_id: string | null
          synced_at: string
          tracking_id: string | null
          username: string | null
        }
        Insert: {
          ad_partnership_status?: string | null
          address?: string | null
          agency_name?: string | null
          avg_likes?: string | null
          callout_by?: string | null
          campaign_id?: string | null
          collab_duration?: string | null
          collab_type?: string | null
          commercials?: string | null
          contact_no?: string | null
          content_delivery_date?: string | null
          content_downloaded_link?: string | null
          content_name?: string | null
          content_type?: string | null
          email_id?: string | null
          engaged_rate?: string | null
          entry_date?: string | null
          followers?: string | null
          garments_sent?: string | null
          gender?: string | null
          historic?: string | null
          id?: never
          ig_handle?: string | null
          influencer_callout?: string | null
          influencer_category?: string | null
          influencer_name?: string | null
          language?: string | null
          link_to_post?: string | null
          location?: string | null
          month?: string | null
          nomenclature?: string | null
          onboard_date?: string | null
          order_id?: string | null
          order_journey?: string | null
          order_sent_date?: string | null
          order_status?: string | null
          partnership_active_date?: string | null
          payment_status?: string | null
          post_date?: string | null
          post_id?: string | null
          posting_journey?: string | null
          profile_id?: string | null
          raw_dump?: string | null
          reachout_type?: string | null
          referred_by?: string | null
          remarks?: string | null
          remarks_2?: string | null
          sif_id?: string | null
          synced_at?: string
          tracking_id?: string | null
          username?: string | null
        }
        Update: {
          ad_partnership_status?: string | null
          address?: string | null
          agency_name?: string | null
          avg_likes?: string | null
          callout_by?: string | null
          campaign_id?: string | null
          collab_duration?: string | null
          collab_type?: string | null
          commercials?: string | null
          contact_no?: string | null
          content_delivery_date?: string | null
          content_downloaded_link?: string | null
          content_name?: string | null
          content_type?: string | null
          email_id?: string | null
          engaged_rate?: string | null
          entry_date?: string | null
          followers?: string | null
          garments_sent?: string | null
          gender?: string | null
          historic?: string | null
          id?: never
          ig_handle?: string | null
          influencer_callout?: string | null
          influencer_category?: string | null
          influencer_name?: string | null
          language?: string | null
          link_to_post?: string | null
          location?: string | null
          month?: string | null
          nomenclature?: string | null
          onboard_date?: string | null
          order_id?: string | null
          order_journey?: string | null
          order_sent_date?: string | null
          order_status?: string | null
          partnership_active_date?: string | null
          payment_status?: string | null
          post_date?: string | null
          post_id?: string | null
          posting_journey?: string | null
          profile_id?: string | null
          raw_dump?: string | null
          reachout_type?: string | null
          referred_by?: string | null
          remarks?: string | null
          remarks_2?: string | null
          sif_id?: string | null
          synced_at?: string
          tracking_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      ig_data_historic: {
        Row: {
          avg_likes: number | null
          engagement_rate: number | null
          error: string | null
          fetched_at: string | null
          followers: number | null
          id: number
          image_url: string | null
          not_matched_profile_id: string | null
          posts_sampled: number | null
          profile_id: string | null
          status: string | null
          username: string
        }
        Insert: {
          avg_likes?: number | null
          engagement_rate?: number | null
          error?: string | null
          fetched_at?: string | null
          followers?: number | null
          id?: number
          image_url?: string | null
          not_matched_profile_id?: string | null
          posts_sampled?: number | null
          profile_id?: string | null
          status?: string | null
          username: string
        }
        Update: {
          avg_likes?: number | null
          engagement_rate?: number | null
          error?: string | null
          fetched_at?: string | null
          followers?: number | null
          id?: number
          image_url?: string | null
          not_matched_profile_id?: string | null
          posts_sampled?: number | null
          profile_id?: string | null
          status?: string | null
          username?: string
        }
        Relationships: []
      }
      instagram_cache: {
        Row: {
          attempts: number
          avg_likes: number | null
          avg_views: number | null
          biography: string | null
          er: number | null
          followers: number | null
          id: number
          is_verified: boolean | null
          profile_pic: string | null
          raw_json: Json | null
          scraped_at: string | null
          status: string
          updated_at: string | null
          username: string
        }
        Insert: {
          attempts?: number
          avg_likes?: number | null
          avg_views?: number | null
          biography?: string | null
          er?: number | null
          followers?: number | null
          id?: number
          is_verified?: boolean | null
          profile_pic?: string | null
          raw_json?: Json | null
          scraped_at?: string | null
          status?: string
          updated_at?: string | null
          username: string
        }
        Update: {
          attempts?: number
          avg_likes?: number | null
          avg_views?: number | null
          biography?: string | null
          er?: number | null
          followers?: number | null
          id?: number
          is_verified?: boolean | null
          profile_pic?: string | null
          raw_json?: Json | null
          scraped_at?: string | null
          status?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number | null
          bank_name: string | null
          bank_number: string | null
          collab_id: string | null
          collab_number: number | null
          created_at: string | null
          deliverable_index: number | null
          deliverable_post_id: string | null
          due_date: string | null
          eligibility_email_sent: boolean | null
          estimated_payable_date: string | null
          id: number
          ifsc: string | null
          inf_id: string | null
          is_test: boolean
          payment_advice_sent: boolean | null
          payment_date: string | null
          post_id: string | null
          posted_but_not_tested: boolean
          sla_breach_alert_sent: boolean | null
          status: string | null
          username: string | null
          utr: string | null
        }
        Insert: {
          amount?: number | null
          bank_name?: string | null
          bank_number?: string | null
          collab_id?: string | null
          collab_number?: number | null
          created_at?: string | null
          deliverable_index?: number | null
          deliverable_post_id?: string | null
          due_date?: string | null
          eligibility_email_sent?: boolean | null
          estimated_payable_date?: string | null
          id?: number
          ifsc?: string | null
          inf_id?: string | null
          is_test?: boolean
          payment_advice_sent?: boolean | null
          payment_date?: string | null
          post_id?: string | null
          posted_but_not_tested?: boolean
          sla_breach_alert_sent?: boolean | null
          status?: string | null
          username?: string | null
          utr?: string | null
        }
        Update: {
          amount?: number | null
          bank_name?: string | null
          bank_number?: string | null
          collab_id?: string | null
          collab_number?: number | null
          created_at?: string | null
          deliverable_index?: number | null
          deliverable_post_id?: string | null
          due_date?: string | null
          eligibility_email_sent?: boolean | null
          estimated_payable_date?: string | null
          id?: number
          ifsc?: string | null
          inf_id?: string | null
          is_test?: boolean
          payment_advice_sent?: boolean | null
          payment_date?: string | null
          post_id?: string | null
          posted_but_not_tested?: boolean
          sla_breach_alert_sent?: boolean | null
          status?: string | null
          username?: string | null
          utr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_deliverable_post_id_fkey"
            columns: ["deliverable_post_id"]
            isOneToOne: false
            referencedRelation: "inbound_reachout_queue"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "payments_deliverable_post_id_fkey"
            columns: ["deliverable_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "payments_inf_id_fkey"
            columns: ["inf_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["inf_id"]
          },
          {
            foreignKeyName: "payments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "inbound_reachout_queue"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "payments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["post_id"]
          },
        ]
      }
      posts: {
        Row: {
          ad_partnership_valid: boolean | null
          ads_usage_rights: string | null
          agency_name: string | null
          bank_name: string | null
          bank_number: string | null
          barter_amount: number | null
          campaign_id: string | null
          city: string | null
          collab_email_sent_at: string | null
          collab_email_skipped: boolean | null
          collab_id: string | null
          collab_number: number | null
          collab_type: string | null
          commercial_amount: number | null
          content_reminder_sent_at: string | null
          content_type: string | null
          country: string | null
          created_at: string | null
          creator_brief_link: string | null
          deliverable_index: number | null
          deliverable_role: string | null
          deliverable_type: string | null
          download_link: string | null
          email: string | null
          est_delivery: string | null
          garment_qty: string | null
          garments_sent: string | null
          id: number
          ifsc: string | null
          inf_id: string | null
          is_test: boolean
          logged_by: string | null
          nomenclature: string | null
          notes: string | null
          onboard_date: string | null
          onboarded_by: string | null
          onboarding_pending_sent_at: string | null
          order_id: string | null
          order_status: string | null
          parent_post_id: string | null
          partnership_id: string | null
          payment_date: string | null
          payment_status: string | null
          pincode: string | null
          post_date: string | null
          post_id: string
          post_id_short: string | null
          post_link: string | null
          post_number: number | null
          posting_dispatch_date: string | null
          posting_pending_sent_at: string | null
          raw_dump: string | null
          reach_out_date: string | null
          reachout_direction: string | null
          reels: number | null
          state: string | null
          static_posts: number | null
          stories: number | null
          street_address: string | null
          tracking_id: string | null
          updated_at: string | null
          username: string | null
          utr: string | null
          workflow_status: string | null
        }
        Insert: {
          ad_partnership_valid?: boolean | null
          ads_usage_rights?: string | null
          agency_name?: string | null
          bank_name?: string | null
          bank_number?: string | null
          barter_amount?: number | null
          campaign_id?: string | null
          city?: string | null
          collab_email_sent_at?: string | null
          collab_email_skipped?: boolean | null
          collab_id?: string | null
          collab_number?: number | null
          collab_type?: string | null
          commercial_amount?: number | null
          content_reminder_sent_at?: string | null
          content_type?: string | null
          country?: string | null
          created_at?: string | null
          creator_brief_link?: string | null
          deliverable_index?: number | null
          deliverable_role?: string | null
          deliverable_type?: string | null
          download_link?: string | null
          email?: string | null
          est_delivery?: string | null
          garment_qty?: string | null
          garments_sent?: string | null
          id?: number
          ifsc?: string | null
          inf_id?: string | null
          is_test?: boolean
          logged_by?: string | null
          nomenclature?: string | null
          notes?: string | null
          onboard_date?: string | null
          onboarded_by?: string | null
          onboarding_pending_sent_at?: string | null
          order_id?: string | null
          order_status?: string | null
          parent_post_id?: string | null
          partnership_id?: string | null
          payment_date?: string | null
          payment_status?: string | null
          pincode?: string | null
          post_date?: string | null
          post_id: string
          post_id_short?: string | null
          post_link?: string | null
          post_number?: number | null
          posting_dispatch_date?: string | null
          posting_pending_sent_at?: string | null
          raw_dump?: string | null
          reach_out_date?: string | null
          reachout_direction?: string | null
          reels?: number | null
          state?: string | null
          static_posts?: number | null
          stories?: number | null
          street_address?: string | null
          tracking_id?: string | null
          updated_at?: string | null
          username?: string | null
          utr?: string | null
          workflow_status?: string | null
        }
        Update: {
          ad_partnership_valid?: boolean | null
          ads_usage_rights?: string | null
          agency_name?: string | null
          bank_name?: string | null
          bank_number?: string | null
          barter_amount?: number | null
          campaign_id?: string | null
          city?: string | null
          collab_email_sent_at?: string | null
          collab_email_skipped?: boolean | null
          collab_id?: string | null
          collab_number?: number | null
          collab_type?: string | null
          commercial_amount?: number | null
          content_reminder_sent_at?: string | null
          content_type?: string | null
          country?: string | null
          created_at?: string | null
          creator_brief_link?: string | null
          deliverable_index?: number | null
          deliverable_role?: string | null
          deliverable_type?: string | null
          download_link?: string | null
          email?: string | null
          est_delivery?: string | null
          garment_qty?: string | null
          garments_sent?: string | null
          id?: number
          ifsc?: string | null
          inf_id?: string | null
          is_test?: boolean
          logged_by?: string | null
          nomenclature?: string | null
          notes?: string | null
          onboard_date?: string | null
          onboarded_by?: string | null
          onboarding_pending_sent_at?: string | null
          order_id?: string | null
          order_status?: string | null
          parent_post_id?: string | null
          partnership_id?: string | null
          payment_date?: string | null
          payment_status?: string | null
          pincode?: string | null
          post_date?: string | null
          post_id?: string
          post_id_short?: string | null
          post_link?: string | null
          post_number?: number | null
          posting_dispatch_date?: string | null
          posting_pending_sent_at?: string | null
          raw_dump?: string | null
          reach_out_date?: string | null
          reachout_direction?: string | null
          reels?: number | null
          state?: string | null
          static_posts?: number | null
          stories?: number | null
          street_address?: string | null
          tracking_id?: string | null
          updated_at?: string | null
          username?: string | null
          utr?: string | null
          workflow_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "posts_inf_id_fkey"
            columns: ["inf_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["inf_id"]
          },
        ]
      }
      row_deletions: {
        Row: {
          deleted_at: string
          deleted_by: string
          id: number
          pk_column: string
          restored_at: string | null
          restored_by: string | null
          row_data: Json
          row_pk: string
          sheet_key: string
          table_name: string
        }
        Insert: {
          deleted_at?: string
          deleted_by: string
          id?: never
          pk_column: string
          restored_at?: string | null
          restored_by?: string | null
          row_data: Json
          row_pk: string
          sheet_key: string
          table_name: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string
          id?: never
          pk_column?: string
          restored_at?: string | null
          restored_by?: string | null
          row_data?: Json
          row_pk?: string
          sheet_key?: string
          table_name?: string
        }
        Relationships: []
      }
      shopify_orders: {
        Row: {
          address: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          customer_name: string | null
          customer_order_count: number | null
          delivery_date: string | null
          discount_codes: string | null
          discount_total: number | null
          email: string | null
          financial_status: string | null
          fulfillment: string | null
          fulfillment_events: Json | null
          garments_sent: string | null
          id: number
          line_skus: string | null
          note: string | null
          order_date: string | null
          order_id: string
          order_placed_date: string | null
          phone: string | null
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          subtotal_price: number | null
          synced_at: string | null
          tags: string | null
          total_price: number | null
          tracking_id: string | null
          tracking_status: string | null
        }
        Insert: {
          address?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          customer_name?: string | null
          customer_order_count?: number | null
          delivery_date?: string | null
          discount_codes?: string | null
          discount_total?: number | null
          email?: string | null
          financial_status?: string | null
          fulfillment?: string | null
          fulfillment_events?: Json | null
          garments_sent?: string | null
          id?: number
          line_skus?: string | null
          note?: string | null
          order_date?: string | null
          order_id: string
          order_placed_date?: string | null
          phone?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          subtotal_price?: number | null
          synced_at?: string | null
          tags?: string | null
          total_price?: number | null
          tracking_id?: string | null
          tracking_status?: string | null
        }
        Update: {
          address?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          customer_name?: string | null
          customer_order_count?: number | null
          delivery_date?: string | null
          discount_codes?: string | null
          discount_total?: number | null
          email?: string | null
          financial_status?: string | null
          fulfillment?: string | null
          fulfillment_events?: Json | null
          garments_sent?: string | null
          id?: number
          line_skus?: string | null
          note?: string | null
          order_date?: string | null
          order_id?: string
          order_placed_date?: string | null
          phone?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          subtotal_price?: number | null
          synced_at?: string | null
          tags?: string | null
          total_price?: number | null
          tracking_id?: string | null
          tracking_status?: string | null
        }
        Relationships: []
      }
      system_errors: {
        Row: {
          created_at: string
          id: number
          key: string | null
          message: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: number
          key?: string | null
          message: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: number
          key?: string | null
          message?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          type?: string
        }
        Relationships: []
      }
      test_mode_archive: {
        Row: {
          deleted_at: string | null
          deleted_by: string | null
          id: number
          restored: boolean | null
          row_data: Json
          row_pk: string | null
          scope: string | null
          source_table: string
        }
        Insert: {
          deleted_at?: string | null
          deleted_by?: string | null
          id?: never
          restored?: boolean | null
          row_data: Json
          row_pk?: string | null
          scope?: string | null
          source_table: string
        }
        Update: {
          deleted_at?: string | null
          deleted_by?: string | null
          id?: never
          restored?: boolean | null
          row_data?: Json
          row_pk?: string | null
          scope?: string | null
          source_table?: string
        }
        Relationships: []
      }
      user_access: {
        Row: {
          active: boolean | null
          created_at: string | null
          department: string | null
          email: string
          employee_id: string | null
          id: number
          invited_at: string | null
          invited_by: string | null
          last_active_at: string | null
          last_login_at: string | null
          name: string | null
          notes: string | null
          role: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          department?: string | null
          email: string
          employee_id?: string | null
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          last_active_at?: string | null
          last_login_at?: string | null
          name?: string | null
          notes?: string | null
          role?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          department?: string | null
          email?: string
          employee_id?: string | null
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          last_active_at?: string | null
          last_login_at?: string | null
          name?: string | null
          notes?: string | null
          role?: string | null
        }
        Relationships: []
      }
      user_audit_log: {
        Row: {
          action: string
          actor_email: string
          after_json: Json | null
          before_json: Json | null
          created_at: string
          id: number
          notes: string | null
          target_email: string
        }
        Insert: {
          action: string
          actor_email: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: number
          notes?: string | null
          target_email: string
        }
        Update: {
          action?: string
          actor_email?: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: number
          notes?: string | null
          target_email?: string
        }
        Relationships: []
      }
    }
    Views: {
      access_role_summary: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          granted_count: number | null
          id: string | null
          is_system: boolean | null
          name: string | null
          updated_at: string | null
          user_count: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          granted_count?: never
          id?: string | null
          is_system?: boolean | null
          name?: string | null
          updated_at?: string | null
          user_count?: never
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          granted_count?: never
          id?: string | null
          is_system?: boolean | null
          name?: string | null
          updated_at?: string | null
          user_count?: never
        }
        Relationships: []
      }
      campaign_budget_monthly: {
        Row: {
          campaign_count: number | null
          month_label: string | null
          total_compensation: number | null
          total_creators: number | null
          total_with_garments: number | null
        }
        Relationships: []
      }
      inbound_reachout_queue: {
        Row: {
          campaign_id: string | null
          collab_type: string | null
          commercial_amount: number | null
          content_type: string | null
          creator_brief_link: string | null
          followers: number | null
          inf_id: string | null
          inf_name: string | null
          post_id: string | null
          reach_out_date: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "posts_inf_id_fkey"
            columns: ["inf_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["inf_id"]
          },
        ]
      }
    }
    Functions: {
      create_repeat_collab: {
        Args: {
          p_campaign_id: string
          p_content_type: string
          p_inf_id: string
        }
        Returns: {
          collab_id: string
          collab_number: number
          inf_id: string
          post_id: string
          post_id_short: string
          post_number: number
        }[]
      }
      generate_post_id: { Args: { p_inf_id: string }; Returns: string }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_login_stats: { Args: never; Returns: Json }
      get_user_access: {
        Args: { p_email: string }
        Returns: {
          active: boolean | null
          created_at: string | null
          department: string | null
          email: string
          employee_id: string | null
          id: number
          invited_at: string | null
          invited_by: string | null
          last_active_at: string | null
          last_login_at: string | null
          name: string | null
          notes: string | null
          role: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_access"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      purge_test_rows: {
        Args: { p_deleted_by: string; p_scope: string; p_source_table: string }
        Returns: number
      }
      submit_campaign: {
        Args: { p_budget_rows: Json; p_form: Json; p_month_label: string }
        Returns: {
          campaign_id: string
          campaign_num: number
          total_budget: number
        }[]
      }
      submit_reachout: {
        Args: {
          p_ads_usage_rights: string
          p_campaign_id: string
          p_collab_type: string
          p_commercial_amount: number
          p_content_name: string
          p_content_type: string
          p_email: string
          p_followers: number
          p_gender: string
          p_inf_name: string
          p_instagram_link: string
          p_logged_by_email: string
          p_raw_dump: string
          p_reachout_direction: string
          p_reachout_type: string
          p_reels: number
          p_state: string
          p_static_posts: number
          p_stories: number
          p_username: string
        }
        Returns: {
          collab_id: string
          collab_number: number
          inf_id: string
          post_id: string
          post_id_short: string
          post_number: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
