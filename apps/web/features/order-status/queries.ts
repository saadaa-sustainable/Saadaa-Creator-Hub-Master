import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isVoidedStatus } from "@/lib/workflow";
import {
  bucketStatus,
  type OrderStatusFilterOptions,
  type OrderStatusFilters,
  type OrderStatusKpi,
  type OrderStatusRow,
} from "./types";

/**
 * Mirrors legacy `_getOrderStatusDataFromSupabase_`
 * (InfluencerBackend.js:5652-5891). Parallel fetches posts (with order_id),
 * shopify_orders, creators, and the instagram_cache avatar fallback. Joins
 * in-memory and accumulates KPIs over the full scope (filter is client-side
 * for the list, server-side for campaign + collab to keep the payload sane).
 */
// Note: posts.delivery_date doesn't exist on prod even though types.gen.ts
// lists it. Use est_delivery from posts + delivery_date from shopify_orders.
const POSTS_COLS = [
  "post_id",
  "collab_id",
  "collab_number",
  "inf_id",
  "username",
  "campaign_id",
  "workflow_status",
  "reels",
  "static_posts",
  "stories",
  "collab_type",
  "commercial_amount",
  "order_id",
  "order_status",
  "tracking_id",
  "est_delivery",
  "deliverable_index",
  "garment_qty",
  "garments_sent",
].join(",");

// Confirmed-safe base columns (every other shopify_orders consumer uses these).
const SHOPIFY_COLS_BASE = [
  "order_id",
  "tracking_id",
  "tracking_status",
  "delivery_date",
  "order_date",
  "line_skus",
].join(",");

// Extended Commerce Intel columns added by
// supabase/migrations/2026_05_16_shopify_orders_expanded.sql. If that
// migration hasn't been applied to the live DB, the query 400s with
// PostgREST code 42703 — we detect that and fall back to base cols so
// the volume KPIs + table still render (commerce intel KPIs just go to 0).
const SHOPIFY_COLS_EXTENDED = [
  SHOPIFY_COLS_BASE,
  "subtotal_price",
  "total_price",
  "discount_total",
  "discount_codes",
  "tags",
  "note",
  "financial_status",
  "customer_order_count",
  "cancelled_at",
  "cancel_reason",
  "refund_reason",
  "refunded_at",
  "refund_amount",
  "fulfillment_events",
].join(",");

const CREATOR_COLS = ["username", "inf_name", "profile_pic", "category", "followers"].join(",");

