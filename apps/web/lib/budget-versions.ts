import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { isOnboardedActive } from "@/lib/workflow";

/**
 * Campaign budget versioning — every campaign's money is a chain of
 * month-pinned versions in `campaign_budget_versions`:
 *
 *   V0            — the first created budget ("Actual"). Made with the
 *                   campaign; pending Global Admin approval.
 *   carry_forward — the unused balance of a month, rolled into the next
 *                   month automatically (pre-approved: same sanctioned money).
 *   top_up        — new money added via New Campaign → "Add budget". Pending
 *                   Global Admin approval, carries a mandatory reason.
 *
 * Version numbers are ONE sequence per campaign (max + 1) regardless of kind —
 * so a campaign whose V0 was fully spent inside its own month gets its first
 * top-up as V1, while a campaign that carried V1 forward gets V2.
 *
 * "Expected" (a.k.a. utilized) is what onboarded collabs commit us to spend:
 *   Barter + Paid → onboarding commercial + Shopify order value
 *   Barter        → Shopify order value only
 * attributed to the month the collab was ONBOARDED. Order value =
 * shopify_orders.total_price for the collab's order number.
 */

export type VersionKind = "initial" | "carry_forward" | "top_up";
export type VersionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "closed";

export interface BudgetVersion {
  id: number;
  campaign_id: string;
  version_number: number;
  kind: VersionKind;
  month: string; // YYYY-MM-DD (first of month)
  amount: number;
  num_creators: number;
  status: VersionStatus;
  source_version_id: number | null;
  note: string | null;
  /** Admin's answer to "why wasn't this utilized?" on carry-forwards. */
  gap_reason: string | null;
  created_by: string | null;
  created_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

/** Human labels for the version kinds — used everywhere a V-chip renders. */
export const VERSION_KIND_LABELS: Record<VersionKind, string> = {
  initial: "First created budget",
  carry_forward: "Carry-forward (unused money rolled from last month)",
  top_up: "Top-up (new money added)",
};

/** One-line explainer per chip, e.g. tooltip on "V2". */
export function versionChipTitle(v: {
  version_number: number;
  kind: VersionKind;
  month?: string | null;
}): string {
  const base =
    v.version_number === 0
      ? "V0 — the first created budget of this campaign"
      : v.kind === "carry_forward"
        ? `V${v.version_number} — unused money carried forward from the previous month`
        : `V${v.version_number} — new money added to this campaign (top-up)`;
  return base;
}

/** IST month key (first-of-month, YYYY-MM-01) for a date/timestamp. */
export function monthKeyIST(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** "2026-07-01" → "July 2026" (what the month tabs show). */
export function monthLabel(monthKey: string): string {
  const d = new Date(monthKey + "T00:00:00Z");
  return d.toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function nextMonthKey(monthKey: string): string {
  const d = new Date(monthKey + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 8) + "01";
}

// ─────────────────────────────────────────────────────────────────────────────
// Expected spend (utilization)
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthExpected {
  expected: number;
  collabs: number;
}

/** campaignId → monthKey → expected spend committed by that month's onboardings. */
export type ExpectedMap = Map<string, Map<string, MonthExpected>>;

interface PostRow {
  campaign_id: string | null;
  collab_id: string | null;
  inf_id: string | null;
  collab_number: number | null;
  post_id: string | null;
  id: number;
  onboard_date: string | null;
  workflow_status: string | null;
  collab_type: string | null;
  commercial_amount: number | string | null;
  order_id: string | null;
  is_test: boolean | null;
}

function collabKey(p: PostRow): string {
  if (p.collab_id) return p.collab_id;
  if (p.inf_id && p.collab_number != null)
    return `${p.inf_id}-C${Number(p.collab_number)}`;
  return p.post_id ?? `id:${p.id}`;
}

function normOrderId(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/^#+/, "").trim();
}

/**
 * Compute Expected per campaign per month from live posts + shopify_orders.
 * One collab counts once: commercial = Σ commercial_amount across its
 * deliverables (equal-split sums back to the agreed total); order value from
 * its order number. Pure-Barter collabs contribute order value only. Voided /
 * cancelled / not-yet-onboarded rows are excluded.
 */
export async function computeExpectedByCampaignMonth(
  supabase = createServiceClient(),
): Promise<ExpectedMap> {
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(
      "id, post_id, campaign_id, collab_id, inf_id, collab_number, onboard_date, workflow_status, collab_type, commercial_amount, order_id, is_test",
    )
    .not("campaign_id", "is", null)
    .not("onboard_date", "is", null)
    .limit(50_000);
  if (error) {
    console.error("[budget-versions] expected posts query:", error.message);
    return new Map();
  }

  const rows = ((data ?? []) as PostRow[]).filter(
    (p) => !p.is_test && isOnboardedActive(p.workflow_status),
  );

  // Group deliverable rows into collabs.
  interface Collab {
    campaignId: string;
    monthKey: string;
    collabType: string;
    commercial: number;
    orderId: string;
  }
  const collabs = new Map<string, Collab>();
  for (const p of rows) {
    const key = `${p.campaign_id}||${collabKey(p)}`;
    let c = collabs.get(key);
    if (!c) {
      c = {
        campaignId: String(p.campaign_id),
        monthKey: monthKeyIST(String(p.onboard_date)),
        collabType: (p.collab_type ?? "").toLowerCase(),
        commercial: 0,
        orderId: "",
      };
      collabs.set(key, c);
    }
    c.commercial += Number(p.commercial_amount ?? 0) || 0;
    if (!c.orderId && p.order_id) c.orderId = normOrderId(p.order_id);
    if (!c.collabType && p.collab_type)
      c.collabType = p.collab_type.toLowerCase();
  }

  // Order values for every distinct order number, in one query.
  const orderIds = [
    ...new Set(
      [...collabs.values()].map((c) => c.orderId).filter(Boolean),
    ),
  ];
  const orderValue = new Map<string, number>();
  for (let i = 0; i < orderIds.length; i += 500) {
    const slice = orderIds.slice(i, i + 500);
    const { data: orders, error: oErr } = await (supabase as any)
      .from("shopify_orders")
      .select("order_id, total_price")
      .in("order_id", slice);
    if (oErr) {
      console.error("[budget-versions] shopify orders query:", oErr.message);
      break;
    }
    for (const o of (orders ?? []) as Array<Record<string, unknown>>) {
      const k = normOrderId(o.order_id as string);
      if (k) orderValue.set(k, Number(o.total_price ?? 0) || 0);
    }
  }

  const out: ExpectedMap = new Map();
  for (const c of collabs.values()) {
    // Pure barter → order value only; anything with a paid component → both.
    const isPureBarter = c.collabType === "barter";
    const ov = c.orderId ? (orderValue.get(c.orderId) ?? 0) : 0;
    const spend = isPureBarter ? ov : c.commercial + ov;

    let byMonth = out.get(c.campaignId);
    if (!byMonth) {
      byMonth = new Map();
      out.set(c.campaignId, byMonth);
    }
    const cur = byMonth.get(c.monthKey) ?? { expected: 0, collabs: 0 };
    cur.expected += spend;
    cur.collabs += 1;
    byMonth.set(c.monthKey, cur);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Version helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAllVersions(
  supabase = createServiceClient(),
): Promise<BudgetVersion[]> {
  const { data, error } = await (supabase as any)
    .from("campaign_budget_versions")
    .select("*")
    .eq("is_test", false)
    .order("campaign_id")
    .order("version_number");
  if (error) {
    console.error("[budget-versions] fetch versions:", error.message);
    return [];
  }
  return (data ?? []) as BudgetVersion[];
}

export async function nextVersionNumber(
  supabase: ReturnType<typeof createServiceClient>,
  campaignId: string,
): Promise<number> {
  const { data } = await (supabase as any)
    .from("campaign_budget_versions")
    .select("version_number")
    .eq("campaign_id", campaignId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const max = (data as { version_number: number } | null)?.version_number;
  return max == null ? 0 : max + 1;
}

/** Does this campaign have any version awaiting Global Admin? (campaign gate) */
export async function hasPendingBudgetVersion(
  supabase: ReturnType<typeof createServiceClient>,
  campaignId: string,
): Promise<boolean> {
  const { data } = await (supabase as any)
    .from("campaign_budget_versions")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending_approval")
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Month rollover (cron on the 1st) + historical backfill
// ─────────────────────────────────────────────────────────────────────────────

export interface RolloverResult {
  month: string;
  closed: number;
  carried: number;
  carriedAmount: number;
}

/**
 * Roll ONE month boundary: close every approved version of `fromMonth` and
 * create a pre-approved carry_forward version in the next month for each
 * campaign's unused balance (allocated − expected). Idempotent: a campaign
 * that already has a carry_forward sourced in `fromMonth`'s versions is
 * skipped; already-closed versions stay closed.
 */
export async function rollBudgetMonth(
  supabase: ReturnType<typeof createServiceClient>,
  fromMonth: string,
  expectedMap: ExpectedMap,
  opts: { actor?: string } = {},
): Promise<RolloverResult> {
  const toMonth = nextMonthKey(fromMonth);
  const actor = opts.actor ?? "system · month rollover";

  const { data: verRows, error } = await (supabase as any)
    .from("campaign_budget_versions")
    .select("*")
    .eq("month", fromMonth)
    .in("status", ["approved", "closed"])
    .eq("is_test", false);
  if (error) throw new Error(`rollover read: ${error.message}`);
  const versions = (verRows ?? []) as BudgetVersion[];

  // Live campaigns only — closed/rejected campaigns don't roll forward.
  const campaignIds = [...new Set(versions.map((v) => v.campaign_id))];
  const liveCampaigns = new Set<string>();
  if (campaignIds.length > 0) {
    const { data: camps } = await (supabase as any)
      .from("campaigns")
      .select("campaign_id, status")
      .in("campaign_id", campaignIds);
    for (const c of (camps ?? []) as Array<Record<string, unknown>>) {
      const st = String(c.status ?? "").toLowerCase();
      if (st === "active" || st.startsWith("pending"))
        liveCampaigns.add(String(c.campaign_id));
    }
  }

  // Existing carry-forwards in toMonth (idempotency).
  const { data: existingCarry } = await (supabase as any)
    .from("campaign_budget_versions")
    .select("campaign_id")
    .eq("month", toMonth)
    .eq("kind", "carry_forward");
  const alreadyCarried = new Set(
    ((existingCarry ?? []) as Array<{ campaign_id: string }>).map(
      (r) => r.campaign_id,
    ),
  );

  let carried = 0;
  let carriedAmount = 0;
  const byCampaign = new Map<string, BudgetVersion[]>();
  for (const v of versions) {
    const list = byCampaign.get(v.campaign_id) ?? [];
    list.push(v);
    byCampaign.set(v.campaign_id, list);
  }

  for (const [campaignId, list] of byCampaign) {
    if (alreadyCarried.has(campaignId)) continue;
    if (!liveCampaigns.has(campaignId)) continue;
    const allocated = list.reduce((s, v) => s + Number(v.amount ?? 0), 0);
    const used =
      expectedMap.get(campaignId)?.get(fromMonth)?.expected ?? 0;
    const remaining = Math.max(0, allocated - used);
    if (remaining <= 0) continue;

    const sourceId = list.sort(
      (a, b) => b.version_number - a.version_number,
    )[0].id;
    const versionNumber = await nextVersionNumber(supabase, campaignId);
    const { error: insErr } = await (supabase as any)
      .from("campaign_budget_versions")
      .insert({
        campaign_id: campaignId,
        version_number: versionNumber,
        kind: "carry_forward",
        month: toMonth,
        amount: remaining,
        num_creators: 0,
        status: "approved",
        source_version_id: sourceId,
        note: `Unused ${monthLabel(fromMonth)} balance carried into ${monthLabel(toMonth)}`,
        created_by: actor,
        approved_by: actor,
        approved_at: new Date().toISOString(),
      });
    if (insErr) {
      console.error(
        `[budget-versions] carry insert ${campaignId}:`,
        insErr.message,
      );
      continue;
    }
    carried++;
    carriedAmount += remaining;
  }

  // Close the month that just ended.
  const { data: closedRows } = await (supabase as any)
    .from("campaign_budget_versions")
    .update({ status: "closed" })
    .eq("month", fromMonth)
    .eq("status", "approved")
    .select("id");

  return {
    month: fromMonth,
    closed: ((closedRows ?? []) as unknown[]).length,
    carried,
    carriedAmount,
  };
}
