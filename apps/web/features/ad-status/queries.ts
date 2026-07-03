import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import {
  compareAdOccurrence,
  fetchAdThumbnailsFor,
  fetchMetaAdsCoveredPostIds,
  fetchWarehouseAdRows,
  isMetaAdsWarehouseConfigured,
  pickFirstAd,
  pickPrimaryAd,
  type WarehouseAd,
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

/**
 * historic_posts columns we want (verified live 2026-07-03). Intersected
 * against a limit-1 probe so a missing column never 42703s the read — the
 * archive schema is hand-migrated and may drift.
 */
const HISTORIC_COLS_PREFERRED = [
  "post_id",
  "post_id_short",
  "inf_id",
  "username",
  "campaign_id",
  "nomenclature",
  "collab_id",
  "workflow_status",
  "collab_type",
  "post_date",
  "post_link",
  "download_link",
  "profile_pic",
  "followers",
  "influencer_category",
];

/**
 * Historic archive rows whose SIF token (post_id / post_id_short, e.g.
 * "SIF-1007-P1") appears in the warehouse map. Tokens are already
 * uppercase-normalized; historic ids are stored uppercase (verified live).
 * Chunked `.in()` of 200, fired in parallel. Fails soft to [].
 */
async function fetchHistoricWarehouseMatches(
  supabase: ReturnType<typeof createServiceClient>,
  tokens: string[],
): Promise<Array<Record<string, unknown>>> {
  if (!tokens.length) return [];
  try {
    // limit-1 probe → real column set (getLiveColumnKeys pattern).
    const probe = await (supabase as any)
      .from("historic_posts")
      .select("*")
      .limit(1);
    if (probe.error || !probe.data?.length) return [];
    const live = new Set(Object.keys(probe.data[0] as Record<string, unknown>));
    const cols = HISTORIC_COLS_PREFERRED.filter((c) => live.has(c));
    // The token lives verbatim in post_id_short (mirrors post_id) — match on
    // whichever the live schema carries.
    const keyCol = live.has("post_id_short") ? "post_id_short" : "post_id";
    if (!cols.includes(keyCol)) return [];

    const CHUNK = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += CHUNK) {
      chunks.push(tokens.slice(i, i + CHUNK));
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        (supabase as any)
          .from("historic_posts")
          .select(cols.join(","))
          .in(keyCol, chunk),
      ),
    );
    const rows: Array<Record<string, unknown>> = [];
    for (const res of results) {
      if (!res.error && res.data) rows.push(...res.data);
    }
    return rows;
  } catch (err) {
    console.warn("[ad-status] historic_posts warehouse match failed:", err);
    return [];
  }
}

/**
 * Old-SIF alias resolution for warehouse tokens that match NO post anywhere.
 * The token's SIF prefix is looked up in the RAW legacy archive
 * (historic_creator_data), whose sif_id column keeps the pre-dedup numbering;
 * the username found there identifies the creator the ad belongs to today.
 * Returns Map<token, archiveUsername>. Fails soft to an empty Map.
 */
async function resolveRetiredAliases(
  supabase: ReturnType<typeof createServiceClient>,
  tokens: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!tokens.length) return out;
  try {
    const prefixOf = (t: string) => t.match(/^([A-Z]+-\d+)/)?.[1] ?? "";
    const prefixes = [...new Set(tokens.map(prefixOf).filter(Boolean))];
    const CHUNK = 200;
    const byPrefix = new Map<string, string>();
    for (let i = 0; i < prefixes.length; i += CHUNK) {
      const { data, error } = await (supabase as any)
        .from("historic_creator_data")
        .select("sif_id, username")
        .in("sif_id", prefixes.slice(i, i + CHUNK));
      if (error || !data) continue;
      for (const r of data as Array<{ sif_id: string; username: string | null }>) {
        const sif = String(r.sif_id ?? "").toUpperCase();
        const u = String(r.username ?? "").trim();
        if (sif && u && !byPrefix.has(sif)) byPrefix.set(sif, u);
      }
    }
    for (const t of tokens) {
      const u = byPrefix.get(prefixOf(t));
      if (u) out.set(t, u);
    }
    return out;
  } catch (err) {
    console.warn("[ad-status] retired-alias resolution failed:", err);
    return out;
  }
}

