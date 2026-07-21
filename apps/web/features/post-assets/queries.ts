import { createServiceClient } from "@/lib/supabase/server";

/**
 * Post Assets — DAM-style browser over the media the posting pipeline mirrors
 * into storage on every submit (posts.post_media = durable mp4, .post_thumbnail
 * = cover jpg; Meta CDN originals die in days, the bucket copies don't).
 * Folder hierarchy: Campaign → Creator → deliverable videos.
 */

export interface PostAsset {
  post_id: string;
  post_id_short: string | null;
  collab_id: string | null;
  username: string | null;
  campaign_id: string | null;
  post_date: string | null;
  post_link: string | null;
  download_link: string | null;
  post_media: string | null;
  post_thumbnail: string | null;
  deliverable_type: string | null;
}

export interface CreatorFolder {
  username: string;
  inf_name: string | null;
  profile_pic: string | null;
  assets: PostAsset[];
}

export interface CampaignFolder {
  campaign_id: string;
  campaign_name: string | null;
  creators: CreatorFolder[];
  assetCount: number;
}

export interface PostAssetsData {
  campaigns: CampaignFolder[];
  totalAssets: number;
  totalCreators: number;
}

export async function fetchPostAssets(): Promise<PostAssetsData> {
  const supabase = createServiceClient();

  const [{ data: rows, error }, { data: campRows }] = await Promise.all([
    (supabase as any)
      .from("posts")
      .select(
        "post_id, post_id_short, collab_id, username, campaign_id, post_date, post_link, download_link, post_media, post_thumbnail, deliverable_type",
      )
      .in("workflow_status", ["Posted", "Delivered"])
      .eq("is_test", false)
      .order("post_date", { ascending: false, nullsFirst: false })
      .limit(5000),
    (supabase as any).from("campaigns").select("campaign_id, campaign_name"),
  ]);

  if (error) {
    console.error("[post-assets] posts query failed:", error);
    throw error;
  }

  const campaignNames = new Map<string, string | null>();
  for (const c of (campRows ?? []) as Array<{
    campaign_id: string | null;
    campaign_name: string | null;
  }>) {
    if (c.campaign_id) campaignNames.set(c.campaign_id, c.campaign_name);
  }

  const assets = ((rows ?? []) as PostAsset[]).filter(
    // An asset needs SOMETHING to show — mirrored video, cover, or at least a
    // post link (the lightbox can fall back to the Instagram embed).
    (r) => r.post_media || r.post_thumbnail || r.post_link,
  );

  // Creator lookup (name + avatar) for the folder tiles.
  const usernames = Array.from(
    new Set(
      assets.map((a) => String(a.username ?? "").trim()).filter(Boolean),
    ),
  );
  const creatorInfo = new Map<
    string,
    { inf_name: string | null; profile_pic: string | null }
  >();
  if (usernames.length > 0) {
    const { data: creators } = await (supabase as any)
      .from("creators")
      .select("username, inf_name, profile_pic")
      .in("username", usernames);
    for (const c of (creators ?? []) as Array<{
      username: string | null;
      inf_name: string | null;
      profile_pic: string | null;
    }>) {
      const u = String(c.username ?? "").trim().toLowerCase();
      if (u)
        creatorInfo.set(u, {
          inf_name: c.inf_name,
          profile_pic: c.profile_pic,
        });
    }
  }

  // Group: campaign → creator → assets (newest first, kept from the query).
  const campMap = new Map<string, Map<string, PostAsset[]>>();
  for (const a of assets) {
    const camp = String(a.campaign_id ?? "").trim() || "Uncategorised";
    const user = String(a.username ?? "").trim() || "unknown";
    if (!campMap.has(camp)) campMap.set(camp, new Map());
    const byCreator = campMap.get(camp)!;
    if (!byCreator.has(user)) byCreator.set(user, []);
    byCreator.get(user)!.push(a);
  }

  const campaigns: CampaignFolder[] = Array.from(campMap.entries())
    .map(([campaign_id, byCreator]) => {
      const creators: CreatorFolder[] = Array.from(byCreator.entries())
        .map(([username, list]) => ({
          username,
          inf_name: creatorInfo.get(username.toLowerCase())?.inf_name ?? null,
          profile_pic:
            creatorInfo.get(username.toLowerCase())?.profile_pic ?? null,
          assets: list,
        }))
        .sort((a, b) => a.username.localeCompare(b.username));
      return {
        campaign_id,
        campaign_name: campaignNames.get(campaign_id) ?? null,
        creators,
        assetCount: creators.reduce((s, c) => s + c.assets.length, 0),
      };
    })
    .sort((a, b) => a.campaign_id.localeCompare(b.campaign_id));

  return {
    campaigns,
    totalAssets: assets.length,
    totalCreators: usernames.length,
  };
}
