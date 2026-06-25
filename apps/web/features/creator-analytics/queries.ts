import { createServiceClient } from "@/lib/supabase/server";
import type {
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
  }));

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

export async function fetchCreatorAnalyticsFilterOptions(): Promise<CreatorAnalyticsFilterOptions> {
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
}
