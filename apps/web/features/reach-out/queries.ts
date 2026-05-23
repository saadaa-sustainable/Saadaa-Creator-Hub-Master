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
    return data ?? [];
  },
  ["campaigns-for-select"],
  { revalidate: 300, tags: ["campaigns"] },
);