export async function fetchOrderStatusData(
  filters: OrderStatusFilters,
): Promise<{ rows: OrderStatusRow[]; kpi: OrderStatusKpi }> {
  const supabase = createServiceClient();

  // Try the extended columns first; if PostgREST 42703s the missing column,
  // retry with the base column set so the page still renders.
  const fetchShopify = async () => {
    const ext = await (supabase as any)
      .from("shopify_orders")
      .select(SHOPIFY_COLS_EXTENDED)
      .limit(10000);
    if (!ext.error) return ext;
    const code = String((ext.error as { code?: string }).code ?? "");
    if (code === "42703" || /column .* does not exist/i.test(ext.error.message ?? "")) {
      console.warn(
        "[order-status] shopify_orders expanded cols missing, falling back to base set. " +
          "Apply supabase/migrations/2026_05_16_shopify_orders_expanded.sql to enable Commerce Intel KPIs.",
      );
      return await (supabase as any)
        .from("shopify_orders")
        .select(SHOPIFY_COLS_BASE)
        .limit(10000);
    }
    return ext;
  };

  // Parallel fetch — posts with order_id, shopify enrichments, creators,
  // instagram_cache for avatar fallback. Sibling sum is fetched separately
  // (all rows) so per-collab `commercial_amount` totals are correct after
  // the equal-split rule landed.
  const [postsRes, siblingRes, shopifyRes, creatorsRes, igCacheRes] =
    await Promise.all([
      (supabase as any)
        .from("posts")
        .select(POSTS_COLS)
        .not("order_id", "is", null)
        .or("deliverable_index.is.null,deliverable_index.eq.1")
        .limit(5000),
      (supabase as any)
        .from("posts")
        .select("inf_id, collab_number, commercial_amount")
        .not("inf_id", "is", null)
        .not("collab_number", "is", null)
        .limit(20000),
      fetchShopify(),
      (supabase as any).from("creators").select(CREATOR_COLS).limit(5000),
      (supabase as any).from("instagram_cache").select("username, profile_pic").limit(5000),
    ]);

  const siblingSumMap = new Map<string, number>();
  for (const s of (siblingRes.data ?? []) as Array<Record<string, unknown>>) {
    const key = `${s.inf_id}::${s.collab_number}`;
    siblingSumMap.set(
      key,
      (siblingSumMap.get(key) ?? 0) + Number(s.commercial_amount ?? 0),
    );
  }

  if (postsRes.error) {
    console.error("[order-status] posts query failed:", postsRes.error);
    throw postsRes.error;
  }
  if (shopifyRes.error) {
    console.error("[order-status] shopify_orders query failed:", shopifyRes.error);
    throw shopifyRes.error;
  }

  // Voided (offboarded) collabs are removed from the order-status board.
  const posts = ((postsRes.data ?? []) as Array<Record<string, unknown>>).filter(
    (p) => !isVoidedStatus(p.workflow_status as string | null),
  );
  const shopifyRows = (shopifyRes.data ?? []) as Array<Record<string, unknown>>;
  const creatorRows = (creatorsRes.data ?? []) as Array<Record<string, unknown>>;
  const igCacheRows = (igCacheRes.data ?? []) as Array<Record<string, unknown>>;

  const shopifyMap = new Map<string, Record<string, unknown>>();
  for (const s of shopifyRows) {
    const key = String(s.order_id ?? "")
      .replace(/^#+/, "")
      .trim()
      .toLowerCase();
    if (key) shopifyMap.set(key, s);
  }
  const creatorMap = new Map<string, Record<string, unknown>>();
  for (const c of creatorRows) {
    const u = String(c.username ?? "").toLowerCase();
    if (u) creatorMap.set(u, c);
  }
  const igCacheMap = new Map<string, string>();
  for (const ic of igCacheRows) {
    const u = String(ic.username ?? "").toLowerCase();
    const pic = String(ic.profile_pic ?? "").trim();
    if (u && pic) igCacheMap.set(u, pic);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const rows: OrderStatusRow[] = [];
  const kpi: OrderStatusKpi = {
    total: 0,
    pendingDispatch: 0,
    inTransit: 0,
    delivered: 0,
    rto: 0,
    cancelled: 0,
    cancelledRto: 0,
    deliveryRate: 0,
    rtoRate: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    refundedCount: 0,
    refundedAmount: 0,
    refundRate: 0,
    discountUsedCount: 0,
    repeatCustomerCount: 0,
    repeatCustomerRate: 0,
    taggedCount: 0,
  };
  let nonCancelledCount = 0;

  for (const p of posts) {
    if (p.deliverable_index != null && Number(p.deliverable_index) > 1) {
      continue;
    }

    const orderId = String(p.order_id ?? "").trim();
    if (!orderId) continue;
    const camp = String(p.campaign_id ?? "").trim();
    if (filters.campaign && camp !== filters.campaign) continue;
    if (filters.collab && String(p.collab_type ?? "") !== filters.collab)
      continue;

    const sKey = orderId.replace(/^#+/, "").toLowerCase();
    const sRow = shopifyMap.get(sKey) ?? ({} as Record<string, unknown>);
    const cRow = creatorMap.get(String(p.username ?? "").toLowerCase()) ?? ({} as Record<string, unknown>);

    const manualOrderStatus = String(p.order_status ?? "").trim();
    const liveShippingStatus = String(sRow.tracking_status ?? "").trim();
    const effective = (liveShippingStatus || manualOrderStatus).toLowerCase();

    const bucket = bucketStatus(effective);
    kpi.total++;
    if (bucket === "pending") kpi.pendingDispatch++;
    else if (bucket === "transit") kpi.inTransit++;
    else if (bucket === "delivered") kpi.delivered++;
    else if (bucket === "rto") {
      if (effective === "order cancelled after rto") kpi.cancelledRto++;
      else kpi.rto++;
    } else if (bucket === "cancelled") {
      if (effective === "order cancelled after rto") kpi.cancelledRto++;
      else kpi.cancelled++;
    }

    const estDelivery = p.est_delivery ? new Date(p.est_delivery as string) : null;
    const safeStatuses = ["delivered", "rto", "order cancelled", "order cancelled after rto"];
    const isOverdue =
      !!estDelivery &&
      estDelivery < today &&
      !safeStatuses.some((s) => effective.indexOf(s) !== -1);

    const infId = (p.inf_id as string | null) ?? null;
    const collabId =
      (p.collab_id as string | null) ||
      (infId ? `${infId}-C${Number(p.collab_number ?? 1)}` : null);

    rows.push({
      postId: String(p.post_id ?? ""),
      collabId,
      infId,
      name: String(cRow.inf_name ?? p.username ?? ""),
      username: String(p.username ?? ""),
      profilePicUrl:
        String(cRow.profile_pic ?? "") ||
        igCacheMap.get(String(p.username ?? "").toLowerCase()) ||
        null,
      campaign: camp,
      category: (cRow.category as string | null) ?? null,
      followers: Number(cRow.followers ?? 0) || null,
      collabType: (p.collab_type as string | null) ?? null,
      commercials:
        siblingSumMap.get(`${p.inf_id}::${p.collab_number}`) ??
        Number(p.commercial_amount ?? 0),
      orderId,
      trackingId: String(sRow.tracking_id ?? p.tracking_id ?? "").trim(),
      shippingStatus: liveShippingStatus,
      orderStatus: manualOrderStatus,
      workflowStatus: String(p.workflow_status ?? ""),
      estDelivery: estDelivery ? estDelivery.toISOString().slice(0, 10) : null,
      deliveryDate: sRow.delivery_date
        ? String(sRow.delivery_date).slice(0, 10)
        : null,
      orderPlaced: sRow.order_date ? String(sRow.order_date).slice(0, 10) : null,
      isOverdue,
      reels: Number(p.reels ?? 0),
      posts: Number(p.static_posts ?? 0),
      stories: Number(p.stories ?? 0),
      garmentQty:
        p.garment_qty == null || Number.isNaN(Number(p.garment_qty))
          ? null
          : Number(p.garment_qty),
      garmentsSent: String(p.garments_sent ?? "").trim(),
      subtotalPrice: Number(sRow.subtotal_price ?? 0),
      totalPrice: Number(sRow.total_price ?? 0),
      discountTotal: Number(sRow.discount_total ?? 0),
      discountCodes: String(sRow.discount_codes ?? ""),
      tags: String(sRow.tags ?? ""),
      orderNote: String(sRow.note ?? ""),
      financialStatus: String(sRow.financial_status ?? ""),
      customerOrderCount: Number(sRow.customer_order_count ?? 0),
      cancelledAt: sRow.cancelled_at ? String(sRow.cancelled_at).slice(0, 10) : null,
      cancelReason: String(sRow.cancel_reason ?? ""),
      refundReason: String(sRow.refund_reason ?? ""),
      refundedAt: sRow.refunded_at ? String(sRow.refunded_at).slice(0, 10) : null,
      refundAmount: Number(sRow.refund_amount ?? 0),
      lineSkus: String(sRow.line_skus ?? ""),
      fulfillmentEvents: extractFulfillmentChain(sRow.fulfillment_events),
      bucket,
    });

    // Financial KPI accumulation
    const rowTotal = Number(sRow.total_price ?? 0);
    const isCancelled = ["cancelled", "order cancelled", "order cancelled after rto"].some(
      (s) => effective.indexOf(s) !== -1,
    );
    if (!isCancelled) {
      kpi.totalRevenue += rowTotal;
      nonCancelledCount++;
    }
    if (Number(sRow.refund_amount ?? 0) > 0) {
      kpi.refundedCount++;
      kpi.refundedAmount += Number(sRow.refund_amount);
    }
    if (sRow.discount_codes) kpi.discountUsedCount++;
    if (Number(sRow.customer_order_count ?? 0) > 1) kpi.repeatCustomerCount++;
    if (sRow.tags) kpi.taggedCount++;
  }

  kpi.deliveryRate = kpi.total > 0 ? Math.round((kpi.delivered / kpi.total) * 100) : 0;
  kpi.rtoRate = kpi.total > 0 ? Math.round(((kpi.rto + kpi.cancelledRto) / kpi.total) * 100) : 0;
  kpi.avgOrderValue = nonCancelledCount > 0 ? Math.round(kpi.totalRevenue / nonCancelledCount) : 0;
  kpi.refundRate = kpi.total > 0 ? Math.round((kpi.refundedCount / kpi.total) * 100) : 0;
  kpi.repeatCustomerRate =
    kpi.total > 0 ? Math.round((kpi.repeatCustomerCount / kpi.total) * 100) : 0;

  return { rows, kpi };
}

function extractFulfillmentChain(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw && "chain" in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>).chain ?? "");
  }
  return "";
}

export const fetchOrderStatusFilterOptions = unstable_cache(
  async (): Promise<OrderStatusFilterOptions> => {
    const supabase = createServiceClient();
    const { data } = await (supabase as any)
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .order("campaign_id", { ascending: false })
      .limit(500);
    return {
      campaigns: ((data ?? []) as Array<{ campaign_id: string; campaign_name: string | null }>).map(
        (c) => ({ id: c.campaign_id, name: c.campaign_name ?? c.campaign_id }),
      ),
    };
  },
  ["order-status-filter-options"],
  { revalidate: 300, tags: ["campaigns"] },
);
