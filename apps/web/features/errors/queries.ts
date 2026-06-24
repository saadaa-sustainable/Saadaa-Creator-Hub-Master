import { createServiceClient } from "@/lib/supabase/server";
import type {
  AuditViolation,
  DataHealth,
  ErrorPortalData,
  ErrorPortalSummary,
  MissingEmailRow,
  SystemErrorRow,
} from "./types";

/**
 * Error Portal data fetcher — mirrors legacy `runErrorAudit` + reads
 * `system_errors` table for runtime failures. Returns empty payload on
 * Supabase errors so the route doesn't 500.
 */

const POSTS_SELECT = [
  "post_id",
  "post_id_short",
  "inf_id",
  "collab_id",
  "collab_number",
  "username",
  "campaign_id",
  "workflow_status",
  "order_id",
  "tracking_id",
  "post_link",
  "post_date",
  "onboard_date",
  "payment_status",
  "bank_number",
  "ifsc",
  "email",
  "collab_email_sent_at",
  "deliverable_index",
].join(",");

const PAYMENTS_SELECT = ["post_id", "utr", "status"].join(",");

const SHOPIFY_SELECT = ["order_id", "order_placed_date"].join(",");

const TWO_DAYS_MS = 2 * 86_400_000;

function emptyData(): ErrorPortalData {
  return {
    summary: {
      high: 0,
      medium: 0,
      low: 0,
      apiFails: 0,
      missingEmail: 0,
      metaFetchFails: 0,
      metaProfileUnavailable: 0,
    },
    health: {
      reachOut: 0,
      onBoard: 0,
      posted: 0,
      delivered: 0,
      missingBank: 0,
      missingEmail: 0,
      missingTracking: 0,
      missingOrder: 0,
      missingPostLink: 0,
      paymentsDue: 0,
      totalPaidOut: 0,
      totalCreators: 0,
    },
    violations: [],
    systemErrors: [],
    missingEmails: [],
    lastScannedAt: new Date().toISOString(),
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

export async function fetchErrorPortalData(): Promise<ErrorPortalData> {
  const supabase = createServiceClient();

  const [postsRes, paymentsRes, ordersRes, sysErrRes, creatorsCountRes] =
    await Promise.all([
      (supabase as any).from("posts").select(POSTS_SELECT).limit(10_000),
      (supabase as any).from("payments").select(PAYMENTS_SELECT).limit(10_000),
      (supabase as any).from("shopify_orders").select(SHOPIFY_SELECT).limit(10_000),
      (supabase as any)
        .from("system_errors")
        .select("id, type, key, message, source, resolved, created_at, resolved_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(500),
      (supabase as any)
        .from("creators")
        .select("inf_id", { count: "exact", head: true }),
    ]);

  if (postsRes.error) {
    console.error("[errors] posts:", postsRes.error);
    return emptyData();
  }

  const posts = (postsRes.data ?? []) as Array<Record<string, unknown>>;
  const payments = (paymentsRes.data ?? []) as Array<Record<string, unknown>>;
  const orders = (ordersRes.data ?? []) as Array<Record<string, unknown>>;
  const sysErrors = (sysErrRes.data ?? []) as Array<SystemErrorRow>;
  const totalCreators = (creatorsCountRes.count ?? 0) as number;

  // Build lookup maps.
  const postIdSet = new Set(
    posts.map((p) => String(p.post_id ?? "").trim()).filter(Boolean),
  );
  const postByPostId = new Map<string, Record<string, unknown>>();
  for (const p of posts) {
    const id = String(p.post_id ?? "").trim();
    if (id) postByPostId.set(id, p);
  }
  const orderPlacedById = new Map<string, Date | null>();
  for (const o of orders) {
    const oid = String(o.order_id ?? "").trim();
    if (!oid) continue;
    const d = o.order_placed_date ? new Date(String(o.order_placed_date)) : null;
    orderPlacedById.set(oid, d && Number.isFinite(d.getTime()) ? d : null);
  }

  const violations: AuditViolation[] = [];

  // Rule 1: INVALID_POST_ID — payment.post_id not in posts.
  for (const pay of payments) {
    const pid = String(pay.post_id ?? "").trim();
    if (pid && !postIdSet.has(pid)) {
      violations.push({
        type: "INVALID_POST_ID",
        severity: "HIGH",
        key: pid,
        details: `Payment references missing post ${pid}`,
      });
    }
  }

  // Rule 2: DUPLICATE_UTR — same UTR appears in two distinct payments.
  const utrSeen = new Map<string, string>();
  for (const pay of payments) {
    const utr = String(pay.utr ?? "").trim();
    if (!utr) continue;
    const pid = String(pay.post_id ?? "").trim();
    const prior = utrSeen.get(utr);
    if (prior && prior !== pid) {
      violations.push({
        type: "DUPLICATE_UTR",
        severity: "HIGH",
        key: utr,
        details: `UTR ${utr} reused across posts ${prior} & ${pid}`,
      });
    } else if (!prior) {
      utrSeen.set(utr, pid);
    }
  }

  // Rule 3: PAYMENT_BEFORE_POSTING — payment exists but post not yet posted/delivered.
  for (const pay of payments) {
    const pid = String(pay.post_id ?? "").trim();
    if (!pid) continue;
    const post = postByPostId.get(pid);
    if (!post) continue;
    const wf = statusKey(post.workflow_status);
    if (wf !== "posted" && wf !== "delivered") {
      violations.push({
        type: "PAYMENT_BEFORE_POSTING",
        severity: "MEDIUM",
        key: pid,
        details: `Payment recorded but ${pid} is ${post.workflow_status ?? "—"}`,
      });
    }
  }

  // Health counters + Rules 4 & 5.
  const health: DataHealth = {
    reachOut: 0,
    onBoard: 0,
    posted: 0,
    delivered: 0,
    missingBank: 0,
    missingEmail: 0,
    missingTracking: 0,
    missingOrder: 0,
    missingPostLink: 0,
    paymentsDue: 0,
    totalPaidOut: 0,
    totalCreators,
  };

  const missingEmails: MissingEmailRow[] = [];
  const PARENT_STATUSES = new Set(["on board", "order sent", "posted", "delivered"]);
  const now = Date.now();

  for (const p of posts) {
    const wf = statusKey(p.workflow_status);
    if (wf === "reach out") health.reachOut++;
    else if (wf === "on board" || wf === "order sent") health.onBoard++;
    else if (wf === "posted") health.posted++;
    else if (wf === "delivered") health.delivered++;

    const paymentStatus = statusKey(p.payment_status);
    if (paymentStatus === "due") health.paymentsDue++;
    if (paymentStatus === "paid" || paymentStatus === "done")
      health.totalPaidOut++;

    if (!hasValue(p.email)) health.missingEmail++;
    if (!hasValue(p.bank_number) || !hasValue(p.ifsc)) health.missingBank++;
    if (!hasValue(p.order_id)) health.missingOrder++;
    if (hasValue(p.order_id) && !hasValue(p.tracking_id)) {
      health.missingTracking++;
      // Rule 5: MISSING_TRACKING — only flag if order > 2 days old.
      const orderId = String(p.order_id).trim();
      const placed = orderPlacedById.get(orderId);
      if (placed && now - placed.getTime() > TWO_DAYS_MS) {
        violations.push({
          type: "MISSING_TRACKING",
          severity: "LOW",
          key: String(p.post_id ?? ""),
          details: `${p.post_id_short ?? p.post_id} has order ${orderId} but no tracking yet`,
        });
      }
    }
    if (
      (wf === "posted" || wf === "delivered") &&
      !hasValue(p.post_link)
    ) {
      health.missingPostLink++;
    }

    // Rule 4: MISSING_BANK_DETAILS — payment paid but bank missing.
    if (
      (paymentStatus === "paid" || paymentStatus === "done") &&
      (!hasValue(p.bank_number) || !hasValue(p.ifsc))
    ) {
      violations.push({
        type: "MISSING_BANK_DETAILS",
        severity: "MEDIUM",
        key: String(p.post_id ?? ""),
        details: `${p.post_id_short ?? p.post_id} marked paid but missing bank info`,
      });
    }

    // MISSING_COLLAB_EMAIL — parent only, onboarded/posted/delivered,
    // collab_email_sent_at IS NULL.
    const isParent =
      p.deliverable_index == null || Number(p.deliverable_index) === 1;
    if (
      isParent &&
      PARENT_STATUSES.has(wf) &&
      !hasValue(p.collab_email_sent_at)
    ) {
      const meInfId = (p.inf_id as string | null) ?? null;
      missingEmails.push({
        post_id: String(p.post_id ?? ""),
        inf_id: meInfId,
        collab_id:
          (p.collab_id as string | null) ||
          (meInfId ? `${meInfId}-C${Number(p.collab_number ?? 1)}` : null),
        inf_name: null,
        username: (p.username as string | null) ?? null,
        campaign_id: (p.campaign_id as string | null) ?? null,
        workflow_status: String(p.workflow_status ?? ""),
        onboard_date: (p.onboard_date as string | null) ?? null,
      });
    }
  }

  // Pull creator names for the missing-email rows.
  if (missingEmails.length > 0) {
    const infIds = [
      ...new Set(missingEmails.map((m) => m.inf_id).filter(Boolean)),
    ] as string[];
    if (infIds.length > 0) {
      const { data: creators } = await (supabase as any)
        .from("creators")
        .select("inf_id, inf_name")
        .in("inf_id", infIds)
        .limit(2000);
      const nameMap = new Map<string, string>();
      for (const c of (creators ?? []) as Array<{
        inf_id: string | null;
        inf_name: string | null;
      }>) {
        const id = String(c.inf_id ?? "").trim();
        if (id && c.inf_name) nameMap.set(id, c.inf_name);
      }
      for (const m of missingEmails) {
        if (m.inf_id) m.inf_name = nameMap.get(m.inf_id) ?? null;
      }
    }
  }

  // Summary buckets.
  const summary: ErrorPortalSummary = {
    high: violations.filter((v) => v.severity === "HIGH").length,
    medium: violations.filter((v) => v.severity === "MEDIUM").length,
    low: violations.filter((v) => v.severity === "LOW").length,
    apiFails: sysErrors.filter((e) =>
      ["ig_fetch", "apify_fail"].includes(e.type),
    ).length,
    missingEmail: missingEmails.length,
    metaFetchFails: sysErrors.filter((e) => e.type === "meta_fetch_failed")
      .length,
    metaProfileUnavailable: sysErrors.filter(
      (e) => e.type === "meta_profile_unavailable",
    ).length,
  };

  return {
    summary,
    health,
    violations,
    systemErrors: sysErrors,
    missingEmails,
    lastScannedAt: new Date().toISOString(),
  };
}
