import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

function createMetaAdsClient() {
  const url = process.env.META_ADS_SUPABASE_URL?.trim();
  const key = process.env.META_ADS_SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Returns the Set of post_id_short values (e.g. "SIF-1-P1") that appear in
 * any IFAD-tagged ad_name in the Meta Ads warehouse `primary_table`.
 * Returns empty Set if the warehouse is not configured (env vars missing)
 * or if the query fails.
 *
 * Mirrors the legacy `mbSelectAll_` paginated pattern from Code.js.
 */
export async function fetchMetaAdsCoveredPostIds(): Promise<Set<string>> {
  const client = createMetaAdsClient();
  if (!client) return new Set();
  try {
    const POST_ID_REGEX = /([A-Z]+-\d+-P\d+)/i;
    const covered = new Set<string>();
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await client
        .from("primary_table")
        .select("ad_name")
        .ilike("ad_name", "%IFAD%")
        .range(offset, offset + PAGE - 1);
      if (error || !data?.length) break;
      for (const row of data) {
        const m = String(row.ad_name ?? "").match(POST_ID_REGEX);
        if (m) covered.add(m[1].toUpperCase());
      }
      if (data.length < PAGE) break;
      offset += PAGE;
      if (offset > 200_000) break; // safety ceiling
    }
    return covered;
  } catch {
    return new Set();
  }
}

/**
 * Returns true if the META_ADS_SUPABASE_URL and META_ADS_SUPABASE_SERVICE_KEY
 * env vars are set. Does NOT test connectivity — used only for UI callout.
 */
export function isMetaAdsWarehouseConfigured(): boolean {
  return (
    Boolean(process.env.META_ADS_SUPABASE_URL?.trim()) &&
    Boolean(process.env.META_ADS_SUPABASE_SERVICE_KEY?.trim())
  );
}

// ---------------------------------------------------------------------------
// Creative Testing Dashboard mirror — per-ad rows from `ae_table_view`
// ---------------------------------------------------------------------------

/**
 * One ad row from the warehouse `ae_table_view` (one row per Meta ad).
 * `category` is precomputed server-side by the warehouse refresh job — it is
 * the source of truth; we never recompute it for display.
 */
export interface WarehouseAd {
  adId: string;
  adName: string;
  /** ISO date the ad was created on Meta. */
  adCreated: string | null;
  /** Meta delivery status: ACTIVE / PAUSED / CAMPAIGN_PAUSED / … */
  adStatus: string;
  /** Incremental Winner | Winner | P0 analysis | P1 analysis | P2 analysis | Discarded */
  category: string;
  f1Pass: boolean;
  f2Pass: boolean;
  f3Pass: boolean;
  f4Pass: boolean;
  impressions: number;
  amountSpent: number;
  roasMa: number;
  ftewvCount: number;
  costPerFtewv: number | null;
  ncpCount: number;
  costPerNcp: number | null;
  convValue: number;
  purchases: number;
  shopifyOrders: number;
  shopifySales: number;
  /** fb.me link — Meta's real ad preview. */
  previewLink: string | null;
  /** Landing page / Instagram permalink the ad points at. */
  adLink: string | null;
  /** From `ad_thumbnails`, merged in by the caller when fetched. */
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
}

/**
 * Preferred `ae_table_view` columns (verified live 2026-07-03). Intersected
 * against a limit-1 probe before selecting so a renamed/dropped column never
 * 42703s the whole read (same pattern as sheets/queries.ts getLiveColumnKeys).
 */
const AE_COLS_PREFERRED = [
  "ad_id",
  "ad_name",
  "ad_created",
  "ad_status",
  "category",
  "f1_pass",
  "f2_pass",
  "f3_pass",
  "f4_pass",
  "impressions",
  "amount_spent",
  "roas_ma",
  "ftewv_count",
  "cost_per_ftewv",
  "ncp_count",
  "cost_per_ncp",
  "conv_value",
  "purchases",
  "shopify_orders",
  "shopify_sales",
  "preview_link",
  "ad_link",
];

