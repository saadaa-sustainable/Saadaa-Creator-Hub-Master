import { createServiceClient } from "@/lib/supabase/server";
import { isVoidedStatus } from "@/lib/workflow";
import type {
  CollabTypeBreakdown,
  CreatorAnalyticsFilterOptions,
  CreatorAnalyticsFilters,
  CreatorAnalyticsRow,
  CreatorCollab,
} from "./types";

/**
 * Creator Analytics roster + per-creator collab history.
 *
 * Mirrors the dashboard/queries.ts approach: pull the bounded corpora
 * (creators + live posts + historic_posts) with the service-role client and
 * group in JS, so cross-table aggregates aren't bottlenecked by PostgREST's
 * limited grouping. Every posts-derived metric is keyed on inf_id.
 *
 *   - live collab count  = distinct collab_id (coalesced to inf_id||'-C'||
 *                          collab_number for legacy rows) across live posts.
 *   - deliverables       = Σ (reels + static_posts + stories) over live posts.
 *   - current_stage      = workflow_status of the creator's MOST-RECENT live
 *                          post (by post_date → onboard_date → reach_out_date).
 *   - historic collab    = distinct collab_id (same coalesce) across
 *                          historic_posts.
 *   - collab history list = posts ∪ historic_posts, newest first.
 */

const FETCH_LIMIT = 50000;

type Raw = Record<string, unknown>;

/** A row is a real collaboration only once it carries a collab id/number.
 * Reach-out-only and (pending-backfill) no-order rows are NOT collabs. */
function hasCollab(r: Raw): boolean {
  return r.collab_id != null || r.collab_number != null;
}

/** Collab grouping key with legacy fallback — distinct collabs per creator. */
function collabKey(r: Raw): string {
  const cid = (r.collab_id as string | null) ?? "";
  if (cid) return cid;
  const inf = (r.inf_id as string | null) ?? "";
  const cn = r.collab_number as number | null;
  if (inf && cn != null) return `${inf}-C${cn}`;
  // No collab key yet (reach-out only) — key by post id / unique id so it isn't
  // merged with a real collab.
  return (r.post_id as string | null) ?? `id:${String(r.id ?? "")}`;
}

/** Display label for a collab in the history modal. */
function collabLabel(r: Raw): string {
  const cid = (r.collab_id as string | null) ?? "";
  if (cid) return cid;
  const inf = (r.inf_id as string | null) ?? "";
  const cn = r.collab_number as number | null;
  if (inf && cn != null) return `${inf}-C${cn}`;
  return (r.post_id_short as string | null) ?? (r.post_id as string | null) ?? "—";
}

function dateOf(r: Raw, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (v) return String(v).slice(0, 10);
  }
  return null;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}
function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

interface Agg {
  collabKeys: Set<string>;
  deliverables: number;
  reachOutFrom: string | null;
  reachOutTo: string | null;
  lastOnboard: string | null;
  lastPost: string | null;
  collabTypes: CollabTypeBreakdown;
  /** Most-recent live post's status + its sort date. */
  currentStage: string | null;
  currentStageDate: string | null;
  collabs: CreatorCollab[];
}

function newAgg(): Agg {
  return {
    collabKeys: new Set<string>(),
    deliverables: 0,
    reachOutFrom: null,
    reachOutTo: null,
    lastOnboard: null,
    lastPost: null,
    collabTypes: {},
    currentStage: null,
    currentStageDate: null,
    collabs: [],
  };
}

