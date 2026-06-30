import { createServiceClient } from "@/lib/supabase/server";

/**
 * Reach-out posts not yet tied to any campaign (campaign_id IS NULL). These are
 * the rows migrated/ingested without a campaign — the team attaches them to an
 * existing campaign later via the Campaigns-stage bulk-assign tool.
 */
export interface UnassignedReachOut {
  id: number;
  inf_id: string | null;
  username: string | null;
  reach_out_date: string | null;
  content_type: string | null;
  reachout_direction: string | null;
  onboarded_by: string | null;
  notes: string | null;
}

export interface AssignableCampaign {
  campaign_id: string;
  campaign_name: string | null;
  status: string | null;
}

export async function fetchUnassignedReachOuts(): Promise<UnassignedReachOut[]> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(
      "id, inf_id, username, reach_out_date, content_type, reachout_direction, onboarded_by, notes",
    )
    .is("campaign_id", null)
    .eq("workflow_status", "Reach Out")
    .order("reach_out_date", { ascending: false })
    .order("username", { ascending: true })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as UnassignedReachOut[];
}

/** Campaigns a row can be assigned to — anything live (excludes Pending / Rejected). */
export async function fetchAssignableCampaigns(): Promise<AssignableCampaign[]> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, campaign_name, status")
    .order("campaign_num", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as AssignableCampaign[]).filter((c) => {
    const s = (c.status ?? "").toLowerCase();
    return !s.startsWith("pending") && !s.startsWith("rejected");
  });
}
