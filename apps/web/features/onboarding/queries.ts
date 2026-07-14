import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { OnboardingFilters, OnboardingKpi, OnboardingRow } from "./types";

/**
 * Server-side fetch of the Onboarding table.
 * Mirrors legacy InfluencerBackend.js#getOnboardingTableData + the
 * Supabase-first refactor that landed in §5.2.
 *
 * Service-role client (bypasses RLS) — page-level assertPermission already
 * gates access. Embed uses LEFT joins (no `!inner`) so posts with orphan
 * campaign/creator still appear instead of vanishing silently.
 */
export async function fetchOnboardingTable(
  filters: OnboardingFilters,
): Promise<OnboardingRow[]> {
  const supabase = createServiceClient();

  // Submission state → workflow_status set. Default (absent) = "no" = the
  // not-yet-onboarded work queue (Reach Out). "yes" = onboarding form filled
  // (On Board onward). The detailed Status dropdown (statusFilter) still
  // intersects on top via .eq below.
  const submittedYes = filters.submitted === "yes";
  const ONBOARDING_STATUS_SET = submittedYes
    ? ["On Board", "Order Sent", "Posted", "Delivered"]
    : ["Reach Out"];

  let q = (supabase as any)
    .from("posts")
    .select(
      `
      id,
      post_id,
      post_id_short,
      workflow_status,
      content_type,
      nomenclature,
      reach_out_date,
      reachout_direction,
      onboard_date,
      posting_dispatch_date,
      reels,
      static_posts,
      stories,
      ads_usage_rights,
      commercial_amount,
      barter_amount,
      collab_type,
      order_id,
      order_status,
      tracking_id,
      garment_qty,
      garments_sent,
      payment_status,
      email,
      est_delivery,
      collab_email_sent_at,
      collab_email_skipped,
      deliverable_index,
      deliverable_type,
      collab_number,
      collab_id,
      inf_id,
      logged_by,
      onboarded_by,
      campaign:campaigns ( campaign_id, campaign_name ),
      creator:creators  ( inf_id, username, inf_name, followers, category, state, profile_pic, instagram_link, is_active )
    `,
    )
    .in("workflow_status", ONBOARDING_STATUS_SET);

  if (filters.campaign) q = q.eq("campaign_id", filters.campaign);
  if (filters.statusFilter) q = q.eq("workflow_status", filters.statusFilter);
  if (filters.creatorTier) q = q.eq("creators.category", filters.creatorTier);
  if (filters.region) q = q.eq("creators.state", filters.region);
  // Team member who logged the reach-out (stable; never overwritten).
  // Submitted view filters by who ONBOARDED; the work queue by who reached out.
  // Same URL param either way — the filter relabels itself.
  if (filters.reachedOutBy)
    q = q.eq(
      submittedYes ? "onboarded_by" : "logged_by",
      filters.reachedOutBy,
    );
  if (filters.contentType) q = q.eq("content_type", filters.contentType);
  if (filters.collabType) q = q.eq("collab_type", filters.collabType);
  // Submitted view filters on the ONBOARDED date; the work queue on reach-out.
  // Same URL params either way — the picker relabels itself.
  const dateCol = submittedYes ? "onboard_date" : "reach_out_date";
  if (filters.reachoutDateFrom) q = q.gte(dateCol, filters.reachoutDateFrom);
  if (filters.reachoutDateTo) q = q.lte(dateCol, filters.reachoutDateTo);

  const { data, error } = await q
    // Newest reach-outs first; date-less rows sink to the bottom (SQL DESC
    // defaults to NULLS FIRST, which floated them to the top). id desc breaks
    // same-day ties so the latest entries lead.
    .order("reach_out_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    // High cap — the July ingests alone exceed the old 500, which silently
    // hid older reach-outs from the queue AND its in-memory search.
    .limit(10_000);
  if (error) throw error;

  let rows = (data ?? []) as unknown as OnboardingRow[];

  // Free-text search (in-memory across the fetched page) — id / name / username
  // / IG URL / email. Cross-table OR search is awkward in PostgREST, so we filter
  // the bounded result set here (same pattern as Accounts Hub).
  const needle = (filters.q ?? "").trim().toLowerCase();
  if (needle) {
    rows = rows.filter((r) => {
      const fields = [
        r.post_id,
        r.post_id_short,
        r.collab_id,
        r.order_id,
        r.campaign?.campaign_id,
        r.campaign?.campaign_name,
        r.creator?.inf_name,
        r.creator?.username,
        r.creator?.instagram_link,
        r.email,
      ];
      return fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
    });
  }

  // Prior-collab history for the Reach Out rows — gives the team a glance at how
  // many times a creator collaborated before + the next C the onboard will mint.
  // Only reach-out rows carry it; onboarded rows already show their own collab.
  const reachOutInfIds = [
    ...new Set(
      rows
        .filter((row) => row.workflow_status === "Reach Out")
        .map((row) => (row.inf_id ?? row.creator?.inf_id ?? "").trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const priorByInf = await fetchPriorCollabSummary(reachOutInfIds);
  const stampPrior = (row: OnboardingRow): OnboardingRow => {
    if (row.workflow_status !== "Reach Out") return row;
    const infId = (row.inf_id ?? row.creator?.inf_id ?? "").trim();
    const prior = infId ? priorByInf.get(infId) : undefined;
    if (!prior) return row;
    return {
      ...row,
      _priorCollabCount: prior.count,
      _priorCollabIds: prior.ids,
      _nextCollab: prior.next,
    };
  };
  rows = rows.map(stampPrior);

  // Shopify INTERNAL order ids → direct "View Order" admin deep links.
  // Keyed by the order NUMBER both sides store; rows the edge fn hasn't
  // re-synced yet stay unstamped and the link falls back to admin search.
  const orderNumbers = [
    ...new Set(
      rows
        .map((row) => String(row.order_id ?? "").replace(/^#+/, "").trim())
        .filter(Boolean),
    ),
  ];
  if (orderNumbers.length > 0) {
    const { data: shopRows, error: shopErr } = await (supabase as any)
      .from("shopify_orders")
      .select("order_id, shopify_internal_id")
      .in("order_id", orderNumbers);
    if (shopErr) {
      console.error("[onboarding] shopify internal ids:", shopErr.message);
    } else {
      const internalByOrder = new Map<string, number | string>();
      for (const s of (shopRows ?? []) as Array<Record<string, unknown>>) {
        const key = String(s.order_id ?? "").replace(/^#+/, "").trim();
        if (key && s.shopify_internal_id != null)
          internalByOrder.set(key, s.shopify_internal_id as number | string);
      }
      rows = rows.map((row) => {
        const key = String(row.order_id ?? "").replace(/^#+/, "").trim();
        const internal = key ? internalByOrder.get(key) : undefined;
        return internal != null
          ? { ...row, _shopifyInternalId: internal }
          : row;
      });
    }
  }

  const missingProfileUsernames = [
    ...new Set(
      rows
        .filter((row) => row.creator && !row.creator.profile_pic)
        .map((row) => row.creator?.username?.trim().toLowerCase())
        .filter((username): username is string => Boolean(username)),
    ),
  ];

  if (missingProfileUsernames.length === 0) return rows;

  const { data: cacheRows, error: cacheErr } = await (supabase as any)
    .from("instagram_cache")
    .select("*")
    .in("username", missingProfileUsernames);

  if (cacheErr) {
    console.error(
      "[onboarding] instagram_cache avatar fallback:",
      cacheErr.message,
    );
    return rows;
  }

  const cacheProfileByUsername = new Map<string, string>();
  for (const raw of (cacheRows ?? []) as Record<string, unknown>[]) {
    const username =
      typeof raw.username === "string" ? raw.username.trim().toLowerCase() : "";
    if (!username) continue;

    const payload = (raw.raw_json ??
      raw.profile_data ??
      raw.ig_data ??
      {}) as Record<string, unknown>;
    const profilePic = [
      raw.profile_pic,
      raw.pic,
      raw.profilePicUrl,
      raw.profile_pic_url,
      raw.profilePicUrlHD,
      payload.profile_pic,
      payload.pic,
      payload.profilePicUrl,
      payload.profile_pic_url,
      payload.profilePicUrlHD,
    ].find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

    if (profilePic) cacheProfileByUsername.set(username, profilePic);
  }

  return rows.map((row) => {
    const username = row.creator?.username?.trim().toLowerCase();
    const profilePic = username ? cacheProfileByUsername.get(username) : null;
    if (!profilePic || !row.creator || row.creator.profile_pic) return row;
    return {
      ...row,
      creator: {
        ...row.creator,
        profile_pic: profilePic,
      },
    };
  });
}

/**
 * Prior-collaboration summary for a set of inf_ids — wraps the
 * `prior_collab_summary` RPC, which counts COMPLETED collabs across
 * `posts` ∪ `historic_posts` and returns the C number the next onboard will
 * mint (already honouring the reach-out-only-historic → C2 rule). Keyed by
 * inf_id so the onboarding board can stamp each Reach Out row in one round-trip.
 *
 * Returns an empty Map when `infIds` is empty (no RPC call).
 */
export async function fetchPriorCollabSummary(
  infIds: string[],
): Promise<Map<string, { count: number; ids: string[]; next: number }>> {
  const out = new Map<string, { count: number; ids: string[]; next: number }>();
  if (infIds.length === 0) return out;

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any).rpc("prior_collab_summary", {
    p_inf_ids: infIds,
  });
  if (error) {
    console.error("[onboarding] prior_collab_summary RPC:", error.message);
    return out;
  }

  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const infId = String(r.inf_id ?? "").trim();
    if (!infId) continue;
    out.set(infId, {
      count: Number(r.prior_count ?? 0) || 0,
      ids: Array.isArray(r.collab_ids) ? (r.collab_ids as string[]) : [],
      next: Number(r.next_collab ?? 1) || 1,
    });
  }
  return out;
}

/**
 * Distinct filter options pulled from live tables — used by the filter bar.
 * Uses the service-role client because `unstable_cache` runs outside the
 * request scope, so `cookies()` is not available. Filter options are
 * non-sensitive and global.
 */
export const fetchOnboardingFilterOptions = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const [campaigns, creators, posts] = await Promise.all([
      supabase
        .from("campaigns")
        .select("campaign_id, campaign_name")
        .order("campaign_id", { ascending: false })
        .limit(200),
      supabase.from("creators").select("state, category").limit(2000),
      (supabase as any)
        .from("posts")
        .select("logged_by, content_type")
        .limit(20000),
    ]);

    const tiers = new Set<string>();
    const regions = new Set<string>();
    ((creators.data ?? []) as any[]).forEach((c) => {
      if (c.category) tiers.add(c.category);
      if (c.state) regions.add(c.state);
    });

    // Team members who logged reach-outs + content types in play.
    const teamMembers = new Set<string>();
    const contentTypes = new Set<string>();
    ((posts.data ?? []) as any[]).forEach((p) => {
      const lb = (p.logged_by ?? "").trim();
      if (lb) teamMembers.add(lb);
      const ct = (p.content_type ?? "").trim();
      if (ct) contentTypes.add(ct);
    });

    return {
      campaigns: campaigns.data ?? [],
      tiers: [...tiers].sort(),
      regions: [...regions].sort(),
      teamMembers: [...teamMembers].sort(),
      contentTypes: [...contentTypes].sort(),
      statuses: [
        "Reach Out",
        "On Board",
        "Order Sent",
        "Posted",
        "Delivered",
      ] as const,
    };
  },
  ["onboarding-filter-options"],
  { revalidate: 300, tags: ["posts", "creators", "campaigns"] },
);

/**
 * Onboarding KPI aggregation — closes the gap vs Shrishti's Analytics KPI
 * Matrix (the Onboarding page previously had no KPI strip).
 *
 * Counts COLLABS, not child deliverable rows, so the parent filter
 * (`deliverable_index IS NULL OR = 1`) mirrors features/accounts-hub/queries.ts
 * and features/order-status/queries.ts. Avg deliverable counts and ad-rights
 * splits are therefore per-collab, matching how operators read the board.
 *
 * Definitions (Shrishti, verbatim where given):
 *   - Total Onboarded      = collabs whose onboarding form is filled
 *                            (workflow_status ∈ On Board / Order Sent /
 *                             Posted / Delivered).
 *   - Pending Onboardings  = collabs still in Reach Out (onboarding status
 *                            pending).
 *   - Completion Rate      = Onboarded ÷ (Onboarded + Pending) × 100.
 *   - Ad Rights Selected / No Ad Rights = onboarded collabs split on
 *                            ads_usage_rights = Yes vs not.
 *   - Avg Reels/Story/Static = mean per-collab deliverable counts across
 *                            onboarded collabs.
 *   - Shopify Validation Success Rate = of onboarded collabs that entered an
 *                            order_id, the share matched to a shopify_orders
 *                            row (mirrors the order-status validation join).
 */
export async function fetchOnboardingKpis(
  filters: OnboardingFilters = {},
): Promise<OnboardingKpi> {
  const supabase = createServiceClient();

  const ONBOARDED_SET = ["On Board", "Order Sent", "Posted", "Delivered"];

  // When a "Reached out by" team member is selected, scope every KPI to that
  // member's reach-outs (logged_by is the stable reach-out logger). Otherwise
  // the KPIs reflect the whole corpus.
  const member = (filters.reachedOutBy ?? "").trim();
  const scope = <T>(q: T): T =>
    member ? ((q as any).eq("logged_by", member) as T) : q;

  // Collab ID model: fetch ALL deliverable rows; we group by collab_id in JS so
  // every KPI counts COLLABS (not individual deliverable rows). Avg deliverable
  // counts sum reels/static/stories across each collab's deliverables.
  const [onboardedRes, pendingRes, shopifyRes] = await Promise.all([
    scope(
      (supabase as any)
        .from("posts")
        .select(
          "inf_id, collab_number, collab_id, ads_usage_rights, reels, static_posts, stories, order_id, collab_email_sent_at, collab_email_skipped",
        )
        .in("workflow_status", ONBOARDED_SET)
        .limit(20000),
    ),
    scope(
      (supabase as any)
        .from("posts")
        .select("inf_id, collab_number, collab_id, post_id")
        .eq("workflow_status", "Reach Out")
        .limit(20000),
    ),
    (supabase as any).from("shopify_orders").select("order_id").limit(50000),
  ]);

  if (onboardedRes.error) throw onboardedRes.error;

  const onboardedDeliverables = (onboardedRes.data ?? []) as Array<
    Record<string, unknown>
  >;
  const pendingDeliverables = (pendingRes.data ?? []) as Array<
    Record<string, unknown>
  >;

  // collab_id grouping key with legacy fallback.
  const collabKeyOf = (r: Record<string, unknown>): string => {
    const cid = r.collab_id as string | null;
    if (cid) return cid;
    const inf = r.inf_id as string | null;
    const cn = r.collab_number as number | null;
    // No collab until an order is mapped — key reach-out rows by post_id, never
    // a fabricated "-C1".
    if (inf && cn != null) return `${inf}-C${cn}`;
    return (r.post_id as string) ?? JSON.stringify(r);
  };

  const normalizeOrderId = (raw: unknown) =>
    String(raw ?? "")
      .replace(/^#+/, "")
      .trim()
      .toLowerCase();

  const shopifyOrderIds = new Set<string>();
  for (const s of (shopifyRes?.data ?? []) as Array<Record<string, unknown>>) {
    const key = normalizeOrderId(s.order_id);
    if (key) shopifyOrderIds.add(key);
  }

  // Aggregate onboarded deliverables into per-collab buckets.
  interface CollabAgg {
    reels: number;
    static: number;
    stories: number;
    adsRights: boolean;
    orderId: string | null;
    emailSent: boolean;
    emailSkipped: boolean;
  }
  const collabs = new Map<string, CollabAgg>();
  for (const r of onboardedDeliverables) {
    const key = collabKeyOf(r);
    let agg = collabs.get(key);
    if (!agg) {
      agg = {
        reels: 0,
        static: 0,
        stories: 0,
        adsRights: false,
        orderId: null,
        emailSent: false,
        emailSkipped: false,
      };
      collabs.set(key, agg);
    }
    agg.reels += Number(r.reels ?? 0) || 0;
    agg.static += Number(r.static_posts ?? 0) || 0;
    agg.stories += Number(r.stories ?? 0) || 0;
    const adv = String(r.ads_usage_rights ?? "").trim().toLowerCase();
    if (adv && !["no", "n/a", "none", "0", "false"].includes(adv)) {
      agg.adsRights = true;
    }
    const oid = normalizeOrderId(r.order_id);
    if (oid && !agg.orderId) agg.orderId = oid;
    if (r.collab_email_sent_at) agg.emailSent = true;
    if (r.collab_email_skipped === true) agg.emailSkipped = true;
  }

  // Pending collabs = distinct collab_ids still in Reach Out.
  const pendingCollabKeys = new Set<string>();
  for (const r of pendingDeliverables) pendingCollabKeys.add(collabKeyOf(r));

  const totalOnboarded = collabs.size;
  const pendingOnboardings = pendingCollabKeys.size;

  let adRightsSelected = 0;
  let pendingEmail = 0;
  let reelsSum = 0;
  let staticSum = 0;
  let storiesSum = 0;
  let withOrderId = 0;
  let shopifyMatched = 0;

  for (const agg of collabs.values()) {
    if (agg.adsRights) adRightsSelected++;
    reelsSum += agg.reels;
    staticSum += agg.static;
    storiesSum += agg.stories;
    if (agg.orderId) {
      withOrderId++;
      if (shopifyOrderIds.has(agg.orderId)) shopifyMatched++;
    }
    // Pending collab email: onboarded but not yet sent and not intentionally skipped.
    if (!agg.emailSent && !agg.emailSkipped) pendingEmail++;
  }

  const denom = totalOnboarded + pendingOnboardings;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    totalOnboarded,
    pendingOnboardings,
    completionRate: denom > 0 ? round1((totalOnboarded / denom) * 100) : 0,
    adRightsSelected,
    noAdRights: totalOnboarded - adRightsSelected,
    pendingEmail,
    avgReels: totalOnboarded > 0 ? round1(reelsSum / totalOnboarded) : 0,
    avgStatic: totalOnboarded > 0 ? round1(staticSum / totalOnboarded) : 0,
    avgStories: totalOnboarded > 0 ? round1(storiesSum / totalOnboarded) : 0,
    shopifyValidationRate:
      withOrderId > 0 ? round1((shopifyMatched / withOrderId) * 100) : 0,
    shopifyMatched,
    shopifyWithOrderId: withOrderId,
  };
}
