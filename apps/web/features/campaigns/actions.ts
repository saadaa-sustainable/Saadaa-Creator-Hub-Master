"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { assertCreateAllowed } from "@/lib/test-mode";
import { createServiceClient } from "@/lib/supabase/server";
import { voidUnonboardedForCampaign } from "@/lib/campaign-lifecycle";
import { stampTestRows } from "@/features/settings/actions";
import { formatDate } from "@/lib/formatters";
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

type ActorLike = {
  email?: string | null;
  name?: string | null;
};

function actorEmail(actor: ActorLike): string | null {
  return (actor.email ?? "").trim().toLowerCase() || null;
}

function actorName(actor: ActorLike): string | null {
  return (actor.name ?? "").trim() || actorEmail(actor);
}

async function logApprovalEvent(
  supabase: any,
  input: {
    actionType: string;
    action: string;
    entityId: string;
    actor?: ActorLike;
    notes?: string | null;
    versionId?: string | number | null;
  },
): Promise<void> {
  const { error } = await supabase.from("approval_logs").insert({
    action_type: input.actionType,
    action: input.action,
    entity_id: input.entityId,
    version_id:
      input.versionId === null || input.versionId === undefined
        ? null
        : String(input.versionId),
    admin_email: input.actor ? actorEmail(input.actor) : null,
    admin_name: input.actor ? actorName(input.actor) : null,
    notes: (input.notes ?? "").trim() || null,
  });

  if (error) {
    console.error(
      "[campaigns] approval/audit log insert failed:",
      error.message,
    );
    return;
  }

  revalidatePath("/audit-log");
}

function campaignEditRequestPayload(
  input: CampaignCreateInput,
  totalBudget: number,
): CampaignCreateInput & { totalBudget: number } {
  return {
    ...input,
    budgetRows: input.budgetRows.map((row) => ({ ...row })),
    totalBudget,
  };
}

async function fetchCampaignSnapshot(supabase: any, campaignId: string) {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select(
      "campaign_id, campaign_name, key_message, start_date, end_date, brief_link, internal_brief_link, no_of_creators, total_budget, status, created_by, created_at, updated_at",
    )
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) return { error: error.message, campaign: null, budgetRows: [] };
  if (!campaign)
    return {
      error: `Campaign ${campaignId} not found.`,
      campaign: null,
      budgetRows: [],
    };

  const { data: budgetRows, error: budgetError } = await supabase
    .from("campaign_budget")
    .select(
      "id, campaign_id, month_label, tier, collab_type, campaign_name, num_influencers, avg_comp, min_garments, max_garments, est_garment_cost, total_with_garments",
    )
    .eq("campaign_id", campaignId)
    .order("id", { ascending: true });

  if (budgetError) {
    return { error: budgetError.message, campaign, budgetRows: [] };
  }

  return { error: null, campaign, budgetRows: budgetRows ?? [] };
}

async function applyCampaignEdit(
  supabase: any,
  campaignId: string,
  input: CampaignCreateInput,
  totalBudget: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: updateErr } = await supabase
    .from("campaigns")
    .update({
      campaign_name: input.campaignName,
      key_message: input.keyMessage,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      brief_link: input.briefLink,
      internal_brief_link: input.internalBrief,
      no_of_creators: input.numCreators,
      total_budget: totalBudget,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId);
  if (updateErr) return { ok: false, error: updateErr.message };

  // Preserve the original month_label so monthly roll-ups stay stable across
  // edits; fall back to the current month if no prior rows exist.
  const { data: priorBudget } = await supabase
    .from("campaign_budget")
    .select("month_label")
    .eq("campaign_id", campaignId)
    .limit(1);
  const now = new Date();
  const monthLabel =
    (Array.isArray(priorBudget) && priorBudget[0]?.month_label) ||
    now.toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });

  const { error: deleteErr } = await supabase
    .from("campaign_budget")
    .delete()
    .eq("campaign_id", campaignId);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  const budgetRows = input.budgetRows.map((r) => ({
    campaign_id: campaignId,
    month_label: monthLabel,
    tier: r.tier,
    collab_type: r.collabType,
    campaign_name: r.campaignName,
    num_influencers: r.numInfluencers,
    avg_comp: r.avgComp,
    min_garments: r.minGarments,
    max_garments: r.maxGarments,
  }));

  const { error: insertErr } = await supabase
    .from("campaign_budget")
    .insert(budgetRows);
  if (insertErr) return { ok: false, error: insertErr.message };

  return { ok: true };
}

