import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { PostingFilters, PostingKpi, PostingRow } from "./types";

/**
 * Server-side fetch of the Posting table.
 * Mirrors legacy InfluencerBackend.js#getPostingTableData. Surfaces rows in
 * workflow_status ∈ {On Board, Order Sent, Posted} — matches the legacy
 * Posting view which keeps Posted rows visible for review/link verification.
 *
 * Service-role client (bypasses RLS) — page-level assertPermission already
 * gates access. Embeds use LEFT joins so posts with orphan campaign/creator
 * still appear instead of vanishing silently.
 */
export async function fetchPostingTable(
  filters: PostingFilters,
): Promise<PostingRow[]> {
  const supabase = createServiceClient();

  // Submission state → workflow_status set. Default (absent) = "no" = posting
  // work queue (On Board / Order Sent — not yet posted). "yes" = posting form
  // filled (Posted). The Stage dropdown (statusFilter) intersects via .eq.
  const submittedYes = filters.submitted === "yes";
  const POSTING_STATUS_SET = submittedYes
    ? ["Posted"]
    : ["On Board", "Order Sent"];

  let q = (supabase as any)
    .from("posts")
    .select(
      `
      post_id,
      post_id_short,
      workflow_status,
      content_type,
      nomenclature,
      onboard_date,
      posting_dispatch_date,
      post_date,
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
      post_link,
      download_link,
      raw_dump,
      partnership_id,
      est_delivery,
      deliverable_index,
      deliverable_type,
      collab_number,
      inf_id,
      campaign:campaigns ( campaign_id, campaign_name ),
      creator:creators  ( inf_id, username, inf_name, followers, category, state, profile_pic )
    `,
    )
    .in("workflow_status", POSTING_STATUS_SET);

  if (filters.campaign) q = q.eq("campaign_id", filters.campaign);
  if (filters.statusFilter) q = q.eq("workflow_status", filters.statusFilter);
  if (filters.creatorTier) q = q.eq("creators.category", filters.creatorTier);
  if (filters.adsRights) q = q.eq("ads_usage_rights", filters.adsRights);
  if (filters.onboardDateFrom)
    q = q.gte("onboard_date", filters.onboardDateFrom);
  if (filters.onboardDateTo) q = q.lte("onboard_date", filters.onboardDateTo);

  const { data, error } = await q
    .order("onboard_date", { ascending: false })
    .limit(500);
  if (error) throw error;

  const rows = (data ?? []) as unknown as PostingRow[];
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
      "[posting] instagram_cache avatar fallback:",
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
 * Distinct filter options for the Posting filter bar.
 */
export const fetchPostingFilterOptions = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const [campaigns, creators] = await Promise.all([
      supabase
        .from("campaigns")
        .select("campaign_id, campaign_name")
        .order("campaign_id", { ascending: false })
        .limit(200),
      supabase.from("creators").select("category").limit(2000),
    ]);

    const tiers = new Set<string>();
    ((creators.data ?? []) as any[]).forEach((c) => {
      if (c.category) tiers.add(c.category);
    });

    return {
      campaigns: campaigns.data ?? [],
      tiers: [...tiers].sort(),
      statuses: ["On Board", "Order Sent", "Posted"] as const,
      adsRights: ["Yes", "No"] as const,
    };
  },
  ["posting-filter-options"],
  { revalidate: 300, tags: ["posts", "creators", "campaigns"] },
);

/**
 * Posting KPI aggregation — closes the Analytics-Matrix gap (the Posting page
 * previously had no KPI strip).
 *
 * Counts COLLABS (parent rows only: deliverable_index IS NULL OR = 1) so the
 * filter mirrors features/accounts-hub/queries.ts. Definitions follow
 * Shrishti's matrix verbatim:
 *   - Total Posts Due       = Σ deliverables (reels + static + stories) across
 *                             the posting pipeline (On Board / Order Sent /
 *                             Posted).
 *   - Total Posts Submitted = collabs with workflow_status = Posted.
 *   - Posting Completion Rate = Submitted ÷ (Submitted + Pending) × 100.
 *   - Delayed Posts         = submitted collabs where post_date > est_delivery
 *                             (post date later than expected delivery).
 *   - Pending Posts         = collabs awaiting posting (On Board / Order Sent).
 */
export async function fetchPostingKpis(): Promise<PostingKpi> {
  const supabase = createServiceClient();

  const PIPELINE_SET = ["On Board", "Order Sent", "Posted"];

  const { data, error } = await (supabase as any)
    .from("posts")
    .select("workflow_status, reels, static_posts, stories, post_date, est_delivery")
    .in("workflow_status", PIPELINE_SET)
    .or("deliverable_index.is.null,deliverable_index.eq.1")
    .limit(20000);

  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  let totalPostsDue = 0;
  let totalPostsSubmitted = 0;
  let delayedPosts = 0;
  let pendingPosts = 0;

  for (const r of rows) {
    const status = String(r.workflow_status ?? "").trim();
    totalPostsDue +=
      (Number(r.reels ?? 0) || 0) +
      (Number(r.static_posts ?? 0) || 0) +
      (Number(r.stories ?? 0) || 0);

    if (status === "Posted") {
      totalPostsSubmitted++;
      const postDate = r.post_date ? new Date(String(r.post_date)) : null;
      const estDelivery = r.est_delivery
        ? new Date(String(r.est_delivery))
        : null;
      if (
        postDate &&
        estDelivery &&
        !Number.isNaN(postDate.getTime()) &&
        !Number.isNaN(estDelivery.getTime()) &&
        postDate.getTime() > estDelivery.getTime()
      ) {
        delayedPosts++;
      }
    } else {
      // On Board / Order Sent → awaiting posting.
      pendingPosts++;
    }
  }

  const denom = totalPostsSubmitted + pendingPosts;
  const completionRate =
    denom > 0 ? Math.round((totalPostsSubmitted / denom) * 1000) / 10 : 0;

  return {
    totalPostsDue,
    totalPostsSubmitted,
    completionRate,
    delayedPosts,
    pendingPosts,
  };
}
