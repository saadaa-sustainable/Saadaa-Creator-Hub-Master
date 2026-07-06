import { unstable_cache } from "next/cache";
import {
  compareAdOccurrence,
  pickFirstAd,
  type WarehouseAd,
} from "@/lib/supabase/meta-ads";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  CreatorAdInfo,
  CreatorAdsKpi,
  CreatorAdsSummary,
  CreatorAnalyticsFilterOptions,
  CreatorAnalyticsFilters,
  CreatorAnalyticsRow,
  CreatorCollab,
} from "./types";

/**
 * Creator Analytics roster + per-creator collab history.
 *
 * SERVER-SIDE PAGINATED. The heavy lifting (cross-table aggregation, filtering,
 * follower-desc ordering, and the windowed slice) all happens inside the
 * `creator_analytics_page` Postgres RPC — the browser only ever receives ONE
 * page (60 rows) of already-aggregated creators plus the full filtered
 * `total_count`. The per-creator collab history is fetched ON DEMAND via
 * `creator_collab_history` when a creator's modal opens, so the roster never
 * ships the ~11k-row collab corpus to the client.
 */

const PAGE_SIZE = 60;

const FETCH_LIMIT = 50000;

type Raw = Record<string, unknown>;

/** Empty string / undefined → null, so the RPC treats "no filter" uniformly. */
function nz(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

/** Best→worst rank → category name (mirror of the RPC's CASE). */
const CATEGORY_BY_RANK: Record<number, string> = {
  0: "Incremental Winner",
  1: "Winner",
  2: "P0 analysis",
  3: "P1 analysis",
  4: "P2 analysis",
  5: "Discarded",
};

/**
 * Creator-level Meta Ads rollup — one `creator_ads_rollup()` RPC call
 * (token→creator resolution + first-occurrence classification all in SQL over
 * the meta_ads_cache mirror). Cached 5 min: global service data refreshed by
 * a daily cron, no cookies/actor input. Serialized as entries
 * (unstable_cache output must be JSON) — callers rebuild the Map.
 */
const fetchCreatorAdsRollupEntries = unstable_cache(
  async (): Promise<Array<[string, CreatorAdsSummary]>> => {
    try {
      const supabase = createServiceClient();
      const { data, error } = await (supabase as any).rpc("creator_ads_rollup");
      if (error) throw error;
      return ((data ?? []) as Raw[]).map((r) => [
        String(r.inf_id ?? ""),
        {
          tokens: Number(r.tokens ?? 0) || 0,
          ads: Number(r.ads ?? 0) || 0,
          winners: Number(r.winners ?? 0) || 0,
          bestCategory: CATEGORY_BY_RANK[Number(r.best_rank)] ?? null,
          spend: Number(r.spend ?? 0) || 0,
          liveCollabs: Number(r.live_collab_count ?? 0) || 0,
          categories: Array.isArray(r.categories)
            ? (r.categories as string[])
            : [],
          adIds: Array.isArray(r.ad_ids) ? (r.ad_ids as string[]) : [],
          adNames: Array.isArray(r.ad_names) ? (r.ad_names as string[]) : [],
        },
      ]);
    } catch {
      // Fail soft — the roster renders without ads enrichment.
      return [];
    }
  },
  ["creator-ads-rollup"],
  { revalidate: 300 },
);

export async function fetchCreatorAdsRollup(): Promise<
  Map<string, CreatorAdsSummary>
> {
  return new Map(await fetchCreatorAdsRollupEntries());
}

/** Which creators an ads filter value selects. */
function adsFilterMatches(value: string, s: CreatorAdsSummary): boolean {
  if (value === "winners") return s.winners > 0;
  if (value === "winners-idle") return s.winners > 0 && s.liveCollabs === 0;
  return true; // "in-ads"
}

/** Counts for the clickable ads KPI tiles. */
export async function fetchCreatorAdsKpis(): Promise<CreatorAdsKpi> {
  const rollup = await fetchCreatorAdsRollup();
  let winners = 0;
  let winnersIdle = 0;
  let spend = 0;
  for (const s of rollup.values()) {
    if (s.winners > 0) winners += 1;
    if (s.winners > 0 && s.liveCollabs === 0) winnersIdle += 1;
    spend += s.spend;
  }
  return { inAds: rollup.size, winners, winnersIdle, spend };
}

/**
 * One page of the creator roster. Maps the filter set → the RPC params
 * (`p_offset = (page-1)*pageSize`, `p_limit = pageSize`; empty filter → null),
 * calls `creator_analytics_page`, and returns the mapped rows plus the full
 * filtered count (`total_count`, identical on every row). Rows arrive already
 * ordered by followers desc.
 */
export async function fetchCreatorAnalyticsPage(
  filters: CreatorAnalyticsFilters,
  page = 1,
  pageSize = PAGE_SIZE,
): Promise<{ rows: CreatorAnalyticsRow[]; total: number }> {
  const supabase = createServiceClient();
  const safePage = page > 0 ? page : 1;

  // Ads filter → resolve the matching inf_id allow-list from the cached
  // rollup, pushed into the RPC so pagination + total_count stay server-side.
  // An empty match set must return 0 rows, not "no filter" — hence sentinel.
  const rollup = await fetchCreatorAdsRollup();
  const adsFilter = nz(filters.ads);
  let adsInfIds: string[] | null = null;
  if (adsFilter) {
    adsInfIds = [...rollup.entries()]
      .filter(([, s]) => adsFilterMatches(adsFilter, s))
      .map(([id]) => id);
    if (adsInfIds.length === 0) adsInfIds = ["__none__"];
  }

  const { data, error } = await (supabase as any).rpc("creator_analytics_page", {
    p_search: nz(filters.q),
    p_tier: nz(filters.tier),
    p_region: nz(filters.region),
    p_creator_type: nz(filters.creatorType),
    p_stage: nz(filters.stage),
    p_reach_from: nz(filters.reachOutFrom),
    p_reach_to: nz(filters.reachOutTo),
    p_posted_from: nz(filters.postedFrom),
    p_posted_to: nz(filters.postedTo),
    p_limit: pageSize,
    p_offset: (safePage - 1) * pageSize,
    p_inf_ids: adsInfIds,
  });

  if (error) throw error;

  const records = (data ?? []) as Raw[];
  const rows: CreatorAnalyticsRow[] = records.map((r) => ({
    inf_id: String(r.inf_id ?? ""),
    username: String(r.username ?? ""),
    inf_name: (r.inf_name as string | null) ?? null,
    followers: r.followers != null ? Number(r.followers) : null,
    category: (r.category as string | null) ?? null,
    profile_pic: (r.profile_pic as string | null) ?? null,
    creator_type: (r.creator_type as string | null) ?? null,
    current_stage: (r.current_stage as string | null) ?? null,
    live_collab_count: Number(r.live_collab_count ?? 0) || 0,
    historic_collab_count: Number(r.historic_collab_count ?? 0) || 0,
    total_collab_count: Number(r.total_collab_count ?? 0) || 0,
    deliverable_count: Number(r.deliverable_count ?? 0) || 0,
    last_onboard_date: (r.last_onboard_date as string | null) ?? null,
    last_post_date: (r.last_post_date as string | null) ?? null,
    collab_types: (r.collab_types as string | null) ?? null,
    reach_out_from: (r.reach_out_from as string | null) ?? null,
    reach_out_to: (r.reach_out_to as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    instagram_link: (r.instagram_link as string | null) ?? null,
    is_active: r.is_active == null ? null : Boolean(r.is_active),
    partnership_status: null,
    adsSummary: rollup.get(String(r.inf_id ?? "")) ?? null,
    partnership_accepted_at: null,
    partnership_declined_at: null,
  }));

  // Meta partnership state + lifecycle dates live on the creators row
  // (mirrored by lib/partnership-sync.ts since 2026-07-06); one batched
  // lookup covers the page. Fail-soft: on error the page simply renders
  // without partnership badges/dates.
  const infIds = [...new Set(rows.map((r) => r.inf_id).filter(Boolean))];
  if (infIds.length > 0) {
    const { data: statusData, error: statusError } = await (supabase as any)
      .from("creators")
      .select("inf_id, partnership_status, partnership_accepted_at, partnership_declined_at")
      .in("inf_id", infIds)
      .not("partnership_status", "is", null);

    if (!statusError) {
      const byInf = new Map<string, Raw>();
      for (const p of (statusData ?? []) as Raw[]) {
        const id = String(p.inf_id ?? "");
        if (id && !byInf.has(id)) byInf.set(id, p);
      }
      for (const row of rows) {
        const p = byInf.get(row.inf_id);
        if (!p) continue;
        row.partnership_status =
          String(p.partnership_status ?? "").trim() || null;
        row.partnership_accepted_at =
          (p.partnership_accepted_at as string | null) ?? null;
        row.partnership_declined_at =
          (p.partnership_declined_at as string | null) ?? null;
      }
    }
  }

  const total = Number(records[0]?.total_count ?? 0) || 0;
  return { rows, total };
}

/**
 * Full merged collab history for ONE creator (posts ∪ historic_posts, newest
 * first), fetched on demand when that creator's history modal opens. Backed by
 * the `creator_collab_history` RPC.
 */
export async function fetchCreatorCollabHistory(
  infId: string,
): Promise<CreatorCollab[]> {
  const id = (infId ?? "").trim();
  if (!id) return [];

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any).rpc("creator_collab_history", {
    p_inf_id: id,
  });

  if (error) throw error;

  return ((data ?? []) as Raw[]).map((r) => ({
    collabId: String(r.collab_id ?? "—"),
    contentType: (r.content_type as string | null) ?? null,
    postDate: (r.post_date as string | null) ?? null,
    paymentStatus: (r.payment_status as string | null) ?? null,
    postLink: (r.post_link as string | null) ?? null,
    source: (r.source as string | null) === "historic" ? "historic" : "live",
  }));
}

/**
 * Meta Ads rollups for ONE creator, from the local `meta_ads_cache` mirror
 * (never the cross-project warehouse — those scans time out from Vercel).
 * Two matching passes, mirroring the Ad Status board:
 *
 *  1. Direct — cache tokens prefixed with the creator's current SIF
 *     (`SIF-1905-P%` for inf_id SIF-1905): live + historic posts.
 *  2. Retired IDs — the legacy archive (`historic_creator_data`) lists every
 *     post_id the creator's username ever held, including pre-renumbering
 *     SIFs; any of those tokens found in the cache but not covered by pass 1
 *     is attached with `retiredId: true`.
 *
 * One entry per token, wearing its first-occurrence ad (board rule), newest
 * ad first. Fails soft to [] — ads are supplemental in the history modal.
 */
export async function fetchCreatorAdsInfo(
  infId: string,
  username: string | null,
): Promise<CreatorAdInfo[]> {
  const id = (infId ?? "").trim().toUpperCase();
  if (!id) return [];

  const supabase = createServiceClient();
  const byToken = new Map<string, { ads: WarehouseAd[]; retired: boolean }>();

  const collect = (rows: Raw[] | null | undefined, retired: boolean) => {
    for (const r of rows ?? []) {
      const token = String(r.token ?? "").toUpperCase();
      const raw = (Array.isArray(r.ads) ? r.ads : []) as Array<
        Record<string, unknown>
      >;
      if (!token || !raw.length || byToken.has(token)) continue;
      // Seeder/cron may store either thumbnail key spelling — normalise, same
      // as fetchWarehouseAdRows.
      const ads = raw.map((a) => ({
        ...(a as unknown as WarehouseAd),
        thumbnailUrl:
          (a.thumbnailUrl as string | null | undefined) ??
          (a.thumbUrl as string | null | undefined) ??
          null,
        imageUrl: (a.imageUrl as string | null | undefined) ?? null,
      }));
      byToken.set(token, { ads, retired });
    }
  };

  try {
    // Pass 1 — current SIF prefix.
    const direct = await (supabase as any)
      .from("meta_ads_cache")
      .select("token, ads")
      .ilike("token", `${id}-P%`);
    collect(direct.data as Raw[], false);

    // Pass 2 — other-SIF tokens via the legacy archive (username match).
    const uname = (username ?? "").trim();
    if (uname) {
      const { data: archiveRows } = await (supabase as any)
        .from("historic_creator_data")
        .select("post_id")
        .ilike("username", uname)
        .limit(500);
      const archiveTokens = [
        ...new Set(
          ((archiveRows ?? []) as Raw[])
            .map((r) => String(r.post_id ?? "").trim().toUpperCase())
            .filter((t) => t && !t.startsWith(`${id}-P`)),
        ),
      ];
      // A mismatched-SIF token only counts as "Retired ID" when no real post
      // row exists for it (the Ad Status board's rule) — otherwise it's an
      // ordinary historic post that happens to predate the renumbering.
      const knownPosts = new Set<string>();
      for (let i = 0; i < archiveTokens.length; i += 200) {
        const chunk = archiveTokens.slice(i, i + 200);
        const [cacheRes, liveRes, histRes] = await Promise.all([
          (supabase as any)
            .from("meta_ads_cache")
            .select("token, ads")
            .in("token", chunk),
          (supabase as any)
            .from("posts")
            .select("post_id_short")
            .in("post_id_short", chunk),
          (supabase as any)
            .from("historic_posts")
            .select("post_id_short")
            .in("post_id_short", chunk),
        ]);
        for (const r of [
          ...((liveRes.data ?? []) as Raw[]),
          ...((histRes.data ?? []) as Raw[]),
        ]) {
          knownPosts.add(String(r.post_id_short ?? "").toUpperCase());
        }
        for (const r of (cacheRes.data ?? []) as Raw[]) {
          const token = String(r.token ?? "").toUpperCase();
          collect([r], !knownPosts.has(token));
        }
      }
    }
  } catch {
    return [];
  }

  // Instagram post links for the modal's per-ad cards (thumbnail lightbox):
  // live posts first, then the legacy archive (historic_posts.post_link is
  // null for most rows — the raw archive kept the links). Fail-soft.
  const postLinks = new Map<string, string>();
  try {
    const tokens = [...byToken.keys()];
    for (let i = 0; i < tokens.length; i += 200) {
      const chunk = tokens.slice(i, i + 200);
      const [liveRes, archRes] = await Promise.all([
        (supabase as any)
          .from("posts")
          .select("post_id_short, post_link")
          .in("post_id_short", chunk),
        (supabase as any)
          .from("historic_creator_data")
          .select("post_id, link_to_post")
          .in("post_id", chunk),
      ]);
      for (const r of (archRes.data ?? []) as Raw[]) {
        const link = String(r.link_to_post ?? "").trim();
        if (link) postLinks.set(String(r.post_id ?? "").toUpperCase(), link);
      }
      for (const r of (liveRes.data ?? []) as Raw[]) {
        const link = String(r.post_link ?? "").trim();
        if (link) postLinks.set(String(r.post_id_short ?? "").toUpperCase(), link);
      }
    }
  } catch {
    // links are decoration — cards fall back to the stored creative
  }

  const infos: CreatorAdInfo[] = [...byToken.entries()].map(
    ([token, { ads, retired }]) => {
      const ordered = [...ads].sort(compareAdOccurrence);
      const first = pickFirstAd(ads);
      return {
        token,
        category: first?.category?.trim() || null,
        adStatus: first?.adStatus?.trim() || null,
        amountSpent: first?.amountSpent ?? 0,
        roasMa: first?.roasMa ?? 0,
        adCreated: first?.adCreated ?? null,
        adCount: ads.length,
        retiredId: retired,
        ads: ordered,
        postLink: postLinks.get(token) ?? null,
      };
    },
  );

  // Newest first-occurrence ad first; undated tokens last.
  return infos.sort((a, b) => {
    const ta = a.adCreated ? Date.parse(a.adCreated) : NaN;
    const tb = b.adCreated ? Date.parse(b.adCreated) : NaN;
    const aOk = Number.isFinite(ta);
    const bOk = Number.isFinite(tb);
    if (aOk && bOk && ta !== tb) return tb - ta;
    if (aOk !== bOk) return aOk ? -1 : 1;
    return a.token.localeCompare(b.token);
  });
}

export const fetchCreatorAnalyticsFilterOptions = unstable_cache(
  async (): Promise<CreatorAnalyticsFilterOptions> => {
    const supabase = createServiceClient();
    const [creatorsRes, postsRes] = await Promise.all([
      (supabase as any)
        .from("creators")
        .select("category, state, creator_type")
        .limit(FETCH_LIMIT),
      (supabase as any).from("posts").select("workflow_status").limit(FETCH_LIMIT),
    ]);

    const tiers = new Set<string>();
    const regions = new Set<string>();
    const creatorTypes = new Set<string>();
    for (const c of (creatorsRes.data ?? []) as Raw[]) {
      const cat = String(c.category ?? "").trim();
      if (cat) tiers.add(cat);
      const st = String(c.state ?? "").trim();
      if (st) regions.add(st);
      const t = String(c.creator_type ?? "").trim();
      if (t) creatorTypes.add(t);
    }
    const statuses = new Set<string>();
    for (const p of (postsRes.data ?? []) as Raw[]) {
      const s = String(p.workflow_status ?? "").trim();
      if (s) statuses.add(s);
    }

    return {
      tiers: [...tiers].sort(),
      regions: [...regions].sort(),
      statuses: [...statuses].sort(),
      creatorTypes: [...creatorTypes].sort(),
    };
  },
  ["creator-analytics-filter-options"],
  { revalidate: 300, tags: ["creators", "posts"] },
);
