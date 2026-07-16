import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isPastDue } from "@/lib/workflow";
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
      post_thumbnail,
      post_media,
      download_link,
      raw_dump,
      partnership_id,
      partnership_status,
      est_delivery,
      reach_out_date,
      deliverable_index,
      deliverable_type,
      collab_number,
      collab_id,
      inf_id,
      onboarded_by,
      posted_by,
      bank_number,
      ifsc,
      campaign:campaigns ( campaign_id, campaign_name ),
      creator:creators  ( inf_id, username, inf_name, followers, category, state, profile_pic, instagram_link, is_active )
    `,
    )
    .in("workflow_status", POSTING_STATUS_SET);

  if (filters.campaign) q = q.eq("campaign_id", filters.campaign);
  if (filters.statusFilter) q = q.eq("workflow_status", filters.statusFilter);
  if (filters.creatorTier) q = q.eq("creators.category", filters.creatorTier);
  // Team member who onboarded the collab.
  // Submitted view filters by who POSTED (posted_by; older rows fall back to
  // the onboarder); the work queue by who onboarded. Same URL param either way.
  if (filters.onboardedBy) {
    if (submittedYes) {
      q = q.or(
        `posted_by.eq.${filters.onboardedBy},and(posted_by.is.null,onboarded_by.eq.${filters.onboardedBy})`,
      );
    } else {
      q = q.eq("onboarded_by", filters.onboardedBy);
    }
  }
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
    // High cap — the old 500 silently hid older rows from the queue AND its
    // in-memory search (same truncation bug as the onboarding queue).
    .limit(10_000);
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

  // Overdue only — same rule as the Overdue KPI (est_delivery day-after
  // anchor, >15d-since-reach fallback), applied to not-yet-posted rows.
  if (filters.overdue === "yes") {
    rows = rows.filter((r) => {
      const status = String(r.workflow_status ?? "").trim().toLowerCase();
      const posted =
        status.includes("posted") ||
        status.includes("delivered") ||
        !!r.post_date;
      return !posted && isPastDue(r.est_delivery, r.reach_out_date);
    });
  }

  // Free-text search is applied CLIENT-SIDE in PostingTable (lib/live-search)
  // — instant, no server round trip per keystroke.

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
        .select("onboarded_by, posted_by, content_type, workflow_status")
        .in("workflow_status", ["On Board", "Order Sent", "Posted"])
        .limit(20000),
    ]);

    const tiers = new Set<string>();
    ((creators.data ?? []) as any[]).forEach((c) => {
      if (c.category) tiers.add(c.category);
    });

    // Team members who onboarded OR posted + content types among the posting
    // candidates — a member who only submitted posts (e.g. filled someone
    // else's collab) must still appear in the picker.
    const teamMembers = new Set<string>();
    const contentTypes = new Set<string>();
    ((posts.data ?? []) as any[]).forEach((p) => {
      const ob = (p.onboarded_by ?? "").trim();
      if (ob) teamMembers.add(ob);
      const pb = (p.posted_by ?? "").trim();
      if (pb) teamMembers.add(pb);
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

  // When a team member is selected, KPIs scope per STAGE (same attribution
  // rule as the rows list): Posts Due = deliverables THEY onboarded still in
  // the queue; Submitted = posts THEY submitted (posted_by, falling back to
  // the onboarder on rows from before posted_by existed). Otherwise the KPIs
  // reflect the whole pipeline.
  const member = (filters.onboardedBy ?? "").trim();

  // One row = one post_id (deliverable). Fetch every pipeline deliverable and
  // count rows by submission state — Posted vs not-yet-Posted. Member scoping
  // happens per-row below (Due vs Submitted key on different columns).
  let q = (supabase as any)
    .from("posts")
    .select(
      "workflow_status, post_date, est_delivery, onboarded_by, posted_by, reach_out_date, deliverable_index, post_link",
    )
    .in("workflow_status", PIPELINE_SET)
    .limit(20000);
  if (member) {
    q = q.or(`onboarded_by.eq.${member},posted_by.eq.${member}`);
  }
  const { data, error } = await q;

  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  let totalPostsDue = 0; // post_ids yet to be submitted (not Posted)
  let totalPostsSubmitted = 0; // post_ids Posted
  let delayedPosts = 0; // Posted post_ids whose post_date > est_delivery
  // Funnel-parity Overdue (same formula as the Dashboard Funnel/Internal
  // tiles): PARENT rows (one collab = 1) not yet posted whose promised
  // est_delivery has passed (day after); no est date → >15 days since
  // reach-out fallback (lib/workflow isPastDue).
  let overdue = 0;
  const now = Date.now();

  for (const r of rows) {
    const status = String(r.workflow_status ?? "").trim();
    const onboardedBy = String(r.onboarded_by ?? "").trim();
    const postedBy = String(r.posted_by ?? "").trim() || onboardedBy;
    if (status === "Posted") {
      if (member && postedBy !== member) continue;
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
      if (member && onboardedBy !== member) continue;
      totalPostsDue++;
      const isParent =
        r.deliverable_index == null || Number(r.deliverable_index) === 1;
      const looksPosted =
        !!r.post_date ||
        /instagram\.com|youtube\.com|youtu\.be|^https?:/i.test(
          String(r.post_link ?? ""),
        );
      if (isParent && !looksPosted && isPastDue(r.est_delivery, r.reach_out_date, now)) {
        overdue++;
      }
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
    overdue,
  };
}
