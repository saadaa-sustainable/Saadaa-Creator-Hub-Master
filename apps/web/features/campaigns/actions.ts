"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
  resolveGlobalAdminEmails,
  sendNotification,
} from "@/lib/notifications";
import {
  CampaignCreateSchema,
  computeRowEstGarment,
  computeTotals,
  INFLUENCER_TIERS,
  MIN_GARMENTS_FIXED,
  type CampaignCreateInput,
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

export type CampaignEditResult =
  | {
      ok: true;
      campaignId: string;
      totalBudget: number;
      message: string;
      /** Present when reach-outs are already tied to this campaign (D8). */
      warning?: string;
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

  // ── Notifications: Campaign Created broadcast + submitter confirmation ───
  // Two distinct emails, deduped so the actor is never double-mailed:
  //   1. Wave 7 "Campaign Created" broadcast → active Global Admins ONLY
  //      (the actor is excluded here — they get the dedicated confirmation
  //      below instead, so they receive exactly one campaign email).
  //   2. Submitter confirmation (campaign_confirmation) → the actor.
  // Both fire-and-forget via after(); best-effort, never block the response.
  const createdById = row.campaign_id;
  const createdName = v.campaignName;
  const creatorEmail = (actor.email ?? "").trim().toLowerCase();
  const creatorName = actor.name ?? actor.email ?? "a team member";
  const budgetForEmail = new Intl.NumberFormat("en-IN").format(row.total_budget);
  after(async () => {
    // 1. Admin broadcast — actor excluded to avoid double-emailing them.
    const admins = await resolveGlobalAdminEmails();
    const adminRecipients = Array.from(
      new Set(
        admins.filter((e) => e && e.includes("@") && e !== creatorEmail),
      ),
    );
    if (adminRecipients.length > 0) {
      const esc = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const bodyHtml = `
      <p style="margin:0 0 12px;">A new campaign was just created in CreatorHub.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">
        <tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;font-weight:800;width:40%;">Campaign ID</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;">${esc(createdById)}</td></tr>
        <tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Campaign Name</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">${esc(createdName)}</td></tr>
        <tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Total Budget</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">INR ${budgetForEmail}</td></tr>
        <tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Created By</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">${esc(creatorName)}</td></tr>
      </table>
      <p style="margin:0;font-size:12px;color:#9A9384;">Reach-outs can now be allocated against this campaign.</p>`;
      const plainBody =
        `A new campaign was created in CreatorHub.\n\n` +
        `Campaign ID: ${createdById}\nCampaign Name: ${createdName}\n` +
        `Total Budget: INR ${budgetForEmail}\nCreated By: ${creatorName}`;
      await sendNotification({
        type: NOTIFICATION_TYPES.CAMPAIGN_CREATED,
        to: adminRecipients,
        subject: `Campaign Created · ${createdById} — ${createdName}`,
        title: "Campaign Created",
        subtitle: `CAMPAIGN ID: ${createdById}`,
        htmlBody: bodyHtml,
        plainBody,
        collabId: createdById,
      });
    }

    // 2. Submitter confirmation — the actor's own "you created this" email.
    await notifyActorConfirmation({
      actor,
      type: NOTIFICATION_TYPES.CAMPAIGN_CONFIRMATION,
      subject: `Campaign ${createdById} created`,
      title: "Campaign created",
      subtitle: `CAMPAIGN ID: ${createdById}`,
      summaryLines: [
        `Your campaign "${createdName}" was created. Reach-outs can now be allocated against it.`,
      ],
      rows: [
        { label: "Campaign ID", value: createdById },
        { label: "Campaign Name", value: createdName },
        { label: "Total Budget", value: `INR ${budgetForEmail}` },
      ],
      collabId: createdById,
    });
  });

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

/**
 * Server action — edit an existing campaign. UPDATEs the `campaigns` row and
 * REPLACES its `campaign_budget` rows (delete-then-insert), then recomputes
 * total_budget = compensation + garment cost. No RPC — IDs are already minted;
 * there is no counter to serialise. Validated with the same CampaignCreateSchema.
 *
 * DECISION D8 (applied, not changed): editing avg_comp / num_influencers does
 * NOT retroactively rewrite existing posts' commercial_amount; posts already
 * paid are never touched. If reach-outs are already tied to this campaign, the
 * edit is still allowed but the result carries a `warning` with the count.
 */
export async function editCampaign(
  campaignId: string,
  input: unknown,
): Promise<CampaignEditResult> {
  await assertPermission("campaign_create");

  const id = (campaignId ?? "").trim();
  if (!id) return { ok: false, error: "Campaign ID is required." };

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
  const { allocated, totalAll } = computeTotals(v.budgetRows);
  if (allocated === 0) {
    return {
      ok: false,
      error: "Allocate at least one influencer across budget lines.",
      fieldErrors: { budgetRows: "Allocate >=1 influencer" },
    };
  }

  const supabase = createServiceClient();

  // Guard — campaign must exist before we delete/replace its budget rows.
  const { data: existing, error: existingErr } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id")
    .eq("campaign_id", id)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (!existing) return { ok: false, error: `Campaign ${id} not found.` };

  // D8 — count reach-outs already tied to this campaign (commercials unchanged).
  const { count: tiedCount } = await (supabase as any)
    .from("posts")
    .select("post_id", { count: "exact", head: true })
    .eq("campaign_id", id);

  // total_budget mirrors submit_campaign: compensation + garment cost.
  const totalBudget = totalAll;

  const { error: updateErr } = await (supabase as any)
    .from("campaigns")
    .update({
      campaign_name: v.campaignName,
      key_message: v.keyMessage,
      start_date: v.startDate || null,
      end_date: v.endDate || null,
      brief_link: v.briefLink,
      internal_brief_link: v.internalBrief,
      no_of_creators: v.numCreators,
      total_budget: totalBudget,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", id);
  if (updateErr) return { ok: false, error: updateErr.message };

  // Preserve the original month_label so monthly roll-ups stay stable across
  // edits; fall back to the current month if no prior rows exist.
  const { data: priorBudget } = await (supabase as any)
    .from("campaign_budget")
    .select("month_label")
    .eq("campaign_id", id)
    .limit(1);
  const now = new Date();
  const monthLabel =
    (Array.isArray(priorBudget) && priorBudget[0]?.month_label) ||
    now.toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });

  // REPLACE budget rows — delete existing, insert the new set. Only raw inputs;
  // total_cost / est_garment_cost / total_with_garments are GENERATED columns.
  const { error: deleteErr } = await (supabase as any)
    .from("campaign_budget")
    .delete()
    .eq("campaign_id", id);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  const budgetRows = v.budgetRows.map((r) => ({
    campaign_id: id,
    month_label: monthLabel,
    tier: r.tier,
    collab_type: r.collabType,
    campaign_name: r.campaignName,
    num_influencers: r.numInfluencers,
    avg_comp: r.avgComp,
    min_garments: r.minGarments,
    max_garments: r.maxGarments,
  }));

  const { error: insertErr } = await (supabase as any)
    .from("campaign_budget")
    .insert(budgetRows);
  if (insertErr) return { ok: false, error: insertErr.message };

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  revalidateTag("campaigns");
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/new");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/onboarding");

  const formattedBudget = new Intl.NumberFormat("en-IN").format(totalBudget);
  const tied = typeof tiedCount === "number" ? tiedCount : 0;

  return {
    ok: true,
    campaignId: id,
    totalBudget,
    message: `Campaign "${id} - ${v.campaignName}" updated. ₹${formattedBudget} total budget (with garments).`,
    ...(tied > 0
      ? {
          warning: `${tied} reach-out${tied === 1 ? "" : "s"} already tied; their commercials unchanged.`,
        }
      : {}),
  };
}

/**
 * Fetch a single campaign + its budget rows, shaped for the create-form's
 * EDIT prefill (CampaignCreateInput). Service-role read (RLS bypass) —
 * permission-gated like the edit action itself.
 */
export async function fetchCampaignForEdit(campaignId: string): Promise<{
  campaignId: string;
  initial: CampaignCreateInput;
} | null> {
  await assertPermission("campaign_create");
  const id = (campaignId ?? "").trim();
  if (!id) return null;

  const supabase = createServiceClient();

  const { data: campaign, error } = await (supabase as any)
    .from("campaigns")
    .select(
      "campaign_id, campaign_name, key_message, start_date, end_date, brief_link, internal_brief_link, no_of_creators",
    )
    .eq("campaign_id", id)
    .maybeSingle();
  if (error || !campaign) return null;

  const { data: budget } = await (supabase as any)
    .from("campaign_budget")
    .select(
      "tier, collab_type, campaign_name, num_influencers, avg_comp, min_garments, max_garments",
    )
    .eq("campaign_id", id)
    .order("id", { ascending: true });

  const numericTier = (t: string | null): CampaignCreateInput["budgetRows"][number]["tier"] => {
    const match = (INFLUENCER_TIERS as readonly string[]).find((x) => x === t);
    return (match ?? "Mid tier (50K to 500K)") as CampaignCreateInput["budgetRows"][number]["tier"];
  };
  const collab = (c: string | null): CampaignCreateInput["budgetRows"][number]["collabType"] =>
    c === "Paid" ? "Paid" : "Barter";

  const budgetRows: CampaignCreateInput["budgetRows"] = (
    (budget ?? []) as Array<Record<string, unknown>>
  ).map((r) => ({
    tier: numericTier(r.tier as string | null),
    collabType: collab(r.collab_type as string | null),
    campaignName: (r.campaign_name as string | null) ?? "",
    numInfluencers: Number(r.num_influencers ?? 0),
    avgComp: Number(r.avg_comp ?? 0),
    minGarments: Number(r.min_garments ?? MIN_GARMENTS_FIXED),
    maxGarments: Number(r.max_garments ?? 3),
  }));

  const initial: CampaignCreateInput = {
    campaignName: (campaign.campaign_name as string | null) ?? "",
    keyMessage: (campaign.key_message as string | null) ?? "",
    startDate: (campaign.start_date as string | null) ?? "",
    endDate: (campaign.end_date as string | null) ?? "",
    numCreators:
      campaign.no_of_creators == null ? "" : String(campaign.no_of_creators),
    briefLink: (campaign.brief_link as string | null) ?? "",
    internalBrief: (campaign.internal_brief_link as string | null) ?? "",
    budgetRows,
  };

  return { campaignId: id, initial };
}
