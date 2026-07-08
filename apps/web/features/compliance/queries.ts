import { createServiceClient } from "@/lib/supabase/server";
import { isVoidedStatus } from "@/lib/workflow";
import type {
  CampaignBreakdownRow,
  ComplianceData,
  ConversionRates,
  CoverageCounts,
  PipelineCounts,
  TeamBreakdownRow,
  TurnaroundAverages,
} from "./types";

/**
 * Pipeline + KPI source columns. Pulls per-row from `posts`, then dedups by
 * `order_id` for order-side metrics (Delivered, RTO, Cancelled) so one order
 * with 3 deliverables doesn't triple-count. Per-collab counts use the
 * parent-only rule (`deliverable_index IS NULL OR = 1`).
 */
const POSTS_SELECT = [
  "post_id",
  "campaign_id",
  "workflow_status",
  "order_id",
  "order_status",
  "tracking_id",
  "post_link",
  "email",
  "bank_number",
  "payment_status",
  "reach_out_date",
  "onboard_date",
  "post_date",
  "onboarded_by",
  "logged_by",
  "deliverable_index",
  "inf_id",
  "collab_number",
].join(",");

const MIN_DATE = new Date("2020-01-01").getTime();

function emptyComplianceData(): ComplianceData {
  const emptyRate = { pct: 0, num: 0, den: 0 };
  return {
    pipeline: {
      total: 0,
      reachOut: 0,
      onBoard: 0,
      posted: 0,
      delivered: 0,
      rto: 0,
      cancelled: 0,
      active: 0,
    },
    rates: {
      onboardConvRate: emptyRate,
      postingRate: emptyRate,
      deliveryRate: emptyRate,
      paymentRate: emptyRate,
      rtoRate: emptyRate,
    },
    tat: {
      roToOb: null,
      obToPost: null,
      roToPost: null,
    },
    coverage: {
      withOrder: 0,
      withTracking: 0,
      withPostLink: 0,
      withEmail: 0,
      withBank: 0,
      emailCoveragePct: 0,
      bankCoveragePct: 0,
    },
    campaigns: [],
    team: [],
  };
}

function statusKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function hasValue(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function isParent(row: Record<string, unknown>): boolean {
  const idx = row.deliverable_index;
  return idx == null || Number(idx) === 1;
}

function daysBetween(from: unknown, to: unknown): number | null {
  if (!from || !to) return null;
  const a = new Date(String(from)).getTime();
  const b = new Date(String(to)).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < MIN_DATE || b < MIN_DATE) return null;
  const diff = (b - a) / 86_400_000;
  if (diff < 0) return null;
  return diff;
}

