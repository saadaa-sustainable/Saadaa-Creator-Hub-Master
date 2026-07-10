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
  /** Normalized Meta partnership state (pending/approved/rejected/revoked/none). */
  partnership_status: string | null;
  /** Timestamp the partnership was approved (real auto-fetched acceptance). */
  partnership_approved_at?: string | null;
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
    | "is_active"
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

/**
 * INF Orders row — one representative per collab_id that is mapped to a Collab
 * ID and has an order (Barter + Barter + Paid). `commercial` is the collab total
 * finalized at onboarding. Served by /api/accounts/inf-orders.
 */
export interface InfOrderRow {
  post_id: string;
  collab_id: string;
  inf_id: string | null;
  inf_name: string | null;
  username: string | null;
  profile_pic: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  collab_type: string | null;
  commercial: number;
  garment_qty: string | null;
  onboard_date: string | null;
  order_id: string | null;
  order_date: string | null;
  order_status: string | null;
  tracking_status: string | null;
  order_total: number | null;
  deliverables: number;
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
 * Kanban column groupings — Onboarded / Posted / Payments / Partial Payments.
 * The board buckets in priority order:
 *   1. Partial Payments — any collab with an outstanding balance (`_isPartial`),
 *      regardless of workflow / payment status.
 *   2. Payments — fully paid collabs (`payment.status === "Done"`). This is the
 *      Paid CSV's set.
 *   3. Onboarded / Posted — the remaining collabs bucketed by `workflow_status`.
 * Reach Out is intentionally absent (no order/payment yet). Sole-barter collabs
 * are excluded from Onboarded/Posted — they carry no payment and live in the
 * "INF Orders" view instead.
 */
export const KANBAN_COLUMNS = [
  {
    id: "on-board",
    label: "Onboarded",
    statuses: ["On Board", "Order Sent"] as const,
  },
  {
    id: "posted",
    label: "Posted",
    statuses: ["Posted", "Delivered"] as const,
  },
  {
    // Payment-status lane — filled by the board's paid check, not workflow_status.
    id: "payments",
    label: "Payments",
    statuses: [] as const,
  },
  {
    // Outstanding-balance lane — filled by the `_isPartial` check.
    id: "partial",
    label: "Partial Payments",
    statuses: [] as const,
  },
] as const;