/**
 * Server action — atomic campaign create. Delegates to submit_campaign RPC.
 * Mirrors legacy submitCampaign behavior (server gens IFC{NNN}, writes
 * campaigns + campaign_budget). Mirrors to legacy Sheet best-effort.
 */
export async function submitCampaign(
  input: unknown,
): Promise<CampaignCreateResult> {
  const actor = await assertPermission("campaign_create");
  await assertCreateAllowed("campaign", actor, "Campaigns");

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

  // Stamp campaign ownership. The submit_campaign RPC has a fixed signature, so
  // we set created_by in a follow-up service-role UPDATE. The owner (+ Global
  // Admins) can edit/close/reopen, and the Campaign Ending alert targets them.
  // Best-effort: a failed stamp leaves created_by NULL (owner "unknown").
  // New campaigns land as 'Pending Approval' (Approvals gate) — an admin must
  // approve before the campaign goes live. Stamped together with the owner.
  const { error: ownerErr } = await (supabase as any)
    .from("campaigns")
    .update({ created_by: actor.email, status: "Pending Approval" })
    .eq("campaign_id", row.campaign_id);
  if (ownerErr) {
    console.error("[campaigns] created_by stamp failed:", ownerErr.message);
  }

  // Test Mode: when the Campaigns scope is on, mark this new campaign is_test=true
  // so it never pollutes real reporting (no-op when Test Mode is off).
  await stampTestRows([
    {
      scope: "campaign",
      table: "campaigns",
      idColumn: "campaign_id",
      ids: [row.campaign_id],
    },
  ]);

  await logApprovalEvent(supabase, {
    actionType: "Campaign",
    action: "Submitted",
    entityId: row.campaign_id,
    actor,
    notes: "New campaign submitted for approval.",
  });

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
  const budgetForEmail = new Intl.NumberFormat("en-IN").format(
    row.total_budget,
  );
  after(async () => {
    // 1. Admin broadcast — actor excluded to avoid double-emailing them.
    const admins = await resolveGlobalAdminEmails();
    const adminRecipients = Array.from(
      new Set(admins.filter((e) => e && e.includes("@") && e !== creatorEmail)),
    );
    if (adminRecipients.length > 0) {
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
        { label: "Key Message", value: v.keyMessage },
        {
          label: "Start Date",
          value: v.startDate ? formatDate(v.startDate) : null,
        },
        { label: "End Date", value: v.endDate ? formatDate(v.endDate) : null },
        { label: "No. of Creators", value: v.numCreators || null },
        { label: "Influencers Allocated", value: allocated },
        { label: "Total Compensation", value: `INR ${budgetForEmail}` },
        {
          label: "Total Budget (with garments)",
          value: `INR ${new Intl.NumberFormat("en-IN").format(totalAll)}`,
        },
        { label: "Brief Link", value: v.briefLink || null },
        { label: "Internal Brief", value: v.internalBrief || null },
      ],
      collabId: createdById,
    });
  });

  revalidateTag("campaigns");
  revalidatePath("/campaigns");
  revalidatePath("/approvals");  revalidateTag("approvals-count");
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
 * Server action — submit an existing campaign edit for admin approval. The live
 * campaign is not changed until Approvals accepts the request; approval then
 * replaces the `campaign_budget` rows and recomputes total_budget.
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
  const actor = await assertPermission("campaign_edit");

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

  const snapshot = await fetchCampaignSnapshot(supabase, id);
  if (snapshot.error || !snapshot.campaign) {
    return { ok: false, error: snapshot.error ?? `Campaign ${id} not found.` };
  }

  const { data: pendingEdit, error: pendingErr } = await (supabase as any)
    .from("campaign_approval_requests")
    .select("id")
    .eq("campaign_id", id)
    .eq("request_type", "edit")
    .eq("status", "Pending Approval")
    .maybeSingle();
  if (pendingErr) return { ok: false, error: pendingErr.message };
  if (pendingEdit) {
    return {
      ok: false,
      error: `${id} already has an edit awaiting approval.`,
    };
  }

  // D8 — count reach-outs already tied to this campaign (commercials unchanged).
  const { count: tiedCount } = await (supabase as any)
    .from("posts")
    .select("post_id", { count: "exact", head: true })
    .eq("campaign_id", id);

  // total_budget mirrors submit_campaign: compensation + garment cost.
  const totalBudget = totalAll;

  const requestPayload = campaignEditRequestPayload(v, totalBudget);
  const { data: request, error: requestErr } = await (supabase as any)
    .from("campaign_approval_requests")
    .insert({
      request_type: "edit",
      campaign_id: id,
      status: "Pending Approval",
      requested_by_email: actorEmail(actor),
      requested_by_name: actorName(actor),
      request_payload: requestPayload,
      before_payload: {
        campaign: snapshot.campaign,
        budgetRows: snapshot.budgetRows,
      },
      notes: `Edit submitted for ${id}.`,
    })
    .select("id")
    .single();
  if (requestErr) return { ok: false, error: requestErr.message };

  await logApprovalEvent(supabase, {
    actionType: "Campaign Edit",
    action: "Submitted",
    entityId: id,
    versionId: request?.id,
    actor,
    notes: `Edit submitted for approval. Proposed budget: ₹${new Intl.NumberFormat("en-IN").format(totalBudget)}.`,
  });

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  revalidateTag("campaigns");
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/new");
  revalidatePath("/approvals");  revalidateTag("approvals-count");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/onboarding");

  const formattedBudget = new Intl.NumberFormat("en-IN").format(totalBudget);
  const tied = typeof tiedCount === "number" ? tiedCount : 0;

  return {
    ok: true,
    campaignId: id,
    totalBudget,
    message: `Campaign "${id} - ${v.campaignName}" edit sent for approval. ₹${formattedBudget} proposed budget (with garments).`,
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
  await assertPermission("campaign_edit");
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

  const numericTier = (
    t: string | null,
  ): CampaignCreateInput["budgetRows"][number]["tier"] => {
    const match = (INFLUENCER_TIERS as readonly string[]).find((x) => x === t);
    return (match ??
      "Mid tier (50K to 500K)") as CampaignCreateInput["budgetRows"][number]["tier"];
  };
  const collab = (
    c: string | null,
  ): CampaignCreateInput["budgetRows"][number]["collabType"] =>
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

export interface CampaignStatusResult {
  ok: boolean;
  error?: string;
}

/**
 * Manually close a campaign. Campaign Owner + Global Admin only. Sets
 * status='Closed'. The daily cron also auto-closes campaigns past their
 * end_date (app/api/cron/notifications/route.ts).
 */
export async function closeCampaign(
  campaignId: string,
): Promise<CampaignStatusResult> {
  const actor = await assertPermission("campaign_edit");
  const id = (campaignId ?? "").trim();
  if (!id) return { ok: false, error: "Campaign ID is required." };

  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("campaigns")
    .update({ status: "Closed", updated_at: new Date().toISOString() })
    .eq("campaign_id", id);
  if (error) return { ok: false, error: error.message };

  // Void the un-onboarded reach-out leftovers now that the campaign is closed.
  await voidUnonboardedForCampaign(id);

  await logApprovalEvent(supabase, {
    actionType: "Campaign",
    action: "Closed",
    entityId: id,
    actor,
    notes: "Campaign manually closed.",
  });

  revalidatePath("/campaigns");
  revalidatePath("/reach-out");
  revalidatePath("/approvals");  revalidateTag("approvals-count");
  return { ok: true };
}

/**
 * Reopen a closed campaign. Campaign Owner + Global Admin only. Sets
 * status='Active' and stamps auto_closed_at so the daily end-date auto-close
 * never re-closes a deliberately reopened campaign.
 */
export async function reopenCampaign(
  campaignId: string,
): Promise<CampaignStatusResult> {
  const actor = await assertPermission("campaign_edit");
  const id = (campaignId ?? "").trim();
  if (!id) return { ok: false, error: "Campaign ID is required." };

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await (supabase as any)
    .from("campaigns")
    .update({ status: "Active", auto_closed_at: now, updated_at: now })
    .eq("campaign_id", id);
  if (error) return { ok: false, error: error.message };

  await logApprovalEvent(supabase, {
    actionType: "Campaign",
    action: "Reopened",
    entityId: id,
    actor,
    notes: "Campaign manually reopened.",
  });

  revalidatePath("/campaigns");
  revalidatePath("/approvals");  revalidateTag("approvals-count");
  return { ok: true };
}

export async function approveCampaignEditRequest(
  requestId: number,
): Promise<CampaignStatusResult> {
  const actor = await assertPermission("admin");
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Approval request ID is required." };
  }

  const supabase = createServiceClient();
  const { data: request, error } = await (supabase as any)
    .from("campaign_approval_requests")
    .select("id, campaign_id, status, request_payload")
    .eq("id", id)
    .eq("status", "Pending Approval")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!request) return { ok: false, error: "Edit request isn't pending." };

  const parsed = CampaignCreateSchema.safeParse(request.request_payload);
  if (!parsed.success) {
    return { ok: false, error: "Stored edit request failed validation." };
  }

  const { allocated, totalAll } = computeTotals(parsed.data.budgetRows);
  if (allocated === 0) {
    return {
      ok: false,
      error: "Stored edit request has no allocated creators.",
    };
  }

  const applied = await applyCampaignEdit(
    supabase,
    request.campaign_id,
    parsed.data,
    totalAll,
  );
  if (!applied.ok) return applied;

  const now = new Date().toISOString();
  const { error: updateErr } = await (supabase as any)
    .from("campaign_approval_requests")
    .update({
      status: "Approved",
      decided_at: now,
      decided_by_email: actorEmail(actor),
      decided_by_name: actorName(actor),
    })
    .eq("id", id);
  if (updateErr) return { ok: false, error: updateErr.message };

  await logApprovalEvent(supabase, {
    actionType: "Campaign Edit",
    action: "Approved",
    entityId: request.campaign_id,
    versionId: id,
    actor,
    notes: "Campaign edit approved and applied.",
  });

  revalidateTag("campaigns");
  revalidatePath("/approvals");  revalidateTag("approvals-count");
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/new");
  revalidatePath("/dashboard");
  revalidatePath("/reach-out");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function rejectCampaignEditRequest(
  requestId: number,
  notes?: string,
): Promise<CampaignStatusResult> {
  const actor = await assertPermission("admin");
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Approval request ID is required." };
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data: request, error } = await (supabase as any)
    .from("campaign_approval_requests")
    .update({
      status: "Rejected",
      decided_at: now,
      decided_by_email: actorEmail(actor),
      decided_by_name: actorName(actor),
      decision_notes: (notes ?? "").trim() || null,
    })
    .eq("id", id)
    .eq("status", "Pending Approval")
    .select("id, campaign_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!request) return { ok: false, error: "Edit request isn't pending." };

  await logApprovalEvent(supabase, {
    actionType: "Campaign Edit",
    action: "Rejected",
    entityId: request.campaign_id,
    versionId: id,
    actor,
    notes: (notes ?? "").trim() || null,
  });

  revalidatePath("/approvals");  revalidateTag("approvals-count");
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/new");
  return { ok: true };
}