/** Best → worst. Unknown/blank categories rank below Discarded. */
const CATEGORY_RANK: Record<string, number> = {
  "Incremental Winner": 0,
  Winner: 1,
  "P0 analysis": 2,
  "P1 analysis": 3,
  "P2 analysis": 4,
  Discarded: 5,
};

/** Rank a warehouse category — lower is better; unknown → 6. */
export function rankCategory(category: string | null | undefined): number {
  return CATEGORY_RANK[String(category ?? "").trim()] ?? 6;
}

/** The ad with the highest spend — the "primary" creative shown inline. */
export function pickPrimaryAd(ads: WarehouseAd[]): WarehouseAd | null {
  let best: WarehouseAd | null = null;
  for (const ad of ads) {
    if (!best || ad.amountSpent > best.amountSpent) best = ad;
  }
  return best;
}

/** Best (lowest-rank) category across a post's ads, or null when unknown. */
export function bestCategory(ads: WarehouseAd[]): string | null {
  let best: string | null = null;
  for (const ad of ads) {
    if (rankCategory(ad.category) < rankCategory(best)) best = ad.category;
  }
  return best;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Never let the warehouse block render — race to empty after `ms`. */
function raceEmpty<T>(work: Promise<T>, empty: T, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(empty), ms)),
  ]);
}

/**
 * Reads `ae_table_view` (paged 1000/batch, spend desc, hard cap 20k rows) and
 * returns only ads whose ad_name carries a SIF post token, keyed by that
 * token uppercased (e.g. "SIF-2219-P1"). Multiple ads can reference one post;
 * each bucket is sorted spend desc. Guarded by a 6s timeout + try/catch —
 * always resolves, empty Map on any failure.
 */
/**
 * Cached inner read — the paged ae_table_view scan is ~16 requests (~2-3s), so
 * it runs at most once per 5 minutes per server instance. Returns plain
 * entries (unstable_cache output must be JSON-serializable; the Map is rebuilt
 * by the caller). Global service data, no cookies/actor input — safe to cache.
 */
const fetchWarehouseAdEntriesCached = unstable_cache(
  async (): Promise<Array<[string, WarehouseAd[]]>> => {
    const map = await readWarehouseAdMap();
    return [...map.entries()];
  },
  ["meta-ads-warehouse-ads"],
  { revalidate: 300 },
);

export async function fetchWarehouseAdRows(): Promise<
  Map<string, WarehouseAd[]>
> {
  const client = createMetaAdsClient();
  if (!client) return new Map();
  // The 6s race wraps the CACHED call: on a cold cache + slow warehouse the
  // page renders without warehouse data, while the fill keeps running so the
  // next render hits the cache.
  try {
    const work = fetchWarehouseAdEntriesCached().then(
      (entries) => new Map(entries),
    );
    return await raceEmpty(work, new Map<string, WarehouseAd[]>(), 6000);
  } catch {
    return new Map();
  }
}

