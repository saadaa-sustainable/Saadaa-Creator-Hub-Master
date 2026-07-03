import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isOnboardedActive, isVoidedStatus } from "@/lib/workflow";

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
  /** Distinct onboarded-active creators currently consuming campaign slots. */
  creators_used?: number;
  /** Onboarded-active creators currently consuming campaign slots. */
  creator_rows?: CampaignCreatorListRow[];
  /** Reach-out creators assigned to the campaign before onboarding. */
  reachout_creator_rows?: CampaignCreatorListRow[];
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

export interface CampaignCreatorListRow {
  key: string;
  inf_id: string | null;
  username: string | null;
  inf_name: string | null;
  followers: number | null;
  category: string | null;
  state: string | null;
  profile_pic: string | null;
  instagram_link: string | null;
  workflow_status: string | null;
  collab_id: string | null;
  post_id_short: string | null;
  content_type: string | null;
  collab_type: string | null;
  reach_out_date: string | null;
  onboard_date: string | null;
  commercial_amount: number | null;
}

const CAMPAIGN_SELECT_WITH_DATES =
  "campaign_id, campaign_num, key_message, campaign_name, total_budget, no_of_creators, brief_link, internal_brief_link, status, start_date, end_date, created_at, updated_at";

const CAMPAIGN_SELECT_LEGACY =
  "campaign_id, campaign_num, key_message, campaign_name, total_budget, no_of_creators, brief_link, internal_brief_link, status, created_at, updated_at";

function isAssignedActiveStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("cancelled")) return false;
  return !isVoidedStatus(status);
}

function statusRank(status: string | null | undefined): number {
  switch (status) {
    case "Delivered":
      return 6;
    case "Posted":
      return 5;
    case "Order Sent":
      return 4;
    case "On Board":
      return 3;
    case "Reach Out":
      return 2;
    default:
      return 1;
  }
}

