import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import {
  fetchMetaAdsCoveredPostIds,
  isMetaAdsWarehouseConfigured,
} from "@/lib/supabase/meta-ads";
import type {
  AdStatusFilterOptions,
  AdStatusFilters,
  AdStatusKpi,
  AdStatusRow,
} from "./types";

/**
 * Posts columns that always exist on prod.
 * Mirrors the BASE/EXTENDED pattern from order-status/queries.ts.
 */
const POSTS_COLS_BASE = [
  "post_id",
  "post_id_short",
  "inf_id",
  "collab_id",
  "collab_number",
  "username",
  "campaign_id",
  "workflow_status",
  "ads_usage_rights",
  "partnership_id",
  "post_link",
  "download_link",
  "post_date",
  "collab_type",
].join(",");

/**
 * Extended columns — ads_results and ads_status may 42703 on prod if
 * the migration has not been applied yet. We detect the error and fall back
 * to the BASE set so the page still renders without classification data.
 */
const POSTS_COLS_EXTENDED = POSTS_COLS_BASE + ",ads_results,ads_status";

const CREATOR_COLS = [
  "username",
  "inf_name",
  "profile_pic",
  "category",
  "followers",
].join(",");

/**
 * Eligibility check — mirrors legacy GAS `getAdStatusData` eligibility logic.
 * A post is eligible if it has non-trivial ads_usage_rights OR appears in the
 * Meta Ads warehouse coverage set.
 */
function isEligible(
  adsUsageRights: string,
  postIdShort: string,
  coveredSet: Set<string>,
): boolean {
  const rights = adsUsageRights.trim().toLowerCase();
  const hasRights =
    rights !== "" && rights !== "no" && rights !== "none" && rights !== "-";
  return hasRights || coveredSet.has(postIdShort.toUpperCase());
}

