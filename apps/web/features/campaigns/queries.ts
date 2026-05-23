import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export interface CampaignListRow {
  campaign_id: string;
  campaign_num: number | null;
  key_message: string | null;
  campaign_name: string | null;
  total_budget: number | null;
  no_of_creators: number | string | null;
  brief_link: string | null;
  internal_brief_link: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at?: string | null;
  posts_count?: number;
  budget_rows?: CampaignBudgetListRow[];
}

export interface CampaignBudgetListRow {
  id: number;
  campaign_id: string;
  month_label: string | null;
  tier: string | null;
  collab_type: string | null;
  campaign_name: string | null;
  num_influencers: number | null;
  avg_comp: number | null;
  total_cost: number | null;
  min_garments: number | null;
  max_garments: number | null;
  est_garment_cost: number | null;
  total_with_garments: number | null;
}

const CAMPAIGN_SELECT_WITH_DATES =
  "campaign_id, campaign_num, key_message, campaign_name, total_budget, no_of_creators, brief_link, internal_brief_link, status, start_date, end_date, created_at, updated_at";

const CAMPAIGN_SELECT_LEGACY =
  "campaign_id, campaign_num, key_message, campaign_name, total_budget, no_of_creators, brief_link, internal_brief_link, status, created_at, updated_at";

export const fetchCampaigns = unstable_cache(
  async (): Promise<CampaignListRow[]> => {
    const supabase = createServiceClient();

    let { data, error } = await supabase
      .from("campaigns")
      .select(CAMPAIGN_SELECT_WITH_DATES)
      .order("campaign_num", { ascending: false })
      .limit(500);

    if (error?.code === "42703") {
      const legacyResult = await supabase
        .from("campaigns")
        .select(CAMPAIGN_SELECT_LEGACY)
        .order("campaign_num", { ascending: false })
        .limit(500);
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    const campaignRows = ((data ?? []) as CampaignListRow[]).map(
      (campaign) => ({
        ...campaign,
        start_date: campaign.start_date ?? null,
        end_date: campaign.end_date ?? null,
      }),
    );
    const ids = campaignRows.map((c) => c.campaign_id).filter(Boolean);
    if (ids.length === 0) return campaignRows;

    const { data: budgetData, error: budgetError } = await (supabase as any)
      .from("campaign_budget")
      .select(
        "id, campaign_id, month_label, tier, collab_type, campaign_name, num_influencers, avg_comp, total_cost, min_garments, max_garments, est_garment_cost, total_with_garments",
      )
      .in("campaign_id", ids)
      .order("id", { ascending: true });

    if (budgetError) throw budgetError;

    const budgetByCampaign = new Map<string, CampaignBudgetListRow[]>();
    ((budgetData ?? []) as CampaignBudgetListRow[]).forEach((row) => {
      const rows = budgetByCampaign.get(row.campaign_id) ?? [];
      rows.push(row);
      budgetByCampaign.set(row.campaign_id, rows);
    });

    return campaignRows.map((campaign) => ({
      ...campaign,
      budget_rows: budgetByCampaign.get(campaign.campaign_id) ?? [],
    }));
  },
  ["campaigns-list"],
  { revalidate: 60, tags: ["campaigns"] },
);
