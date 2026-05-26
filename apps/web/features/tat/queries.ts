import { createServiceClient } from "@/lib/supabase/server";
import type {
  CampaignTat,
  TatData,
  TatFilterOptions,
  TatFilters,
  TatKpi,
  TatStats,
} from "./types";

/**
 * BASE cols — always exist on prod.
 */
const POSTS_COLS_BASE = [
  "campaign_id",
  "order_id",
  "order_status",
  "post_date",
  "inf_id",
  "workflow_status",
].join(",");

/**
 * EXTENDED cols — TAT-specific date cols may 42703 on prod if migration not yet applied.
 * Falls back to BASE so the page renders with zero TAT cards rather than crashing.
 */
const POSTS_COLS_EXTENDED =
  POSTS_COLS_BASE + ",reach_out_date,onboard_date,est_delivery";

/**
 * BASE cols for shopify_orders — order_placed_date may be missing on some envs.
 */
const SHOPIFY_COLS_BASE = ["order_id", "tracking_status"].join(",");
const SHOPIFY_COLS_EXTENDED = SHOPIFY_COLS_BASE + ",order_placed_date";

const MIN_VALID_DATE = new Date("2020-01-01").getTime();

/**
 * A valid date is parseable AND occurs after 2020-01-01.
 * Mirrors legacy `_valid(d)`.
 */
function _valid(d: Date | null | undefined): d is Date {
  if (!d) return false;
  const t = d.getTime();
  if (!Number.isFinite(t)) return false;
  return t > MIN_VALID_DATE;
}

function _toDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Days between two dates (floor((b-a)/86400000)).
 * Returns null if either date is invalid or diff is negative.
 */
function daysBetween(a: unknown, b: unknown): number | null {
  const da = _toDate(a);
  const db = _toDate(b);
  if (!_valid(da) || !_valid(db)) return null;
  const diff = Math.floor((db.getTime() - da.getTime()) / 86400000);
  return diff < 0 ? null : diff;
}

function tierFromFollowers(followers: number | null | undefined): string {
  if (followers == null) return "";
  if (followers < 10_000) return "Nano";
  if (followers < 50_000) return "Micro";
  if (followers < 300_000) return "Mid tier";
  if (followers < 1_000_000) return "Macro";
  return "Mega";
}

function computeStats(arr: Array<number | null>): TatStats {
  const vals = arr.filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) {
    return { avg: null, min: null, max: null, count: 0 };
  }
  const sum = vals.reduce((acc, v) => acc + v, 0);
  return {
    avg: Math.round(sum / vals.length),
    min: Math.min(...vals),
    max: Math.max(...vals),
    count: vals.length,
  };
}