export async function fetchAdStatusData(
  filters: AdStatusFilters,
): Promise<{
  untested: AdStatusRow[];
  adRun: AdStatusRow[];
  kpi: AdStatusKpi;
  warehouseConnected: boolean;
}> {
  const supabase = createServiceClient();

  // Try EXTENDED posts select first; fall back to BASE if cols are missing.
  const fetchPosts = async () => {
    const ext = await (supabase as any)
      .from("posts")
      .select(POSTS_COLS_EXTENDED)
      .in("workflow_status", ["Posted", "Delivered"])
      .order("post_date", { ascending: false, nullsFirst: false })
      .limit(2000);
    if (!ext.error) return ext;
    const code = String((ext.error as { code?: string }).code ?? "");
    if (
      code === "42703" ||
      /column .* does not exist/i.test(ext.error.message ?? "")
    ) {
      console.warn(
        "[ad-status] ads_results / ads_status cols missing on posts, falling back to BASE set. " +
          "Apply the ads columns migration to enable classification display.",
      );
      return await (supabase as any)
        .from("posts")
        .select(POSTS_COLS_BASE)
        .in("workflow_status", ["Posted", "Delivered"])
        .order("post_date", { ascending: false, nullsFirst: false })
        .limit(2000);
    }
    return ext;
  };

  // Meta Ads warehouse fetch with 5s timeout — warehouse latency must not block render.
  const warehouseWithTimeout = Promise.race([
    fetchMetaAdsCoveredPostIds(),
    new Promise<Set<string>>((resolve) =>
      setTimeout(() => {
        console.warn("[ad-status] Meta Ads warehouse timeout — falling back to empty set");
        resolve(new Set());
      }, 5000),
    ),
  ]);

  const [postsRes, creatorsRes, igCacheRes, coveredSet] = await Promise.all([
    fetchPosts(),
    (supabase as any).from("creators").select(CREATOR_COLS).limit(5000),
    (supabase as any)
      .from("instagram_cache")
      .select("username, profile_pic")
      .limit(5000),
    warehouseWithTimeout,
  ]);

  if (postsRes.error) {
    console.error("[ad-status] posts query failed:", postsRes.error);
    throw postsRes.error;
  }

  const posts = (postsRes.data ?? []) as Array<Record<string, unknown>>;
  const creatorRows = (creatorsRes.data ?? []) as Array<Record<string, unknown>>;
  const igCacheRows = (igCacheRes.data ?? []) as Array<Record<string, unknown>>;

  const creatorMap = new Map<string, Record<string, unknown>>();
  for (const c of creatorRows) {
    const u = String(c.username ?? "").toLowerCase();
    if (u) creatorMap.set(u, c);
  }
  const igCacheMap = new Map<string, string>();
  for (const ic of igCacheRows) {
    const u = String(ic.username ?? "").toLowerCase();
    const pic = String(ic.profile_pic ?? "").trim();
    if (u && pic) igCacheMap.set(u, pic);
  }

  const untested: AdStatusRow[] = [];
  const adRun: AdStatusRow[] = [];
  const kpi: AdStatusKpi = {
    totalEligible: 0,
    classified: 0,
    inMetaAds: 0,
    pendingClassification: 0,
    winners: 0,
    discarded: 0,
  };

  const now = Date.now();

  for (const p of posts) {
    const adsUsageRights = String(p.ads_usage_rights ?? "").trim();
    const postIdShort = String(p.post_id_short ?? "").trim();

    if (!isEligible(adsUsageRights, postIdShort, coveredSet)) continue;

    const camp = String(p.campaign_id ?? "").trim();
    if (filters.campaign && camp !== filters.campaign) continue;

    const adsResults = String(p.ads_results ?? "").trim();
    const adsStatus = String(p.ads_status ?? "").trim();
    const isClassified = adsResults !== "";
    const isInMetaAds = coveredSet.has(postIdShort.toUpperCase());

    const cRow =
      creatorMap.get(String(p.username ?? "").toLowerCase()) ??
      ({} as Record<string, unknown>);

    const postDateStr = p.post_date ? String(p.post_date).slice(0, 10) : null;
    const daysSince = postDateStr
      ? Math.floor((now - new Date(postDateStr + "T00:00:00Z").getTime()) / 86400000)
      : null;

    kpi.totalEligible++;
    if (isClassified) kpi.classified++;
    if (isInMetaAds) kpi.inMetaAds++;
    if (!isClassified) kpi.pendingClassification++;
    if (adsResults === "Winner") kpi.winners++;
    if (adsResults === "Discarded" || adsResults === "Discarded but analyse") kpi.discarded++;

    const infId = (p.inf_id as string | null) ?? null;
    const collabId =
      (p.collab_id as string | null) ||
      (infId ? `${infId}-C${Number(p.collab_number ?? 1)}` : null);

    const row: AdStatusRow = {
      postId: String(p.post_id ?? ""),
      postIdShort,
      infId,
      collabId,
      name: String(cRow.inf_name ?? p.username ?? ""),
      username: String(p.username ?? ""),
      profilePicUrl:
        String(cRow.profile_pic ?? "") ||
        igCacheMap.get(String(p.username ?? "").toLowerCase()) ||
        null,
      campaign: camp,
      category: (cRow.category as string | null) ?? null,
      followers: Number(cRow.followers ?? 0) || null,
      workflowStatus: String(p.workflow_status ?? ""),
      postDate: postDateStr,
      daysSince,
      linkToPost: String(p.post_link ?? "").trim(),
      downloadLink: String(p.download_link ?? "").trim(),
      adsUsageRights,
      adsResults,
      adsStatus,
      isClassified,
      isInMetaAds,
      partnershipId: String(p.partnership_id ?? "").trim(),
      collabType: String(p.collab_type ?? "").trim(),
    };

    // Untested = no classification result AND not yet in Meta Ads warehouse.
    // Ad Run = classified OR confirmed in Meta Ads warehouse.
    if (!isClassified && !isInMetaAds) {
      untested.push(row);
    } else {
      adRun.push(row);
    }
  }

  const warehouseConnected = isMetaAdsWarehouseConfigured();
  return { untested, adRun, kpi, warehouseConnected };
}

export const fetchAdStatusFilterOptions = unstable_cache(
  async (): Promise<AdStatusFilterOptions> => {
    const supabase = createServiceClient();
    const { data } = await (supabase as any)
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .order("campaign_id", { ascending: false })
      .limit(500);
    return {
      campaigns: (
        (data ?? []) as Array<{
          campaign_id: string;
          campaign_name: string | null;
        }>
      ).map((c) => ({
        id: c.campaign_id,
        name: c.campaign_name ?? c.campaign_id,
      })),
    };
  },
  ["ad-status-filter-options"],
  { revalidate: 300, tags: ["campaigns"] },
);