export async function fetchComplianceData(): Promise<ComplianceData> {
  const supabase = createServiceClient();

  const { data, error } = await (supabase as any)
    .from("posts")
    .select(POSTS_SELECT)
    .limit(10_000);

  if (error) {
    console.error("[compliance] posts query failed:", error);
    return emptyComplianceData();
  }

  // Voided (offboarded) collabs are excluded from compliance KPIs.
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(
    (p) => !isVoidedStatus(p.workflow_status as string | null),
  );

  // ── Parent-post pipeline (collab-level counts) ─────────────────────────
  const parents = rows.filter(isParent);

  const pipeline: PipelineCounts = {
    total: parents.length,
    reachOut: 0,
    onBoard: 0,
    posted: 0,
    delivered: 0,
    rto: 0,
    cancelled: 0,
    active: 0,
  };

  // ── Order-side dedup (only used for withOrder + withTracking coverage) ──
  const seenOrders = new Set<string>();

  let withOrder = 0;
  let withTracking = 0;
  let withPostLink = 0;
  let withEmail = 0;
  let withBank = 0;
  let paidCount = 0;
  let postedOrDelivered = 0;

  // TAT accumulators.
  let roToObSum = 0;
  let roToObCount = 0;
  let obToPostSum = 0;
  let obToPostCount = 0;
  let roToPostSum = 0;
  let roToPostCount = 0;

  const campaignMap = new Map<
    string,
    { total: number; posted: number; delivered: number; rto: number }
  >();

  const teamMap = new Map<string, number>();

  // Parent post_id → final pipeline bucket. Posted-with-delivered-order is
  // classified as "delivered", matching legacy's mutually exclusive buckets.
  const parentBuckets = new Map<
    string,
    | "reach-out"
    | "on-board"
    | "posted"
    | "delivered"
    | "rto"
    | "cancelled"
    | "other"
  >();

  for (const r of rows) {
    const wf = statusKey(r.workflow_status);
    const orderStatus = statusKey(r.order_status);
    const orderId = String(r.order_id ?? "").trim();
    const postId = String(r.post_id ?? "").trim();

    // ── Parent-only pipeline buckets (mutually exclusive, matches legacy) ──
    if (isParent(r) && postId) {
      let bucket: typeof parentBuckets extends Map<unknown, infer V>
        ? V
        : never = "other";
      if (wf === "reach out") bucket = "reach-out";
      else if (wf === "on board" || wf === "order sent") bucket = "on-board";
      else if (wf === "posted" || wf === "delivered") {
        // Legacy: status === "delivered" overrides "posted". We honor that by
        // promoting to "delivered" when the linked order is delivered.
        if (orderStatus === "delivered") bucket = "delivered";
        else if (orderStatus === "rto" || orderStatus.startsWith("rto"))
          bucket = "rto";
        else if (orderStatus.includes("cancel")) bucket = "cancelled";
        else bucket = "posted";
      } else if (wf === "rto" || wf.includes("rto")) bucket = "rto";
      else if (wf.includes("cancel")) bucket = "cancelled";

      parentBuckets.set(postId, bucket);
    }

    // ── Order coverage dedup (unique order_id → withOrder + withTracking) ──
    if (orderId && !seenOrders.has(orderId)) {
      seenOrders.add(orderId);
      withOrder++;
      if (hasValue(r.tracking_id)) withTracking++;
    }

    // ── Parent-only metrics (every count below treats one collab as 1) ────
    if (!isParent(r)) continue;

    if (hasValue(r.post_link)) withPostLink++;
    if (hasValue(r.email)) withEmail++;
    if (hasValue(r.bank_number)) withBank++;

    const pay = statusKey(r.payment_status);
    if (pay === "paid" || pay === "done") paidCount++;

    // TAT averages — parent-only so sibling rows don't triple-count the same
    // reach_out_date/onboard_date pair.
    const tatRoOb = daysBetween(r.reach_out_date, r.onboard_date);
    if (tatRoOb != null) {
      roToObSum += tatRoOb;
      roToObCount++;
    }
    const tatObPost = daysBetween(r.onboard_date, r.post_date);
    if (tatObPost != null) {
      obToPostSum += tatObPost;
      obToPostCount++;
    }
    const tatRoPost = daysBetween(r.reach_out_date, r.post_date);
    if (tatRoPost != null) {
      roToPostSum += tatRoPost;
      roToPostCount++;
    }

    // Campaign breakdown — parent-only counts.
    const cid = String(r.campaign_id ?? "").trim();
    if (cid) {
      const c = campaignMap.get(cid) ?? {
        total: 0,
        posted: 0,
        delivered: 0,
        rto: 0,
      };
      c.total++;
      if (wf === "posted" || wf === "delivered") {
        if (orderStatus === "delivered") c.delivered++;
        else c.posted++;
      }
      if (orderStatus === "rto" || orderStatus.startsWith("rto")) c.rto++;
      campaignMap.set(cid, c);
    }

    // Team = row owner (CALLOUT BY = logged_by, always set); onboarded_by is
    // only set on onboarded rows since 2026-07-08, so it would under-count.
    const team = String(r.onboarded_by ?? r.logged_by ?? "").trim();
    if (team) teamMap.set(team, (teamMap.get(team) ?? 0) + 1);
  }

  // Finalize parent-post pipeline counts from the mutually-exclusive buckets.
  for (const bucket of parentBuckets.values()) {
    if (bucket === "reach-out") pipeline.reachOut++;
    else if (bucket === "on-board") pipeline.onBoard++;
    else if (bucket === "posted") pipeline.posted++;
    else if (bucket === "delivered") pipeline.delivered++;
    else if (bucket === "rto") pipeline.rto++;
    else if (bucket === "cancelled") pipeline.cancelled++;
  }
  pipeline.active = pipeline.total - pipeline.rto - pipeline.cancelled;
  postedOrDelivered = pipeline.posted + pipeline.delivered;

  // Legacy formulas verbatim (numerator / denominator):
  //   onboardConvRate = (onBoard + posted + delivered) / total
  //   postingRate     = (posted + delivered) / active
  //   deliveryRate    = delivered / (posted + delivered)
  //   rtoRate         = rto / withOrder
  //   paymentRate     = paid / (posted + delivered)
  const rates: ConversionRates = {
    onboardConvRate: rate(
      pipeline.onBoard + pipeline.posted + pipeline.delivered,
      pipeline.total,
    ),
    postingRate: rate(postedOrDelivered, pipeline.active),
    deliveryRate: rate(pipeline.delivered, postedOrDelivered),
    paymentRate: rate(paidCount, postedOrDelivered),
    rtoRate: rate(pipeline.rto, withOrder),
  };

  const tat: TurnaroundAverages = {
    roToOb: avgDays(roToObSum, roToObCount),
    obToPost: avgDays(obToPostSum, obToPostCount),
    roToPost: avgDays(roToPostSum, roToPostCount),
  };

  const coverage: CoverageCounts = {
    withOrder,
    withTracking,
    withPostLink,
    withEmail,
    withBank,
    emailCoveragePct: pct(withEmail, rows.length),
    bankCoveragePct: pct(withBank, Math.max(pipeline.active, 1)),
  };

  const campaigns: CampaignBreakdownRow[] = [...campaignMap.entries()]
    .map(([campaign, c]) => ({
      campaign,
      total: c.total,
      posted: c.posted,
      delivered: c.delivered,
      rto: c.rto,
      postingRate: pct(c.posted, c.total),
    }))
    .sort((a, b) => a.campaign.localeCompare(b.campaign));

  const team: TeamBreakdownRow[] = [...teamMap.entries()]
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count);

  return { pipeline, rates, tat, coverage, campaigns, team };
}

function pct(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 100);
}

function rate(num: number, den: number) {
  return { pct: pct(num, den), num, den };
}

function avgDays(sum: number, count: number): number | null {
  if (!count) return null;
  return Math.round(sum / count);
}
