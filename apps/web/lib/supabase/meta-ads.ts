import { createClient } from "@supabase/supabase-js";

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