export async function fetchTatData(filters: TatFilters): Promise<{
  tatData: TatData;
  campaignTats: CampaignTat[];
  kpi: TatKpi;
}> {
  const supabase = createServiceClient();

  // Defensive EXTENDED → BASE fallback for posts (42703 if migration not applied).
  const fetchPosts = async () => {
    const ext = await (supabase as any)
      .from("posts")
      .select(POSTS_COLS_EXTENDED)
      .in("workflow_status", ["Posted", "Delivered"])
      .limit(2000);
    if (!ext.error) return ext;
    const code = String((ext.error as { code?: string }).code ?? "");
    if (code === "42703" || /column .* does not exist/i.test(ext.error.message ?? "")) {
      console.warn(
        "[tat] TAT date cols missing on posts, falling back to BASE set. " +
          "Apply the reach_out_date / onboard_date / est_delivery migration to enable TAT.",
      );
      return (supabase as any)
        .from("posts")
        .select(POSTS_COLS_BASE)
        .in("workflow_status", ["Posted", "Delivered"])
        .limit(2000);
    }
    return ext;
  };

  // Defensive fallback for shopify_orders too.
  const fetchOrders = async () => {
    const ext = await (supabase as any)
      .from("shopify_orders")
      .select(SHOPIFY_COLS_EXTENDED)
      .limit(2000);
    if (!ext.error) return ext;
    const code = String((ext.error as { code?: string }).code ?? "");
    if (code === "42703" || /column .* does not exist/i.test(ext.error.message ?? "")) {
      console.warn("[tat] order_placed_date missing on shopify_orders, falling back to BASE.");
      return (supabase as any).from("shopify_orders").select(SHOPIFY_COLS_BASE).limit(2000);
    }
    return ext;
  };

  const [postsRes, ordersRes] = await Promise.all([fetchPosts(), fetchOrders()]);

  if (postsRes.error) {
    console.error("[tat] posts query failed:", postsRes.error);
    throw postsRes.error;
  }
  if (ordersRes.error) {
    console.error("[tat] shopify_orders query failed:", ordersRes.error);
    throw ordersRes.error;
  }

  const postsRaw = (postsRes.data ?? []) as Array<Record<string, unknown>>;
  const orders = (ordersRes.data ?? []) as Array<Record<string, unknown>>;

  // Build orderId → order_placed_date map.
  const orderPlacedMap = new Map<string, unknown>();
  for (const o of orders) {
    const oid = String(o.order_id ?? "").trim();
    if (oid) orderPlacedMap.set(oid, o.order_placed_date);
  }

  // Resolve creator tier per inf_id (creators.category or follower-derived).
  const infIds = [
    ...new Set(
      postsRaw
        .map((p) => String(p.inf_id ?? "").trim())
        .filter((id) => id.length > 0),
    ),
  ];
  const tierByInf = new Map<string, string>();
  if (infIds.length > 0) {
    const { data: creators } = await (supabase as any)
      .from("creators")
      .select("inf_id, category, followers")
      .in("inf_id", infIds)
      .limit(2000);
    for (const c of (creators ?? []) as Array<{
      inf_id: string | null;
      category: string | null;
      followers: number | null;
    }>) {
      const id = String(c.inf_id ?? "").trim();
      if (!id) continue;
      const tier =
        (c.category ?? "").trim() || tierFromFollowers(c.followers);
      tierByInf.set(id, tier);
    }
  }

  // Apply filters server-side (still in JS since we already pulled the set).
  const fromTs = filters.reachOutFrom
    ? new Date(filters.reachOutFrom).getTime()
    : null;
  const toTs = filters.reachOutTo
    ? new Date(filters.reachOutTo).getTime() + 86_400_000 - 1
    : null;
  const posts = postsRaw.filter((p) => {
    if (
      filters.campaign &&
      String(p.campaign_id ?? "").trim() !== filters.campaign
    )
      return false;
    if (filters.tier) {
      const infId = String(p.inf_id ?? "").trim();
      const t = tierByInf.get(infId) ?? "";
      if (t !== filters.tier) return false;
    }
    if (filters.status) {
      const wf = String(p.workflow_status ?? "")
        .trim()
        .toLowerCase();
      if (filters.status === "posted" && wf !== "posted") return false;
      if (filters.status === "delivered" && wf !== "delivered") return false;
    }
    if (fromTs != null || toTs != null) {
      const ro = _toDate(p.reach_out_date);
      if (!ro) return false;
      const ts = ro.getTime();
      if (fromTs != null && ts < fromTs) return false;
      if (toTs != null && ts > toTs) return false;
    }
    return true;
  });

  // Date pair arrays.
  const arrRoToOnboard: Array<number | null> = [];
  const arrRoToPosting: Array<number | null> = [];
  const arrRoToOrderCreated: Array<number | null> = [];
  const arrObToDelivered: Array<number | null> = [];
  const arrObToPosting: Array<number | null> = [];
  const arrOrderToDelivered: Array<number | null> = [];
  const arrDeliveredToPosting: Array<number | null> = [];

  // Per-campaign reach-out → posting accumulator.
  const campaignAcc = new Map<string, Array<number>>();

  // KPI accumulators.
  const kpi: TatKpi = {
    totalPosts: 0,
    postsWithOrder: 0,
    avgEndToEnd: 0,
    delivered: 0,
    rto: 0,
    cancelled: 0,
  };
  const endToEndDays: number[] = [];
  // Deduplicate order-level KPIs — one order shared by multiple posts must count once.
  const seenOrderIds = new Set<string>();

  for (const p of posts) {
    kpi.totalPosts++;

    const reachOut = p.reach_out_date;
    const onboard = p.onboard_date;
    const postDate = p.post_date;
    const delivery = p.est_delivery;
    const orderId = String(p.order_id ?? "").trim();
    const orderStatusRaw = String(p.order_status ?? "")
      .trim()
      .toLowerCase();
    const shopifyOrderPlaced = orderId ? orderPlacedMap.get(orderId) : null;

    arrRoToOnboard.push(daysBetween(reachOut, onboard));
    arrRoToPosting.push(daysBetween(reachOut, postDate));
    arrRoToOrderCreated.push(daysBetween(reachOut, shopifyOrderPlaced));
    arrObToDelivered.push(daysBetween(onboard, delivery));
    arrObToPosting.push(daysBetween(onboard, postDate));
    arrOrderToDelivered.push(daysBetween(shopifyOrderPlaced, delivery));
    arrDeliveredToPosting.push(daysBetween(delivery, postDate));

    // Campaign-level avg (reach-out → posting).
    const camp = String(p.campaign_id ?? "").trim();
    const roToPost = daysBetween(reachOut, postDate);
    if (camp && roToPost !== null) {
      const bucket = campaignAcc.get(camp) ?? [];
      bucket.push(roToPost);
      campaignAcc.set(camp, bucket);
    }

    // End-to-end (reach-out → post) for KPI avg.
    if (roToPost !== null) endToEndDays.push(roToPost);

    // Order + status bucketing — deduplicated per unique order_id.
    if (orderId && !seenOrderIds.has(orderId)) {
      seenOrderIds.add(orderId);
      kpi.postsWithOrder++;
      if (orderStatusRaw === "delivered") {
        kpi.delivered++;
      } else if (orderStatusRaw === "rto") {
        kpi.rto++;
      } else if (orderStatusRaw.includes("cancelled")) {
        kpi.cancelled++;
      }
    }
  }

  const tatData: TatData = {
    ro_to_onboard: computeStats(arrRoToOnboard),
    ro_to_posting: computeStats(arrRoToPosting),
    ro_to_order_created: computeStats(arrRoToOrderCreated),
    ob_to_delivered: computeStats(arrObToDelivered),
    ob_to_posting: computeStats(arrObToPosting),
    order_to_delivered: computeStats(arrOrderToDelivered),
    delivered_to_posting: computeStats(arrDeliveredToPosting),
  };

  const campaignTats: CampaignTat[] = Array.from(campaignAcc.entries())
    .map(([campaign, days]) => ({
      campaign,
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    }))
    .sort((a, b) => b.avgDays - a.avgDays);

  kpi.avgEndToEnd =
    endToEndDays.length === 0
      ? null
      : Math.round(endToEndDays.reduce((a, b) => a + b, 0) / endToEndDays.length);

  return { tatData, campaignTats, kpi };
}

export async function fetchTatFilterOptions(): Promise<TatFilterOptions> {
  const supabase = createServiceClient();

  const [{ data: campaigns }, { data: creators }] = await Promise.all([
    (supabase as any)
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .order("campaign_id", { ascending: false })
      .limit(500),
    (supabase as any)
      .from("creators")
      .select("category, followers")
      .limit(2000),
  ]);

  const tierSet = new Set<string>();
  for (const c of (creators ?? []) as Array<{
    category: string | null;
    followers: number | null;
  }>) {
    const t = (c.category ?? "").trim() || tierFromFollowers(c.followers);
    if (t) tierSet.add(t);
  }
  const tierOrder = ["Nano", "Micro", "Mid tier", "Macro", "Mega"];
  const tiers = [...tierSet].sort(
    (a, b) => (tierOrder.indexOf(a) + 999) - (tierOrder.indexOf(b) + 999),
  );

  return {
    campaigns: (
      (campaigns ?? []) as Array<{
        campaign_id: string;
        campaign_name: string | null;
      }>
    ).map((c) => ({
      id: c.campaign_id,
      name: c.campaign_name ?? c.campaign_id,
    })),
    tiers,
  };
}
