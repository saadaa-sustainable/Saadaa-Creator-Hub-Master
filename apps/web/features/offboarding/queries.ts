import { createServiceClient } from "@/lib/supabase/server";
import type {
  OffboardingFilterOptions,
  OffboardingFilters,
  OffboardingKpi,
  OffboardingRow,
} from "./types";

/**
 * Offboarding ledger — every `posts` row in the terminal 'Offboarding' stage,
 * enriched with creator metadata (avatar + tier) and the per-collab agreed
 * commercial total. Supabase-only (no Sheet fallback). Mirrors the
 * accumulate-then-filter pattern used by Order Status / Onboarding: KPIs are
 * computed over the campaign-filtered scope; search + payment filters only
 * trim the table client-side.
 */
const POSTS_COLS = [
  "post_id",
  "collab_id",
  "inf_id",
  "username",
  "campaign_id",
  "workflow_status",
  "collab_type",
  "collab_number",
  "commercial_amount",
  "order_id",
  "payment_status",
  "reach_out_date",
  "deliverable_index",
].join(",");

const CREATOR_COLS = ["username", "inf_name", "profile_pic", "category", "followers"].join(",");

export interface OffboardCollabOption {
  /** Representative post_id — fed to moveToOffboarding (it moves the whole collab). */
  postId: string;
  collabId: string;
  label: string;
}

/**
 * Active collabs eligible to be moved to Offboarding — one option per collab
 * (anything not already Offboarding/Cancelled). The dropdown value is the
 * collab's representative post_id (lowest), which moveToOffboarding resolves
 * back to the whole collab episode.
 */
export async function fetchOffboardableCollabs(): Promise<OffboardCollabOption[]> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("posts")
    .select("post_id, collab_id, inf_id, collab_number, username, workflow_status")
    .not("workflow_status", "in", "(Offboarded,Offboarding,Cancelled)")
    .order("post_id", { ascending: true })
    .limit(20000);
  if (error) return [];
  const byCollab = new Map<string, OffboardCollabOption>();
  for (const p of (data ?? []) as Array<Record<string, unknown>>) {
    const collabId =
      (p.collab_id as string | null) ??
      (p.inf_id
        ? `${p.inf_id}-C${Number((p.collab_number as number | null) ?? 1)}`
        : (p.post_id as string));
    if (!collabId || byCollab.has(collabId)) continue; // first = lowest post_id = representative
    const handle = p.username ? `@${p.username}` : "";
    byCollab.set(collabId, {
      postId: String(p.post_id),
      collabId,
      label: handle ? `${collabId} · ${handle}` : collabId,
    });
  }
  return [...byCollab.values()].sort((a, b) =>
    a.collabId.localeCompare(b.collabId, undefined, { numeric: true }),
  );
}

export async function fetchOffboardingData(
  filters: OffboardingFilters,
): Promise<{ rows: OffboardingRow[]; kpi: OffboardingKpi }> {
  const supabase = createServiceClient();

  const [postsRes, siblingRes, creatorsRes, igCacheRes] = await Promise.all([
    (supabase as any)
      .from("posts")
      .select(POSTS_COLS)
      .in("workflow_status", ["Offboarded", "Offboarding"])
      .or("deliverable_index.is.null,deliverable_index.eq.1")
      .limit(5000),
    (supabase as any)
      .from("posts")
      .select("inf_id, collab_number, commercial_amount")
      .not("inf_id", "is", null)
      .not("collab_number", "is", null)
      .limit(20000),
    (supabase as any).from("creators").select(CREATOR_COLS).limit(5000),
    (supabase as any)
      .from("instagram_cache")
      .select("username, profile_pic")
      .limit(5000),
  ]);

  if (postsRes.error) {
    console.error("[offboarding] posts query failed:", postsRes.error);
    throw postsRes.error;
  }

  const siblingSumMap = new Map<string, number>();
  for (const s of (siblingRes.data ?? []) as Array<Record<string, unknown>>) {
    const key = `${s.inf_id}::${s.collab_number}`;
    siblingSumMap.set(
      key,
      (siblingSumMap.get(key) ?? 0) + Number(s.commercial_amount ?? 0),
    );
  }

  const creatorMap = new Map<string, Record<string, unknown>>();
  for (const c of (creatorsRes.data ?? []) as Array<Record<string, unknown>>) {
    const u = String(c.username ?? "").toLowerCase();
    if (u) creatorMap.set(u, c);
  }
  const igCacheMap = new Map<string, string>();
  for (const ic of (igCacheRes.data ?? []) as Array<Record<string, unknown>>) {
    const u = String(ic.username ?? "").toLowerCase();
    const pic = String(ic.profile_pic ?? "").trim();
    if (u && pic) igCacheMap.set(u, pic);
  }

  const posts = (postsRes.data ?? []) as Array<Record<string, unknown>>;

  const rows: OffboardingRow[] = [];
  const kpi: OffboardingKpi = {
    total: 0,
    paid: 0,
    awaitingPayment: 0,
    totalCommercials: 0,
  };

  for (const p of posts) {
    if (p.deliverable_index != null && Number(p.deliverable_index) > 1) continue;

    const camp = String(p.campaign_id ?? "").trim();
    if (filters.campaign && camp !== filters.campaign) continue;

    const cRow =
      creatorMap.get(String(p.username ?? "").toLowerCase()) ??
      ({} as Record<string, unknown>);
    const commercials =
      siblingSumMap.get(`${p.inf_id}::${p.collab_number}`) ??
      Number(p.commercial_amount ?? 0);
    const paymentStatus = String(p.payment_status ?? "").trim();

    rows.push({
      postId: String(p.post_id ?? ""),
      collabId: (p.collab_id as string | null) ?? null,
      collabNumber: Number(p.collab_number ?? 0) || null,
      infId: (p.inf_id as string | null) ?? null,
      name: String(cRow.inf_name ?? p.username ?? ""),
      username: String(p.username ?? ""),
      profilePicUrl:
        String(cRow.profile_pic ?? "") ||
        igCacheMap.get(String(p.username ?? "").toLowerCase()) ||
        null,
      campaign: camp,
      category: (cRow.category as string | null) ?? null,
      followers: Number(cRow.followers ?? 0) || null,
      collabType: (p.collab_type as string | null) ?? null,
      commercials,
      orderId: String(p.order_id ?? "").trim(),
      paymentStatus,
      workflowStatus: String(p.workflow_status ?? ""),
      reachoutDate: p.reach_out_date ? String(p.reach_out_date).slice(0, 10) : null,
    });

    kpi.total++;
    kpi.totalCommercials += commercials;
    if (paymentStatus.toLowerCase() === "done") kpi.paid++;
    else kpi.awaitingPayment++;
  }

  return { rows, kpi };
}

export async function fetchOffboardingFilterOptions(): Promise<OffboardingFilterOptions> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, campaign_name")
    .order("campaign_id", { ascending: false })
    .limit(500);
  return {
    campaigns: ((data ?? []) as Array<{ campaign_id: string; campaign_name: string | null }>).map(
      (c) => ({ id: c.campaign_id, name: c.campaign_name ?? c.campaign_id }),
    ),
  };
}
