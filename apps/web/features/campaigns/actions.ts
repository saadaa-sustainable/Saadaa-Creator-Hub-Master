"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  CampaignCreateSchema,
  computeRowEstGarment,
  computeTotals,
} from "./schema";

export type CampaignCreateResult =
  | {
      ok: true;
      campaignId: string;
      campaignNum: number;
      totalBudget: number;
      message: string;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Server action — atomic campaign create. Delegates to submit_campaign RPC.
 * Mirrors legacy submitCampaign behavior (server gens IFC{NNN}, writes
 * campaigns + campaign_budget). Mirrors to legacy Sheet best-effort.
 */
export async function submitCampaign(
  input: unknown,
): Promise<CampaignCreateResult> {
  const actor = await assertPermission("campaign_create");

  const parsed = CampaignCreateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const v = parsed.data;
  const { allocated, totalComp, totalAll } = computeTotals(v.budgetRows);
  if (allocated === 0) {
    return {
      ok: false,
      error: "Allocate at least one influencer across budget lines.",
      fieldErrors: { budgetRows: "Allocate >=1 influencer" },
    };
  }

  const supabase = createServiceClient();

  const now = new Date();
  const monthLabel = now.toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const form = {
    campaign_name: v.campaignName,
    key_message: v.keyMessage,
    start_date: v.startDate || null,
    end_date: v.endDate || null,
    brief_link: v.briefLink,
    internal_brief_link: v.internalBrief,
    no_of_creators: v.numCreators,
  };

  const budgetRows = v.budgetRows.map((r) => ({
    tier: r.tier,
    collab_type: r.collabType,
    campaign_name: r.campaignName,
    num_influencers: r.numInfluencers,
    avg_comp: r.avgComp,
    min_garments: r.minGarments,
    max_garments: r.maxGarments,
    est_garment_cost: computeRowEstGarment(r),
  }));

  const { data, error } = await (supabase as any)
    .rpc("submit_campaign", {
      p_form: form,
      p_budget_rows: budgetRows,
      p_month_label: monthLabel,
    })
    .single();

  if (error) return { ok: false, error: error.message };

  const row = data as {
    campaign_id: string;
    campaign_num: number;
    total_budget: number;
  };

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  revalidateTag("campaigns");
  revalidatePath("/campaigns");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/onboarding");

  const formattedBudget = new Intl.NumberFormat("en-IN").format(
    row.total_budget,
  );

  return {
    ok: true,
    campaignId: row.campaign_id,
    campaignNum: row.campaign_num,
    totalBudget: row.total_budget,
    message: `Campaign "${row.campaign_id} - ${v.campaignName}" created. ₹${formattedBudget} total budget (compensation only). With garments: ₹${new Intl.NumberFormat("en-IN").format(totalAll)}.`,
  };
}
