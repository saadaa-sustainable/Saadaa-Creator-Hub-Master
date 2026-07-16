"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/rbac.server";

/**
 * One historic (or live) collab row for the team-member row-level drawer. Every
 * Tracker field is carried through so the detail modal can show the full record
 * the sheet has. `historic_posts` is fully denormalised (creator fields live on
 * the row), so no join is needed for the historic source.
 */
export interface TeamRow {
  /** DB row id — keys the historic backlog-filling updates. */
  id: number | null;
  post_id_short: string | null;
  post_id: string | null;
  inf_id: string | null;
  collab_id: string | null;
  username: string | null;
  campaign_id: string | null;
  nomenclature: string | null;
  workflow_status: string | null;
  source_tag: string | null;
  reachout_direction: string | null;
  content_type: string | null;
  collab_type: string | null;
  commercial_amount: number | null;
  payment_status: string | null;
  order_id: string | null;
  tracking_id: string | null;
  order_status: string | null;
  garment_qty: number | null;
  garments_sent: string | null;
  reach_out_date: string | null;
  onboard_date: string | null;
  post_date: string | null;
  est_delivery: string | null;
  post_link: string | null;
  download_link: string | null;
  email: string | null;
  onboarded_by: string | null;
  logged_by: string | null;
  agency_name: string | null;
  influencer_category: string | null;
  gender: string | null;
  followers: number | null;
  avg_likes: number | null;
  engaged_rate: number | null;
  profile_pic: string | null;
  state: string | null;
  city: string | null;
  notes: string | null;
  post_number: number | null;
  collab_number: number | null;
  deliverable_index: number | null;
  /** Fresher avatar from the creators table (scrape-updated) — preferred over
   *  the archive's frozen profile_pic. Both are usually fbcdn URLs; the UI
   *  renders them raw with referrerPolicy=no-referrer and falls back to initials. */
  creator_pic: string | null;
}

const HISTORIC_COLS = [
  "id",
  "post_id_short", "post_id", "inf_id", "collab_id", "username", "campaign_id",
  "nomenclature", "workflow_status", "source_tag", "reachout_direction",
  "content_type", "collab_type", "commercial_amount", "payment_status",
  "order_id", "tracking_id", "order_status", "garment_qty", "garments_sent",
  "reach_out_date", "onboard_date", "post_date", "est_delivery", "post_link",
  "download_link", "email", "onboarded_by", "logged_by", "agency_name",
  "influencer_category", "gender", "followers", "avg_likes", "engaged_rate",
  "profile_pic", "state", "city", "notes", "post_number", "collab_number",
  "deliverable_index",
].join(",");

// `posts` (live pipeline) carries every collab field EXCEPT the creator-
// denormalised ones (followers/category/gender/avatar/ER) — those come from the
// creators join below. No source_tag on posts.
const LIVE_COLS = [
  "id",
  "post_id_short", "post_id", "inf_id", "collab_id", "username", "campaign_id",
  "nomenclature", "workflow_status", "reachout_direction", "content_type",
  "collab_type", "commercial_amount", "payment_status", "order_id", "tracking_id",
  "order_status", "garment_qty", "garments_sent", "reach_out_date", "onboard_date",
  "post_date", "est_delivery", "post_link", "download_link", "email",
  "onboarded_by", "logged_by", "agency_name", "state", "city", "notes",
  "post_number", "collab_number", "deliverable_index",
].join(",");

/**
 * Fetch every row owned by `team` (matches the dashboards' team keying:
 * `logged_by ?? onboarded_by`), newest first — or EVERY row when `team` is
 * empty (the drawer opens on "All team" by default and filters in-modal).
 * `source`:
 *   - "historic" → the denormalised `historic_posts` archive (Historic Analytics).
 *   - "live"     → the live `posts` pipeline (main Dashboard) + a `creators` join
 *                  for the fields `posts` doesn't denormalise.
 * Capped high — the drawer paginates rendering client-side.
 */
export interface TeamRowsPage {
  rows: TeamRow[];
  /** Exact matching-row count (from the first page's count query). */
  total: number;
}

