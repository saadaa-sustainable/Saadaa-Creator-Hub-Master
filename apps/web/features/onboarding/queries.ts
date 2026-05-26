import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { OnboardingFilters, OnboardingRow } from "./types";

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

  let q = (supabase as any)
    .from("posts")
    .select(
      `
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
      inf_id,
      campaign:campaigns ( campaign_id, campaign_name ),
      creator:creators  ( inf_id, username, inf_name, followers, category, state, profile_pic )
    `,
    )
    .in("workflow_status", [
      "Reach Out",
      "On Board",
      "Order Sent",
      "Posted",
      "Delivered",
    ]);

  if (filters.campaign) q = q.eq("campaign_id", filters.campaign);
  if (filters.statusFilter) q = q.eq("workflow_status", filters.statusFilter);
  if (filters.creatorTier) q = q.eq("creators.category", filters.creatorTier);
  if (filters.region) q = q.eq("creators.state", filters.region);
  if (filters.reachoutDateFrom)
    q = q.gte("reach_out_date", filters.reachoutDateFrom);
  if (filters.reachoutDateTo)
    q = q.lte("reach_out_date", filters.reachoutDateTo);

  const { data, error } = await q
    .order("reach_out_date", { ascending: false })
    .limit(500);
  if (error) throw error;

  const rows = (data ?? []) as unknown as OnboardingRow[];
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
 * Distinct filter options pulled from live tables — used by the filter bar.
 * Uses the service-role client because `unstable_cache` runs outside the
 * request scope, so `cookies()` is not available. Filter options are
 * non-sensitive and global.
 */
export const fetchOnboardingFilterOptions = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const [campaigns, creators] = await Promise.all([
      supabase
        .from("campaigns")
        .select("campaign_id, campaign_name")
        .order("campaign_id", { ascending: false })
        .limit(200),
      supabase.from("creators").select("state, category").limit(2000),
    ]);

    const tiers = new Set<string>();
    const regions = new Set<string>();
    ((creators.data ?? []) as any[]).forEach((c) => {
      if (c.category) tiers.add(c.category);
      if (c.state) regions.add(c.state);
    });

    return {
      campaigns: campaigns.data ?? [],
      tiers: [...tiers].sort(),
      regions: [...regions].sort(),
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