function latestDateValue(row: CampaignCreatorListRow): number {
  const parsed = Date.parse(row.onboard_date ?? row.reach_out_date ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function upsertCampaignCreator(
  map: Map<string, Map<string, CampaignCreatorListRow>>,
  campaignId: string,
  row: CampaignCreatorListRow,
) {
  const campaignCreators = map.get(campaignId) ?? new Map();
  const existing = campaignCreators.get(row.key);
  if (
    !existing ||
    statusRank(row.workflow_status) > statusRank(existing.workflow_status) ||
    latestDateValue(row) > latestDateValue(existing)
  ) {
    campaignCreators.set(row.key, row);
  }
  map.set(campaignId, campaignCreators);
}

function sortedCampaignCreators(
  rows: Iterable<CampaignCreatorListRow>,
): CampaignCreatorListRow[] {
  return Array.from(rows).sort(
    (a, b) =>
      statusRank(b.workflow_status) - statusRank(a.workflow_status) ||
      latestDateValue(b) - latestDateValue(a) ||
      String(a.username ?? a.inf_id ?? "").localeCompare(
        String(b.username ?? b.inf_id ?? ""),
      ),
  );
}

function profilePicFromCacheRow(raw: Record<string, unknown>): string | null {
  const payload = (raw.raw_json ??
    raw.profile_data ??
    raw.ig_data ??
    {}) as Record<string, unknown>;
  const profilePic = [
    raw.profile_pic,
    raw.pic,
    raw.profilePicUrl,
    raw.profile_pic_url,
    raw.profilePicUrlHD,
    payload.profile_pic,
    payload.pic,
    payload.profilePicUrl,
    payload.profile_pic_url,
    payload.profilePicUrlHD,
  ].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return profilePic ?? null;
}

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
      data = legacyResult.data as typeof data;
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

    // Keep the allocation count onboarded-only, but also hydrate the campaign
    // overview with assigned Reach Out creators for quick inspection.
    const { data: postRows } = await (supabase as any)
      .from("posts")
      .select(
        `
        id,
        campaign_id,
        inf_id,
        username,
        workflow_status,
        collab_id,
        post_id_short,
        content_type,
        collab_type,
        reach_out_date,
        onboard_date,
        commercial_amount,
        creator:creators (
          inf_id,
          username,
          inf_name,
          followers,
          category,
          state,
          profile_pic,
          instagram_link
        )
      `,
      )
      .in("campaign_id", ids)
      .limit(20000);

    const onboardedCreatorByCampaign = new Map<
      string,
      Map<string, CampaignCreatorListRow>
    >();
    const reachoutCreatorByCampaign = new Map<
      string,
      Map<string, CampaignCreatorListRow>
    >();
    const missingProfileUsernames = new Set<string>();
    (
      (postRows ?? []) as Array<{
        id: number;
        campaign_id: string | null;
        inf_id: string | null;
        username: string | null;
        workflow_status: string | null;
        collab_id: string | null;
        post_id_short: string | null;
        content_type: string | null;
        collab_type: string | null;
        reach_out_date: string | null;
        onboard_date: string | null;
        commercial_amount: number | null;
        creator: {
          inf_id: string | null;
          username: string | null;
          inf_name: string | null;
          followers: number | null;
          category: string | null;
          state: string | null;
          profile_pic: string | null;
          instagram_link: string | null;
        } | null;
      }>
    ).forEach((p) => {
      if (!isAssignedActiveStatus(p.workflow_status)) return;
      const cid = p.campaign_id ?? "";
      if (!cid) return;
      const username = (p.creator?.username ?? p.username ?? "").trim();
      const infId = (p.creator?.inf_id ?? p.inf_id ?? "").trim();
      const key = (infId || username || `post:${p.id}`).toLowerCase();
      const row: CampaignCreatorListRow = {
        key,
        inf_id: infId || null,
        username: username || null,
        inf_name: p.creator?.inf_name ?? null,
        followers: p.creator?.followers ?? null,
        category: p.creator?.category ?? null,
        state: p.creator?.state ?? null,
        profile_pic: p.creator?.profile_pic ?? null,
        instagram_link: p.creator?.instagram_link ?? null,
        workflow_status: p.workflow_status ?? null,
        collab_id: p.collab_id ?? null,
        post_id_short: p.post_id_short ?? null,
        content_type: p.content_type ?? null,
        collab_type: p.collab_type ?? null,
        reach_out_date: p.reach_out_date ?? null,
        onboard_date: p.onboard_date ?? null,
        commercial_amount: p.commercial_amount ?? null,
      };

      if (row.username && !row.profile_pic) {
        missingProfileUsernames.add(row.username.toLowerCase());
      }

      if (isOnboardedActive(row.workflow_status)) {
        upsertCampaignCreator(onboardedCreatorByCampaign, cid, row);
      }
      if (row.workflow_status === "Reach Out") {
        upsertCampaignCreator(reachoutCreatorByCampaign, cid, row);
      }
    });

    if (missingProfileUsernames.size > 0) {
      const { data: cacheRows, error: cacheErr } = await (supabase as any)
        .from("instagram_cache")
        .select("*")
        .in("username", Array.from(missingProfileUsernames));

      if (cacheErr) {
        console.error(
          "[campaigns] instagram_cache avatar fallback:",
          cacheErr.message,
        );
      } else {
        const cacheProfileByUsername = new Map<string, string>();
        for (const raw of (cacheRows ?? []) as Record<string, unknown>[]) {
          const username =
            typeof raw.username === "string"
              ? raw.username.trim().toLowerCase()
              : "";
          if (!username) continue;
          const profilePic = profilePicFromCacheRow(raw);
          if (profilePic) cacheProfileByUsername.set(username, profilePic);
        }

        for (const campaignCreators of [
          ...onboardedCreatorByCampaign.values(),
          ...reachoutCreatorByCampaign.values(),
        ]) {
          for (const row of campaignCreators.values()) {
            const username = row.username?.trim().toLowerCase();
            if (!username || row.profile_pic) continue;
            row.profile_pic = cacheProfileByUsername.get(username) ?? null;
          }
        }
      }
    }

    return campaignRows.map((campaign) => {
      const onboardedCreators = sortedCampaignCreators(
        onboardedCreatorByCampaign.get(campaign.campaign_id)?.values() ?? [],
      );
      const reachoutCreators = sortedCampaignCreators(
        reachoutCreatorByCampaign.get(campaign.campaign_id)?.values() ?? [],
      );

      return {
        ...campaign,
        budget_rows: budgetByCampaign.get(campaign.campaign_id) ?? [],
        creator_rows: onboardedCreators,
        reachout_creator_rows: reachoutCreators,
        creators_used: onboardedCreators.length,
      };
    });
  },
  ["campaigns-list"],
  { revalidate: 60, tags: ["campaigns"] },
);