export async function fetchCreatorAnalytics(
  filters: CreatorAnalyticsFilters,
): Promise<CreatorAnalyticsRow[]> {
  const supabase = createServiceClient();

  const [creatorsRes, postsRes, historicRes] = await Promise.all([
    (supabase as any)
      .from("creators")
      .select(
        "inf_id, username, inf_name, followers, category, profile_pic, creator_type, state, instagram_link",
      )
      .limit(FETCH_LIMIT),
    (supabase as any)
      .from("posts")
      .select(
        "inf_id, collab_id, collab_number, post_id, post_id_short, workflow_status, content_type, collab_type, payment_status, reels, static_posts, stories, reach_out_date, onboard_date, post_date",
      )
      .limit(FETCH_LIMIT),
    (supabase as any)
      .from("historic_posts")
      .select(
        "inf_id, collab_id, collab_number, post_id, post_id_short, workflow_status, content_type, collab_type, payment_status, reach_out_date, onboard_date, post_date",
      )
      .limit(FETCH_LIMIT),
  ]);

  if (creatorsRes.error) throw creatorsRes.error;
  if (postsRes.error) throw postsRes.error;
  if (historicRes.error) throw historicRes.error;

  const creators = (creatorsRes.data ?? []) as Raw[];
  const livePosts = (postsRes.data ?? []) as Raw[];
  const historicPosts = (historicRes.data ?? []) as Raw[];

  // Live aggregation.
  const liveAgg = new Map<string, Agg>();
  for (const p of livePosts) {
    // Voided (offboarded) collabs don't count toward a creator's roster stats.
    if (isVoidedStatus(p.workflow_status as string | null)) continue;
    const inf = String(p.inf_id ?? "").trim();
    if (!inf) continue;
    let agg = liveAgg.get(inf);
    if (!agg) {
      agg = newAgg();
      liveAgg.set(inf, agg);
    }
    if (hasCollab(p)) agg.collabKeys.add(collabKey(p));
    agg.deliverables +=
      (Number(p.reels ?? 0) || 0) +
      (Number(p.static_posts ?? 0) || 0) +
      (Number(p.stories ?? 0) || 0);
    const ro = dateOf(p, "reach_out_date");
    agg.reachOutFrom = minDate(agg.reachOutFrom, ro);
    agg.reachOutTo = maxDate(agg.reachOutTo, ro);
    agg.lastOnboard = maxDate(agg.lastOnboard, dateOf(p, "onboard_date"));
    agg.lastPost = maxDate(agg.lastPost, dateOf(p, "post_date"));
    const ct = String(p.collab_type ?? "").trim();
    if (ct) agg.collabTypes[ct] = (agg.collabTypes[ct] ?? 0) + 1;
    // Most-recent live post drives the current stage.
    const sortDate =
      dateOf(p, "post_date", "onboard_date", "reach_out_date") ?? "";
    if (agg.currentStageDate == null || sortDate >= agg.currentStageDate) {
      agg.currentStageDate = sortDate;
      agg.currentStage = (p.workflow_status as string | null) ?? null;
    }
    if (hasCollab(p)) {
      agg.collabs.push({
        collabId: collabLabel(p),
        contentType: (p.content_type as string | null) ?? null,
        postDate: dateOf(p, "post_date", "onboard_date", "reach_out_date"),
        paymentStatus: (p.payment_status as string | null) ?? null,
        source: "live",
      });
    }
  }

  // Historic aggregation (no deliverable split in legacy → deliverables stay 0,
  // and historic rows never set the live current stage).
  const histAgg = new Map<string, Agg>();
  for (const p of historicPosts) {
    const inf = String(p.inf_id ?? "").trim();
    if (!inf) continue;
    let agg = histAgg.get(inf);
    if (!agg) {
      agg = newAgg();
      histAgg.set(inf, agg);
    }
    if (hasCollab(p)) agg.collabKeys.add(collabKey(p));
    const ro = dateOf(p, "reach_out_date");
    agg.reachOutFrom = minDate(agg.reachOutFrom, ro);
    agg.reachOutTo = maxDate(agg.reachOutTo, ro);
    agg.lastOnboard = maxDate(agg.lastOnboard, dateOf(p, "onboard_date"));
    agg.lastPost = maxDate(agg.lastPost, dateOf(p, "post_date"));
    const ct = String(p.collab_type ?? "").trim();
    if (ct) agg.collabTypes[ct] = (agg.collabTypes[ct] ?? 0) + 1;
    if (hasCollab(p)) {
      agg.collabs.push({
        collabId: collabLabel(p),
        contentType: (p.content_type as string | null) ?? null,
        postDate: dateOf(p, "post_date", "onboard_date", "reach_out_date"),
        paymentStatus: (p.payment_status as string | null) ?? null,
        source: "historic",
      });
    }
  }

  // Merge per inf_id over the creators roster.
  const rows: CreatorAnalyticsRow[] = creators.map((c) => {
    const inf = String(c.inf_id ?? "").trim();
    const live = liveAgg.get(inf);
    const hist = histAgg.get(inf);

    const liveCount = live?.collabKeys.size ?? 0;
    const histCount = hist?.collabKeys.size ?? 0;

    const breakdown: CollabTypeBreakdown = {};
    for (const [k, v] of Object.entries(live?.collabTypes ?? {})) {
      breakdown[k] = (breakdown[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(hist?.collabTypes ?? {})) {
      breakdown[k] = (breakdown[k] ?? 0) + v;
    }

    const collabs = [...(live?.collabs ?? []), ...(hist?.collabs ?? [])].sort(
      (a, b) => String(b.postDate ?? "").localeCompare(String(a.postDate ?? "")),
    );

    return {
      inf_id: inf,
      username: String(c.username ?? ""),
      inf_name: (c.inf_name as string | null) ?? null,
      followers: c.followers != null ? Number(c.followers) : null,
      category: (c.category as string | null) ?? null,
      profile_pic: (c.profile_pic as string | null) ?? null,
      creator_type: (c.creator_type as string | null) ?? null,
      current_stage: live?.currentStage ?? null,
      live_collab_count: liveCount,
      historic_collab_count: histCount,
      total_collab_count: liveCount + histCount,
      deliverable_count: live?.deliverables ?? 0,
      last_onboard_date: maxDate(
        live?.lastOnboard ?? null,
        hist?.lastOnboard ?? null,
      ),
      last_post_date: maxDate(live?.lastPost ?? null, hist?.lastPost ?? null),
      collab_type_breakdown: breakdown,
      reach_out_from: minDate(
        live?.reachOutFrom ?? null,
        hist?.reachOutFrom ?? null,
      ),
      reach_out_to: maxDate(live?.reachOutTo ?? null, hist?.reachOutTo ?? null),
      collabs,
      state: (c.state as string | null) ?? null,
      instagram_link: (c.instagram_link as string | null) ?? null,
    };
  });

  return applyFilters(rows, filters);
}

function applyFilters(
  rows: CreatorAnalyticsRow[],
  filters: CreatorAnalyticsFilters,
): CreatorAnalyticsRow[] {
  const needle = (filters.q ?? "").trim().toLowerCase();
  const tier = (filters.tier ?? "").trim();
  const region = (filters.region ?? "").trim();
  const creatorType = (filters.creatorType ?? "").trim();
  const stage = (filters.stage ?? "").trim();
  const roFrom = filters.reachOutFrom ?? "";
  const roTo = filters.reachOutTo ?? "";
  const postFrom = filters.postedFrom ?? "";
  const postTo = filters.postedTo ?? "";

  return rows.filter((r) => {
    if (needle) {
      const hit = [r.inf_id, r.inf_name, r.username].some((f) =>
        String(f ?? "").toLowerCase().includes(needle),
      );
      if (!hit) return false;
    }
    if (tier && r.category !== tier) return false;
    if (region && r.state !== region) return false;
    if (creatorType && r.creator_type !== creatorType) return false;
    if (stage && r.current_stage !== stage) return false;
    if (roFrom || roTo) {
      // Match if the creator's reach-out window overlaps the selected range.
      const from = r.reach_out_from;
      const to = r.reach_out_to;
      if (!from && !to) return false;
      if (roFrom && to && to < roFrom) return false;
      if (roTo && from && from > roTo) return false;
    }
    if (postFrom || postTo) {
      const lp = r.last_post_date;
      if (!lp) return false;
      if (postFrom && lp < postFrom) return false;
      if (postTo && lp > postTo) return false;
    }
    return true;
  });
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