/** Legacy sheet dates are DD/MM/YYYY — normalise to ISO, pass ISO through. */
function archiveDateToIso(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

interface ArchivePostDetail {
  username: string;
  linkToPost: string;
  downloadLink: string;
  postDate: string | null;
}

/**
 * Post-level details from the RAW legacy archive, keyed by the FULL token
 * (historic_creator_data.post_id carries e.g. "SIF-2441-P1" verbatim).
 * historic_posts.post_link is null for ~9.9k of 11k rows, but the raw archive
 * kept link_to_post — this is what lets the Ad Preview popup render the live
 * Instagram embed for historic and retired-ID rows. Fails soft to empty Map.
 */
async function fetchArchivePostDetails(
  supabase: ReturnType<typeof createServiceClient>,
  tokens: string[],
): Promise<Map<string, ArchivePostDetail>> {
  const out = new Map<string, ArchivePostDetail>();
  if (!tokens.length) return out;
  try {
    const CHUNK = 200;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const { data, error } = await (supabase as any)
        .from("historic_creator_data")
        .select("post_id, username, link_to_post, content_downloaded_link, post_date")
        .in("post_id", tokens.slice(i, i + CHUNK));
      if (error || !data) continue;
      for (const r of data as Array<Record<string, unknown>>) {
        const token = String(r.post_id ?? "").trim().toUpperCase();
        if (!token || out.has(token)) continue;
        out.set(token, {
          username: String(r.username ?? "").replace(/^@/, "").trim(),
          linkToPost: String(r.link_to_post ?? "").trim(),
          downloadLink: String(r.content_downloaded_link ?? "").trim(),
          postDate: archiveDateToIso(r.post_date),
        });
      }
    }
    return out;
  } catch (err) {
    console.warn("[ad-status] archive post-detail lookup failed:", err);
    return out;
  }
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

  // Per-ad warehouse rows (ae_table_view, keyed by SIF token). Has its own
  // internal 6s guard; this outer race mirrors the covered-set guard so a
  // hung connection can never block render either way.
  const warehouseAdsWithTimeout = Promise.race([
    fetchWarehouseAdRows(),
    new Promise<Map<string, WarehouseAd[]>>((resolve) =>
      setTimeout(() => {
        console.warn("[ad-status] Meta Ads ae_table_view timeout — falling back to empty map");
        resolve(new Map());
      }, 6000),
    ),
  ]);

  const [postsRes, creatorsRes, igCacheRes, coveredSetRaw, warehouseAds] =
    await Promise.all([
      fetchPosts(),
      (supabase as any).from("creators").select(CREATOR_COLS).limit(5000),
      (supabase as any)
        .from("instagram_cache")
        .select("username, profile_pic")
        .limit(5000),
      warehouseWithTimeout,
      warehouseAdsWithTimeout,
    ]);

  // Coverage = primary_table IFAD names ∪ ae_table_view tokens — a post
  // counts as "in Meta Ads" if either warehouse source knows it. (Keeps the
  // legacy primary_table coverage intact for posts missing from the view.)
  const coveredSet = new Set<string>(coveredSetRaw);
  for (const token of warehouseAds.keys()) coveredSet.add(token);

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
    categories: {
      incrementalWinners: 0,
      winners: 0,
      p0: 0,
      p1: 0,
      p2: 0,
      discarded: 0,
    },
  };

  // One matched row = one tick in its FIRST-occurrence ad's category bucket.
  const countCategory = (category: string | null) => {
    if (category === "Incremental Winner") kpi.categories.incrementalWinners++;
    else if (category === "Winner") kpi.categories.winners++;
    else if (category === "P0 analysis") kpi.categories.p0++;
    else if (category === "P1 analysis") kpi.categories.p1++;
    else if (category === "P2 analysis") kpi.categories.p2++;
    else if (category === "Discarded") kpi.categories.discarded++;
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

    // First-occurrence order — earliest ad first (modal + expander order);
    // the FIRST ad is the inline creative and drives the row's status chip.
    const ads = [...(warehouseAds.get(postIdShort.toUpperCase()) ?? [])].sort(
      compareAdOccurrence,
    );
    const firstAd = pickFirstAd(ads);
    const warehouseCategory = (firstAd?.category ?? "").trim() || null;
    countCategory(warehouseCategory);

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
      source: "live",
      ads,
      primaryAd: firstAd,
      warehouseCategory,
    };

    // Untested = no classification result AND not yet in Meta Ads warehouse.
    // Ad Run = classified OR confirmed in Meta Ads warehouse.
    if (!isClassified && !isInMetaAds) {
      untested.push(row);
    } else {
      adRun.push(row);
    }
  }

  // ── Historic archive matches ──────────────────────────────────────────────
  // Warehouse tokens with no live post are looked up in historic_posts —
  // by definition these ran as ads, so they land in Ad Run only. Live rows
  // always win a token; existing KPI fields stay live-only (semantics
  // unchanged) while the per-category counts cover both sources.
  const livePostIds = new Set(
    posts
      .map((p) => String(p.post_id_short ?? "").trim().toUpperCase())
      .filter(Boolean),
  );
  const historicTokens = [...warehouseAds.keys()].filter(
    (t) => !livePostIds.has(t),
  );
  const [historicRows, archiveDetails] = await Promise.all([
    fetchHistoricWarehouseMatches(supabase, historicTokens),
    // Raw-archive details for the SAME tokens — historic_posts.post_link is
    // mostly null, so post links / dates come from historic_creator_data.
    fetchArchivePostDetails(supabase, historicTokens),
  ]);

  const seenHistoric = new Set<string>();
  for (const h of historicRows) {
    const token = String(h.post_id_short ?? h.post_id ?? "")
      .trim()
      .toUpperCase();
    if (!token || seenHistoric.has(token)) continue;
    const ads = [...(warehouseAds.get(token) ?? [])].sort(compareAdOccurrence);
    if (!ads.length) continue;
    seenHistoric.add(token);

    const camp = String(h.campaign_id ?? "").trim();
    if (filters.campaign && camp !== filters.campaign) continue;

    const username = String(h.username ?? "").trim();
    const cRow =
      creatorMap.get(username.toLowerCase()) ?? ({} as Record<string, unknown>);

    const archive = archiveDetails.get(token);
    const postDateStr =
      (h.post_date ? String(h.post_date).slice(0, 10) : null) ??
      archive?.postDate ??
      null;
    const daysSince = postDateStr
      ? Math.floor(
          (now - new Date(postDateStr + "T00:00:00Z").getTime()) / 86400000,
        )
      : null;

    const firstAd = pickFirstAd(ads);
    const warehouseCategory = (firstAd?.category ?? "").trim() || null;
    countCategory(warehouseCategory);

    adRun.push({
      postId: String(h.post_id ?? token),
      postIdShort: String(h.post_id_short ?? h.post_id ?? token),
      infId: (h.inf_id as string | null) ?? null,
      collabId: (h.collab_id as string | null) ?? null,
      name: String(cRow.inf_name ?? username ?? ""),
      username,
      profilePicUrl:
        String(cRow.profile_pic ?? "") ||
        String(h.profile_pic ?? "") ||
        igCacheMap.get(username.toLowerCase()) ||
        null,
      campaign: camp,
      category:
        (cRow.category as string | null) ??
        (h.influencer_category as string | null) ??
        null,
      followers:
        Number(cRow.followers ?? 0) || Number(h.followers ?? 0) || null,
      workflowStatus: String(h.workflow_status ?? "Posted"),
      postDate: postDateStr,
      daysSince,
      linkToPost:
        String(h.post_link ?? "").trim() || archive?.linkToPost || "",
      downloadLink:
        String(h.download_link ?? "").trim() || archive?.downloadLink || "",
      adsUsageRights: "",
      adsResults: "",
      adsStatus: "",
      isClassified: false,
      isInMetaAds: true,
      partnershipId: "",
      collabType: String(h.collab_type ?? "").trim(),
      source: "historic",
      ads,
      primaryAd: firstAd,
      warehouseCategory,
    });
  }

  // ── Retired-ID alias matches ──────────────────────────────────────────────
  // Tokens STILL unmatched mostly reference pre-dedup SIFs: the creator was
  // renumbered during the archive cleanup, so the ad name carries a retired
  // ID. The raw archive (historic_creator_data) maps old SIF → username →
  // today's canonical creator. These attach at CREATOR level (founder call —
  // the old P-numbers don't survive renumbering) and land in Ad Run with a
  // "Retired ID" marker. Campaign filter hides them (they carry no campaign).
  if (!filters.campaign) {
    const aliasTokens = historicTokens.filter((t) => !seenHistoric.has(t));
    // Prefer the archive's post-level row (full token in post_id — gives the
    // username AND the post link/date); sif-prefix lookup covers the rest.
    const sifAliasMap = await resolveRetiredAliases(
      supabase,
      aliasTokens.filter((t) => !archiveDetails.get(t)?.username),
    );
    for (const token of aliasTokens) {
      const archive = archiveDetails.get(token);
      const archiveUsername = archive?.username || sifAliasMap.get(token);
      if (!archiveUsername) continue;
      const ads = [...(warehouseAds.get(token) ?? [])].sort(compareAdOccurrence);
      if (!ads.length) continue;
      const uname = archiveUsername.replace(/^@/, "").trim();
      const cRow =
        creatorMap.get(uname.toLowerCase()) ?? ({} as Record<string, unknown>);
      const firstAd = pickFirstAd(ads);
      const warehouseCategory = (firstAd?.category ?? "").trim() || null;
      countCategory(warehouseCategory);

      const postDateStr = archive?.postDate ?? null;
      adRun.push({
        postId: token,
        postIdShort: token,
        infId: (cRow.inf_id as string | null) ?? null,
        collabId: null,
        name: String(cRow.inf_name ?? uname),
        username: String(cRow.username ?? uname),
        profilePicUrl:
          String(cRow.profile_pic ?? "") ||
          igCacheMap.get(uname.toLowerCase()) ||
          null,
        campaign: "",
        category: (cRow.category as string | null) ?? null,
        followers: Number(cRow.followers ?? 0) || null,
        workflowStatus: "",
        postDate: postDateStr,
        daysSince: postDateStr
          ? Math.floor(
              (now - new Date(postDateStr + "T00:00:00Z").getTime()) / 86400000,
            )
          : null,
        linkToPost: archive?.linkToPost ?? "",
        downloadLink: archive?.downloadLink ?? "",
        adsUsageRights: "",
        adsResults: "",
        adsStatus: "",
        isClassified: false,
        isInMetaAds: true,
        partnershipId: "",
        collabType: "",
        source: "historic",
        retiredId: true,
        ads,
        primaryAd: firstAd,
        warehouseCategory,
      });
    }
  }

  // Ad Run: spend desc over the spend that's actually DISPLAYED — the
  // first-occurrence ad's (sorting by the hidden top spender made the Spend
  // column look unsorted). Unmatched rows fall back to post_date desc.
  adRun.sort((a, b) => {
    const sa = a.primaryAd?.amountSpent ?? -1;
    const sb = b.primaryAd?.amountSpent ?? -1;
    if (sa !== sb) return sb - sa;
    return (b.postDate ?? "").localeCompare(a.postDate ?? "");
  });

  // ── Thumbnails ────────────────────────────────────────────────────────────
  // The meta_ads_cache mirror already embeds thumbnails on each ad; only ads
  // MISSING one warrant a live cross-project fetch (which times out on Vercel
  // anyway — this is effectively a local-dev fallback). Merged as new copies —
  // rows/ads are never mutated in place.
  const matchedAdIds: string[] = [];
  for (const row of adRun) {
    for (const ad of row.ads) {
      if (!ad.thumbnailUrl && !ad.imageUrl) matchedAdIds.push(ad.adId);
    }
  }
  const thumbs = matchedAdIds.length
    ? await fetchAdThumbnailsFor(matchedAdIds)
    : new Map<string, { thumb: string | null; image: string | null }>();

  const enrichRow = (row: AdStatusRow): AdStatusRow => {
    if (!row.ads.length) return row;
    // .map preserves the first-occurrence order established above.
    const ads = row.ads.map((ad) => {
      const t = thumbs.get(ad.adId);
      return t ? { ...ad, thumbnailUrl: t.thumb, imageUrl: t.image } : ad;
    });
    return { ...row, ads, primaryAd: pickFirstAd(ads) };
  };

  const warehouseConnected = isMetaAdsWarehouseConfigured();
  return {
    untested: untested.map(enrichRow),
    adRun: adRun.map(enrichRow),
    kpi,
    warehouseConnected,
  };
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
