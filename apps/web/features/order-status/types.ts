/**
 * Order Status types — mirrors legacy `getOrderStatusData` rows.
 *
 * One row per `posts` record that has an `order_id`, enriched with the
 * matching `shopify_orders` row (live tracking + commerce intel) and the
 * creator metadata (avatar + tier + category).
 */
export type OrderStatusBucket =
  | "all"
  | "pending"
  | "transit"
  | "delivered"
  | "rto"
  | "cancelled";

export interface OrderStatusRow {
  postId: string;
  infId: string | null;
  name: string;
  username: string;
  profilePicUrl: string | null;
  campaign: string;
  category: string | null;
  followers: number | null;
  collabType: string | null;
  commercials: number;
  orderId: string;
  trackingId: string;
  shippingStatus: string;
  orderStatus: string;
  workflowStatus: string;
  estDelivery: string | null;
  deliveryDate: string | null;
  orderPlaced: string | null;
  isOverdue: boolean;
  reels: number;
  posts: number;
  stories: number;
  subtotalPrice: number;
  totalPrice: number;
  discountTotal: number;
  discountCodes: string;
  tags: string;
  orderNote: string;
  financialStatus: string;
  customerOrderCount: number;
  cancelledAt: string | null;
  cancelReason: string;
  refundReason: string;
  refundedAt: string | null;
  refundAmount: number;
  lineSkus: string;
  fulfillmentEvents: string;
  /** Derived bucket — drives KPI grouping + filter buttons. */
  bucket: OrderStatusBucket;
}

export interface OrderStatusKpi {
  total: number;
  pendingDispatch: number;
  inTransit: number;
  delivered: number;
  rto: number;
  cancelled: number;
  cancelledRto: number;
  deliveryRate: number;
  rtoRate: number;
  totalRevenue: number;
  avgOrderValue: number;
  refundedCount: number;
  refundedAmount: number;
  refundRate: number;
  discountUsedCount: number;
  repeatCustomerCount: number;
  repeatCustomerRate: number;
  taggedCount: number;
}

export interface OrderStatusFilters {
  search?: string;
  campaign?: string;
  status?: OrderStatusBucket | "";
  collab?: string;
  financial?: "paid" | "refunded" | "partially_refunded" | "pending" | "";
  discount?: "yes" | "no" | "";
  repeat?: "yes" | "no" | "";
}

export interface OrderStatusFilterOptions {
  campaigns: { id: string; name: string }[];
}

/**
 * Bucket the effective shipping status into the 5 KPI columns + a catch-all.
 * Effective = live shopify tracking_status (if present), else manual order_status.
 */
export function bucketStatus(raw: string | null | undefined): OrderStatusBucket {
  const s = String(raw ?? "").toLowerCase().trim();
  if (
    !s ||
    s === "unfulfilled" ||
    s === "pending dispatch" ||
    s === "processing" ||
    s === "on hold" ||
    s === "scheduled"
  )
    return "pending";
  if (
    s === "in transit" ||
    s === "fulfilled" ||
    s === "confirmed" ||
    s === "partially fulfilled" ||
    s === "shipped"
  )
    return "transit";
  if (s === "delivered") return "delivered";
  if (s === "rto" || s === "restocked") return "rto";
  if (s.indexOf("cancelled") !== -1) return "cancelled";
  return "pending";
}