async function readWarehouseAdMap(): Promise<Map<string, WarehouseAd[]>> {
  const client = createMetaAdsClient();
  if (!client) return new Map();

  {
    const POST_ID_REGEX = /([A-Z]+-\d+-P\d+)/i;
    const map = new Map<string, WarehouseAd[]>();

    // limit-1 probe → trim any column that would 42703 the paged read.
    const probe = await client.from("ae_table_view").select("*").limit(1);
    if (probe.error || !probe.data?.length) return map;
    const live = new Set(Object.keys(probe.data[0] as Record<string, unknown>));
    const cols = AE_COLS_PREFERRED.filter((c) => live.has(c));
    if (!cols.includes("ad_id") || !cols.includes("ad_name")) return map;

    let offset = 0;
    const PAGE = 1000;
    const CAP = 20_000;
    while (offset < CAP) {
      const { data, error } = await client
        .from("ae_table_view")
        .select(cols.join(","))
        .order("amount_spent", { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE - 1);
      if (error || !data?.length) break;
      for (const raw of data as unknown as Array<Record<string, unknown>>) {
        const m = String(raw.ad_name ?? "").match(POST_ID_REGEX);
        if (!m) continue;
        const token = m[1].toUpperCase();
        const ad: WarehouseAd = {
          adId: String(raw.ad_id ?? ""),
          adName: String(raw.ad_name ?? ""),
          adCreated: raw.ad_created ? String(raw.ad_created) : null,
          adStatus: String(raw.ad_status ?? "").trim(),
          category: String(raw.category ?? "").trim(),
          f1Pass: Boolean(raw.f1_pass),
          f2Pass: Boolean(raw.f2_pass),
          f3Pass: Boolean(raw.f3_pass),
          f4Pass: Boolean(raw.f4_pass),
          impressions: num(raw.impressions),
          amountSpent: num(raw.amount_spent),
          roasMa: num(raw.roas_ma),
          ftewvCount: num(raw.ftewv_count),
          costPerFtewv: numOrNull(raw.cost_per_ftewv),
          ncpCount: num(raw.ncp_count),
          costPerNcp: numOrNull(raw.cost_per_ncp),
          convValue: num(raw.conv_value),
          purchases: num(raw.purchases),
          shopifyOrders: num(raw.shopify_orders),
          shopifySales: num(raw.shopify_sales),
          previewLink: raw.preview_link ? String(raw.preview_link) : null,
          adLink: raw.ad_link ? String(raw.ad_link) : null,
        };
        const bucket = map.get(token);
        if (bucket) bucket.push(ad);
        else map.set(token, [ad]);
      }
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    // Buckets arrive spend-desc already (global order), but keep the
    // guarantee explicit — callers rely on ads[0] being the top spender.
    for (const bucket of map.values()) {
      bucket.sort((a, b) => b.amountSpent - a.amountSpent);
    }
    return map;
  }
}

/**
 * Thumbnails for the given ad_ids from `ad_thumbnails`, chunked `.in()` of
 * 150 (fired in parallel). Returns Map<ad_id, {thumb, image}>. Fails soft to
 * an empty Map — thumbnails are decoration, never worth blocking render.
 */
export async function fetchAdThumbnailsFor(
  adIds: string[],
): Promise<Map<string, { thumb: string | null; image: string | null }>> {
  const client = createMetaAdsClient();
  const empty = new Map<string, { thumb: string | null; image: string | null }>();
  if (!client || !adIds.length) return empty;

  const work = (async () => {
    const map = new Map<string, { thumb: string | null; image: string | null }>();
    const CHUNK = 150;
    const chunks: string[][] = [];
    for (let i = 0; i < adIds.length; i += CHUNK) {
      chunks.push(adIds.slice(i, i + CHUNK));
    }
    // Bounded concurrency (6 chunks in flight) — polite to the shared
    // warehouse; at today's ~1.3k matched ads that's 2 waves.
    const CONCURRENCY = 6;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const wave = await Promise.all(
        chunks.slice(i, i + CONCURRENCY).map((chunk) =>
          client
            .from("ad_thumbnails")
            .select("ad_id, thumbnail_url, image_url")
            .in("ad_id", chunk),
        ),
      );
      for (const res of wave) {
        if (res.error || !res.data) continue;
        for (const row of res.data as Array<Record<string, unknown>>) {
          const id = String(row.ad_id ?? "");
          if (!id) continue;
          map.set(id, {
            thumb: row.thumbnail_url ? String(row.thumbnail_url) : null,
            image: row.image_url ? String(row.image_url) : null,
          });
        }
      }
    }
    return map;
  })();

  try {
    return await raceEmpty(work, empty, 5000);
  } catch {
    return empty;
  }
}
