import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Campaigns list for the Reach-Out form dropdown.
 * Cached 5 minutes — invalidates whenever a campaign is created.
 * Uses service-role inside `unstable_cache` because the cache runs outside
 * the request scope (no cookies()).
 */
export const fetchCampaignsForSelect = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("campaign_id, campaign_name, status, brief_link, internal_brief_link")
      .order("campaign_num", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      campaign_id: string;
      campaign_name: string | null;
      status: string | null;
      brief_link: string | null;
      internal_brief_link: string | null;
    }>;
    const ids = rows.map((r) => r.campaign_id).filter(Boolean);
    if (ids.length === 0)
      return rows.map((r) => ({ ...r, creator_cap: 0, creators_used: 0 }));

    // Creator cap (Σ budget num_influencers) + used (distinct active creators)
    // per campaign — so the Reach Out form can show "used / cap" on selection.
    const [budgetRes, postsRes] = await Promise.all([
      (supabase as any)
        .from("campaign_budget")
        .select("campaign_id, num_influencers")
        .in("campaign_id", ids),
      (supabase as any)
        .from("posts")
        .select("campaign_id, username, workflow_status")
        .in("campaign_id", ids)
        .limit(20000),
    ]);
    const capByCampaign = new Map<string, number>();
    (
      (budgetRes.data ?? []) as Array<{
        campaign_id: string;
        num_influencers: number | null;
      }>
    ).forEach((b) => {
      capByCampaign.set(
        b.campaign_id,
        (capByCampaign.get(b.campaign_id) ?? 0) +
          (Number(b.num_influencers ?? 0) || 0),
      );
    });
    const usedByCampaign = new Map<string, Set<string>>();
    (
      (postsRes.data ?? []) as Array<{
        campaign_id: string | null;
        username: string | null;
        workflow_status: string | null;
      }>
    ).forEach((p) => {
      if (String(p.workflow_status ?? "") === "Cancelled") return;
      const cid = p.campaign_id ?? "";
      const name = (p.username ?? "").trim().toLowerCase();
      if (!cid || !name) return;
      const set = usedByCampaign.get(cid) ?? new Set<string>();
      set.add(name);
      usedByCampaign.set(cid, set);
    });
    return rows.map((r) => ({
      ...r,
      creator_cap: capByCampaign.get(r.campaign_id) ?? 0,
      creators_used: usedByCampaign.get(r.campaign_id)?.size ?? 0,
    }));
  },
  ["campaigns-for-select"],
  { revalidate: 300, tags: ["campaigns"] },
);
