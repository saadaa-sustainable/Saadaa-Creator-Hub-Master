import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { PostingFilters, PostingKpi, PostingRow } from "./types";

/**
 * Canonical "has ad usage rights" truthiness — identical to
 * features/accounts-hub/queries.ts ADS_YES. `ads_usage_rights` is free-text and
 * commonly holds a DURATION ("11 months"), so any non-empty, non-trivial value
 * counts as "Yes".
 */
const ADS_YES = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  return !["", "no", "n/a", "none", "0", "false"].includes(
    raw.trim().toLowerCase(),
  );
};

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
      partnership_status,
      est_delivery,
      deliverable_index,
      deliverable_type,
      collab_number,
      collab_id,
      inf_id,
      campaign:campaigns ( campaign_id, campaign_name ),
      creator:creators  ( inf_id, username, inf_name, followers, category, state, profile_pic, instagram_link, is_active )
    `,
    )
    .in("workflow_status", POSTING_STATUS_SET);

  if (filters.campaign) q = q.eq("campaign_id", filters.campaign);
  if (filters.statusFilter) q = q.eq("workflow_status", filters.statusFilter);
  if (filters.creatorTier) q = q.eq("creators.category", filters.creatorTier);
  // Team member who onboarded the collab.
  if (filters.onboardedBy) q = q.eq("onboarded_by", filters.onboardedBy);
  if (filters.contentType) q = q.eq("content_type", filters.contentType);
  if (filters.collabType) q = q.eq("collab_type", filters.collabType);
  // Ad-rights filter is applied in JS below (see ADS_YES). ads_usage_rights is
  // free-text and frequently stores a DURATION ("11 months", "12 Months", …)
  // rather than the literal "Yes", so a PostgREST `.eq("ads_usage_rights","Yes")`
  // silently dropped every valid duration. We instead match on TRUTHINESS,
  // mirroring features/accounts-hub/queries.ts ADS_YES.
  // Submitted view filters on the POSTED date; the work queue on onboard date.
  // Same URL params either way — the picker relabels itself.
  const dateCol = submittedYes ? "post_date" : "onboard_date";
  if (filters.onboardDateFrom) q = q.gte(dateCol, filters.onboardDateFrom);
  if (filters.onboardDateTo) q = q.lte(dateCol, filters.onboardDateTo);

  const { data, error } = await q
    .order("onboard_date", { ascending: false })
    .limit(500);
  if (error) throw error;

  let rows = (data ?? []) as unknown as PostingRow[];

  // Ad-rights filter (truthiness): a value counts as "Yes" when it's non-empty
  // AND not in the trivial set. Applied here in JS so free-text durations
  // ("11 months") correctly land under the "Yes" filter, and only the
  // empty/trivial rows land under "No".
  const adsFilter = filters.adsRights?.trim().toLowerCase();
  if (adsFilter === "yes") {
    rows = rows.filter((r) => ADS_YES(r.ads_usage_rights));
  } else if (adsFilter === "no") {
    rows = rows.filter((r) => !ADS_YES(r.ads_usage_rights));
  }

  // Free-text search (in-memory) — id / name / username / IG URL / post link.
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
        r.post_link,
      ];
      return fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
    });
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
    const [campaigns, creators, posts] = await Promise.all([
      supabase
        .from("campaigns")
        .select("campaign_id, campaign_name")
        .order("campaign_id", { ascending: false })
        .limit(200),
      supabase.from("creators").select("category").limit(2000),
      (supabase as any)
        .from("posts")
        .select("onboarded_by, content_type, workflow_status")
        .in("workflow_status", ["On Board", "Order Sent", "Posted"])
        .limit(20000),
    ]);

    const tiers = new Set<string>();
    ((creators.data ?? []) as any[]).forEach((c) => {
      if (c.category) tiers.add(c.category);
    });

    // Team members who onboarded + content types among the posting candidates.
    const teamMembers = new Set<string>();
    const contentTypes = new Set<string>();
    ((posts.data ?? []) as any[]).forEach((p) => {
      const ob = (p.onboarded_by ?? "").trim();
      if (ob) teamMembers.add(ob);
      const ct = (p.content_type ?? "").trim();
      if (ct) contentTypes.add(ct);
    });

    return {
      campaigns: campaigns.data ?? [],
      tiers: [...tiers].sort(),
      teamMembers: [...teamMembers].sort(),
      contentTypes: [...contentTypes].sort(),
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
 * Counts PER POST_ID (each posts row is one deliverable / one post_id). One row
 * = one deliverable, so all tiles count rows directly — no per-collab grouping
 * and no per-content-piece (reels+static+stories) summation:
 *   - Posts Due       = post_ids in the pipeline NOT yet posted
 *                       (workflow_status ∈ {On Board, Order Sent}) — i.e. the
 *                       deliverables still to be submitted.
 *   - Submitted       = post_ids with workflow_status = Posted.
 *   - Completion Rate = Submitted ÷ (Submitted + Due) × 100 = Submitted ÷ total.
 *   - Delayed Posts   = submitted post_ids whose post_date > est_delivery.
 */
export async function fetchPostingKpis(
  filters: PostingFilters = {},
): Promise<PostingKpi> {
  const supabase = createServiceClient();

  const PIPELINE_SET = ["On Board", "Order Sent", "Posted"];

  // When an "Onboarded by" team member is selected, scope every KPI to that
  // member's onboarded collabs. Otherwise the KPIs reflect the whole pipeline.
  const member = (filters.onboardedBy ?? "").trim();

  // One row = one post_id (deliverable). Fetch every pipeline deliverable and
  // count rows by submission state — Posted vs not-yet-Posted.
  let q = (supabase as any)
    .from("posts")
    .select("workflow_status, post_date, est_delivery")
    .in("workflow_status", PIPELINE_SET)
    .limit(20000);
  if (member) q = q.eq("onboarded_by", member);
  const { data, error } = await q;

  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  let totalPostsDue = 0; // post_ids yet to be submitted (not Posted)
  let totalPostsSubmitted = 0; // post_ids Posted
  let delayedPosts = 0; // Posted post_ids whose post_date > est_delivery

  for (const r of rows) {
    const status = String(r.workflow_status ?? "").trim();
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
      totalPostsDue++;
    }
  }

  const denom = totalPostsSubmitted + totalPostsDue;
  const completionRate =
    denom > 0 ? Math.round((totalPostsSubmitted / denom) * 1000) / 10 : 0;

  return {
    totalPostsDue,
    totalPostsSubmitted,
    completionRate,
    delayedPosts,
  };
}