/**
 * One page of team rows. All the 1000-row PostgREST chunks inside the page are
 * fetched IN PARALLEL (a count query first sizes the fan-out), and the creators
 * join runs its 500-id chunks in parallel too — the all-team historic set
 * (~11k rows) is ~2 sequential DB phases instead of ~23 serial round trips.
 * The drawer paints page one (1000 rows) immediately and appends the rest from
 * a second call in the background.
 */
export async function fetchTeamRowsPage(
  team: string,
  source: "historic" | "live" = "historic",
  offset = 0,
  limit = 1000,
): Promise<TeamRowsPage> {
  await assertPermission("performance_view");
  const t = (team ?? "").trim();
  const supabase = createServiceClient();
  const table = source === "historic" ? "historic_posts" : "posts";
  const cols = source === "historic" ? HISTORIC_COLS : LIVE_COLS;
  // logged_by = team, OR (logged_by null AND onboarded_by = team) — mirrors the
  // `logged_by ?? onboarded_by` bucket rule so the drawer set matches the KPIs.
  // Empty team → no owner filter (all rows).
  const orFilter = t
    ? `logged_by.eq.${t},and(logged_by.is.null,onboarded_by.eq.${t})`
    : null;

  // Exact count sizes the parallel fan-out (and gives the drawer its total).
  let countQuery = (supabase as any)
    .from(table)
    .select("id", { count: "exact", head: true });
  if (orFilter) countQuery = countQuery.or(orFilter);
  const { count, error: countErr } = await countQuery;
  if (countErr) {
    console.error("[team-rows] count failed:", countErr.message);
    return { rows: [], total: 0 };
  }
  const total = count ?? 0;
  const end = Math.min(offset + limit, total, 20_000);
  if (offset >= end) return { rows: [], total };

  // All 1000-row chunks of this page in parallel. Stable order: the shared
  // sort has an id tie-break so parallel ranges never overlap or shuffle.
  const CHUNK = 1000;
  const starts: number[] = [];
  for (let from = offset; from < end; from += CHUNK) starts.push(from);
  const chunkResults = await Promise.all(
    starts.map((from) => {
      let query = (supabase as any).from(table).select(cols);
      if (orFilter) query = query.or(orFilter);
      return query
        .order("post_date", { ascending: false, nullsFirst: false })
        .order("reach_out_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .range(from, Math.min(from + CHUNK, end) - 1);
    }),
  );
  const rows: TeamRow[] = [];
  for (const res of chunkResults) {
    if (res.error) {
      console.error("[team-rows] fetch failed:", res.error.message);
      continue;
    }
    rows.push(...((res.data ?? []) as TeamRow[]));
  }

  // Join creators by inf_id: the fresher profile_pic (both sources) and, for the
  // live source, the denormalised creator fields `posts` lacks. Chunks parallel.
  const infIds = [...new Set(rows.map((r) => r.inf_id).filter(Boolean))] as string[];
  const idChunks: string[][] = [];
  for (let i = 0; i < infIds.length; i += 500) idChunks.push(infIds.slice(i, i + 500));
  const creatorResults = await Promise.all(
    idChunks.map((chunk) =>
      (supabase as any)
        .from("creators")
        .select("inf_id,profile_pic,category,gender,followers,avg_likes,er")
        .in("inf_id", chunk),
    ),
  );
  const byId = new Map<string, Record<string, unknown>>();
  for (const res of creatorResults) {
    for (const c of ((res.data ?? []) as Array<Record<string, unknown>>)) {
      byId.set(c.inf_id as string, c);
    }
  }
  for (const r of rows) {
    const c = r.inf_id ? byId.get(r.inf_id) : undefined;
    r.creator_pic = ((c?.profile_pic as string) || r.profile_pic) ?? null;
    if (source === "live") {
      r.source_tag = null;
      r.profile_pic = (c?.profile_pic as string) ?? null;
      r.influencer_category = (c?.category as string) ?? null;
      r.gender = (c?.gender as string) ?? r.gender ?? null;
      r.followers = (c?.followers as number) ?? null;
      r.avg_likes = (c?.avg_likes as number) ?? null;
      r.engaged_rate = (c?.er as number) ?? null;
    }
  }
  return { rows, total };
}
