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

/**
 * Fetch every row owned by `team` (matches the dashboards' team keying:
 * `logged_by ?? onboarded_by`), newest first. Historic source reads the
 * denormalised `historic_posts` archive. Capped high — a team drawer paginates
 * rendering client-side.
 */
export async function fetchTeamRows(
  team: string,
  source: "historic" = "historic",
): Promise<TeamRow[]> {
  await assertPermission("performance_view");
  const t = (team ?? "").trim();
  if (!t) return [];
  const supabase = createServiceClient();
  // logged_by = team, OR (logged_by null AND onboarded_by = team) — mirrors the
  // `logged_by ?? onboarded_by` bucket rule so the drawer set matches the KPIs.
  const orFilter = `logged_by.eq.${t},and(logged_by.is.null,onboarded_by.eq.${t})`;
  const { data, error } = await (supabase as any)
    .from(source === "historic" ? "historic_posts" : "posts")
    .select(HISTORIC_COLS)
    .or(orFilter)
    .order("post_date", { ascending: false, nullsFirst: false })
    .order("reach_out_date", { ascending: false, nullsFirst: false })
    .limit(8000);
  if (error) {
    console.error("[team-rows] fetch failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as TeamRow[];

  // Overlay the fresher creators.profile_pic (scrape-updated) by inf_id — more
  // likely to be a non-expired URL than the archive's frozen copy.
  const infIds = [...new Set(rows.map((r) => r.inf_id).filter(Boolean))] as string[];
  if (infIds.length > 0) {
    const picById = new Map<string, string | null>();
    for (let i = 0; i < infIds.length; i += 500) {
      const chunk = infIds.slice(i, i + 500);
      const { data: creators } = await (supabase as any)
        .from("creators")
        .select("inf_id,profile_pic")
        .in("inf_id", chunk);
      for (const c of (creators ?? []) as Array<{ inf_id: string; profile_pic: string | null }>) {
        picById.set(c.inf_id, c.profile_pic);
      }
    }
    for (const r of rows) {
      r.creator_pic = (r.inf_id && picById.get(r.inf_id)) || r.profile_pic || null;
    }
  } else {
    for (const r of rows) r.creator_pic = r.profile_pic ?? null;
  }
  return rows;
}
