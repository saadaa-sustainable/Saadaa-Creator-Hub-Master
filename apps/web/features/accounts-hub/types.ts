import type {
  CampaignsRow,
  CreatorsRow,
  PaymentsRow,
  PaymentStatus,
  PostsRow,
} from "@/lib/supabase/types.gen";

export type { PaymentStatus };

/**
 * Accounts Hub row — flattened representation of a payable post + its
 * (optional) payment row. Mirrors legacy `getAccountsHubData` row shape.
 *
 * One row per parent post in workflow_status ∈ {On Board, Order Sent,
 * Posted, Delivered}. Reach Out posts excluded — they have no order yet.
 *
 * `payment` is null for posts that haven't been Posted (no draft row yet).
 */
export interface AccountsRow {
  post_id: PostsRow["post_id"];
  post_id_short: PostsRow["post_id_short"];
  workflow_status: PostsRow["workflow_status"];
  inf_id: PostsRow["inf_id"];
  campaign_id: PostsRow["campaign_id"];
  collab_number: PostsRow["collab_number"];
  collab_id?: PostsRow["collab_id"];
  deliverable_index: PostsRow["deliverable_index"];
  content_type: PostsRow["content_type"];
  nomenclature: PostsRow["nomenclature"];
  collab_type: PostsRow["collab_type"];
  commercial_amount: PostsRow["commercial_amount"];
  barter_amount?: number | string | null;
  ads_usage_rights: PostsRow["ads_usage_rights"];
  partnership_id: PostsRow["partnership_id"];
  ad_partnership_valid?: boolean | null;
  post_link: PostsRow["post_link"];
  post_date: PostsRow["post_date"];
  onboard_date: PostsRow["onboard_date"];
  reach_out_date: PostsRow["reach_out_date"];
  reels: PostsRow["reels"];
  static_posts: PostsRow["static_posts"];
  stories: PostsRow["stories"];
  payment_status: PostsRow["payment_status"];

  campaign: Pick<CampaignsRow, "campaign_id" | "campaign_name"> | null;
  creator: Pick<
    CreatorsRow,
    | "inf_id"
    | "username"
    | "inf_name"
    | "profile_pic"
    | "category"
    | "followers"
    | "verification"
  > | null;

  /** Latest non-Done payment row + any Done row(s). Latest by created_at. */
  payment: PaymentsRow | null;

  /**
   * Presentation-only: number of deliverable rows sharing this collab_id.
   * Stamped on the representative row when the board collapses a collab. Not
   * persisted.
   */
  _collabDeliverableCount?: number;

  /**
   * Partial-payments rollup (presentation-only, computed in queries.ts):
   *   _paidSoFar  — sum of all installment amounts (UTR-bearing rows) for the
   *                 collab.
   *   _remainder  — collab agreed total − paid-so-far (clamped ≥ 0).
   *   _isPartial  — true when 0 < paid < total (balance outstanding).
   */
  _paidSoFar?: number;
  _remainder?: number;
  _isPartial?: boolean;
}

export interface AccountsKpi {
  postsDone: number;
  notDue: { count: number; sum: number };
  due: { count: number; sum: number };
  done: { count: number; sum: number };
  /**
   * Partially-paid collabs (an installment is recorded but the agreed total
   * is not yet met). `sum` is the total OUTSTANDING balance across them — the
   * money still owed. Drives the Accounts Hub outstanding alert + KPI card.
   */
  partial: { count: number; sum: number };
  totalPayable: number;
}

export interface AccountsFilters {
  q?: string;
  campaign?: string;
  statusFilter?: PaymentStatus | "" | string;
  adsRights?: "yes" | "no" | "" | string;
  view?: "kanban" | "list";
}

/**
 * Kanban column groupings — Reach Out / Onboard / Posted plus a terminal
 * "Payment Done" lane. The first three bucket by `workflow_status`; Payment
 * Done is special-cased in the board: any collab whose payment is fully `Done`
 * moves here regardless of workflow_status (so Posted shows only unpaid
 * collabs). The Paid CSV is exactly this column's set (payment.status="Done").
 */
export const KANBAN_COLUMNS = [
  { id: "reach-out", label: "Reach Out", statuses: ["Reach Out"] as const },
  {
    id: "on-board",
    label: "Onboard",
    statuses: ["On Board", "Order Sent"] as const,
  },
  {
    id: "posted",
    label: "Posted",
    statuses: ["Posted", "Delivered"] as const,
  },
  {
    // Payment-status lane — filled by the board's paid check, not workflow_status.
    id: "payment-done",
    label: "Payment Done",
    statuses: [] as const,
  },
] as const;