/**
 * Approve a pending campaign (Approvals gate). Global Admin only. Flips
 * 'Pending Approval' → 'Active' atomically (only matches pending rows, so a
 * double-approve is a no-op) and logs to approval_logs (feeds the Audit Log).
 */
export async function approveCampaign(
  campaignId: string,
): Promise<CampaignStatusResult> {
  const actor = await assertPermission("admin");
  const id = (campaignId ?? "").trim();
  if (!id) return { ok: false, error: "Campaign ID is required." };

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from("campaigns")
    .update({ status: "Active", updated_at: now })
    .eq("campaign_id", id)
    .ilike("status", "pending%")
    .select("campaign_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data)
    return {
      ok: false,
      error: "Campaign isn't pending approval (already approved or rejected).",
    };

  await logApprovalEvent(supabase, {
    actionType: "Campaign",
    action: "Approved",
    entityId: id,
    actor,
    notes: "Campaign approved and activated.",
  });

  revalidatePath("/approvals");  revalidateTag("approvals-count");
  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  revalidatePath("/reach-out");
  return { ok: true };
}

/**
 * Reject a pending campaign. Global Admin only. Flips 'Pending Approval' →
 * 'Rejected' atomically + logs the reason to approval_logs.
 */
export async function rejectCampaign(
  campaignId: string,
  notes?: string,
): Promise<CampaignStatusResult> {
  const actor = await assertPermission("admin");
  const id = (campaignId ?? "").trim();
  if (!id) return { ok: false, error: "Campaign ID is required." };

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from("campaigns")
    .update({ status: "Rejected", updated_at: now })
    .eq("campaign_id", id)
    .ilike("status", "pending%")
    .select("campaign_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Campaign isn't pending approval." };

  await logApprovalEvent(supabase, {
    actionType: "Campaign",
    action: "Rejected",
    entityId: id,
    actor,
    notes: (notes ?? "").trim() || null,
  });

  revalidatePath("/approvals");  revalidateTag("approvals-count");
  revalidatePath("/campaigns");
  return { ok: true };
}
