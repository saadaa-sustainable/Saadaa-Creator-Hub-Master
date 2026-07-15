"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  computeExpectedByCampaignMonth,
  monthKeyIST,
  monthLabel,
  nextVersionNumber,
} from "@/lib/budget-versions";
import {
  BudgetRowSchema,
  computeRowCompTotal,
  computeRowEstGarment,
  computeRowTotal,
  computeTotals,
} from "@/features/campaigns/schema";
import {
  NOTIFICATION_TYPES,
  resolveBudgetApproverEmails,
  sendNotification,
} from "@/lib/notifications";

export interface BudgetVersionActionResult {
  ok: boolean;
  error?: string;
}

interface VersionRow {
  id: number;
  campaign_id: string;
  version_number: number;
  kind: string;
  month: string;
  amount: number;
  num_creators: number;
  status: string;
  lines: unknown;
  note: string | null;
}

async function loadPendingVersion(
  supabase: ReturnType<typeof createServiceClient>,
  versionId: number,
): Promise<VersionRow | null> {
  const { data } = await (supabase as any)
    .from("campaign_budget_versions")
    .select(
      "id, campaign_id, version_number, kind, month, amount, num_creators, status, lines, note",
    )
    .eq("id", versionId)
    .eq("status", "pending_approval")
    .maybeSingle();
  return (data as VersionRow | null) ?? null;
}

function revalidateBudgetSurfaces() {
  revalidatePath("/budget");
  revalidatePath("/approvals");
  revalidateTag("approvals-count");
  revalidatePath("/campaigns");
  revalidatePath("/cost-analytics");
  revalidatePath("/onboarding");
}

/**
 * Approve a pending budget version — Global Admins only (`budget_approve`,
 * deliberately NOT implied by `admin`). On approval a top-up's draft lines
 * materialize into campaign_budget (raising the onboarding creator cap);
 * approving a V0 unlocks the campaign's own approval for the Admins.
 */
export async function approveBudgetVersion(
  versionId: number,
): Promise<BudgetVersionActionResult> {
  const actor = await assertPermission("budget_approve");
  const supabase = createServiceClient();

  const v = await loadPendingVersion(supabase, versionId);
  if (!v) return { ok: false, error: "This version isn't pending approval." };

  const now = new Date().toISOString();
  const { error } = await (supabase as any)
    .from("campaign_budget_versions")
    .update({
      status: "approved",
      approved_by: actor.name || actor.email,
      approved_at: now,
    })
    .eq("id", versionId)
    .eq("status", "pending_approval");
  if (error) return { ok: false, error: error.message };

  // Materialize a top-up's draft lines into campaign_budget so the creator
  // cap + Cost Analytics see the new allocation. V0 lines were already
  // inserted by submit_campaign and just carry this version's id.
  const draftLines = Array.isArray(v.lines) ? (v.lines as Array<Record<string, unknown>>) : [];
  if (v.kind === "top_up" && draftLines.length > 0) {
    const monthText = new Date(v.month + "T00:00:00Z").toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const rows = draftLines.map((l) => ({
      campaign_id: v.campaign_id,
      month_label: monthText,
      tier: l.tier ?? null,
      collab_type: l.collab_type ?? null,
      campaign_name: l.campaign_name ?? null,
      num_influencers: Number(l.num_influencers ?? 0),
      avg_comp: Number(l.avg_comp ?? 0),
      total_cost: Number(l.total_cost ?? 0),
      min_garments: Number(l.min_garments ?? 2),
      max_garments: Number(l.max_garments ?? 3),
      est_garment_cost: Number(l.est_garment_cost ?? 0),
      total_with_garments: Number(l.total_with_garments ?? 0),
      version_id: v.id,
    }));
    const { error: linesErr } = await (supabase as any)
      .from("campaign_budget")
      .insert(rows);
    if (linesErr) {
      console.error("[budget] top-up lines insert:", linesErr.message);
    }
  }

  await (supabase as any).from("approval_logs").insert({
    action_type: "Budget",
    action: "Approved",
    entity_id: `${v.campaign_id} · V${v.version_number}`,
    admin_email: actor.email,
    admin_name: actor.name,
    notes: `${v.kind === "initial" ? "First budget" : "Top-up"} of ₹${Number(
      v.amount,
    ).toLocaleString("en-IN")} for ${monthLabel(String(v.month).slice(0, 10))} approved.${
      v.note ? ` Reason given: ${v.note}` : ""
    }`,
  });

  revalidateBudgetSurfaces();
  return { ok: true };
}

const TopUpSchema = z.object({
  campaignId: z.string().trim().min(1, "Pick a campaign"),
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason for the budget increase — Global Admins see it"),
  numCreators: z.coerce.number().int().min(1, "How many creators?"),
  budgetRows: z.array(BudgetRowSchema).min(1, "Add at least one budget line"),
});

export interface TopUpResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  versionNumber?: number;
  amount?: number;
}

/**
 * New Campaign → "Add budget (existing campaign)". Creates the campaign's
 * next version as a PENDING top-up with the requester's reason; the draft
 * budget lines sit in `lines` jsonb and only materialize into campaign_budget
 * when a Global Admin approves (so the creator cap never counts unapproved
 * money). The campaign row itself is never touched.
 */
export async function submitBudgetTopUp(input: unknown): Promise<TopUpResult> {
  const actor = await assertPermission("campaign_create");

  const parsed = TopUpSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }
  const v = parsed.data;
  const supabase = createServiceClient();

  const { data: campRow } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, campaign_name, status, is_test")
    .eq("campaign_id", v.campaignId)
    .maybeSingle();
  const camp = campRow as {
    campaign_id: string;
    campaign_name: string | null;
    status: string | null;
    is_test: boolean | null;
  } | null;
  if (!camp) return { ok: false, error: "Campaign not found." };
  const st = (camp.status ?? "").toLowerCase();
  if (st !== "active") {
    return {
      ok: false,
      error:
        st === "closed"
          ? "This campaign is closed — reopen it before adding budget."
          : "Budget can be added only to a live (approved) campaign.",
    };
  }

  const { allocated, totalAll } = computeTotals(v.budgetRows);
  if (allocated === 0) {
    return {
      ok: false,
      error: "Allocate at least one influencer across the budget lines.",
      fieldErrors: { budgetRows: "Allocate >=1 influencer" },
    };
  }

  const versionNumber = await nextVersionNumber(supabase, v.campaignId);
  const lines = v.budgetRows.map((r) => ({
    tier: r.tier,
    collab_type: r.collabType,
    campaign_name: camp.campaign_name ?? r.campaignName,
    num_influencers: r.numInfluencers,
    avg_comp: r.avgComp,
    total_cost: computeRowCompTotal(r),
    min_garments: r.minGarments,
    max_garments: r.maxGarments,
    est_garment_cost: computeRowEstGarment(r),
    total_with_garments: computeRowTotal(r),
  }));

  const { error } = await (supabase as any)
    .from("campaign_budget_versions")
    .insert({
      campaign_id: v.campaignId,
      version_number: versionNumber,
      kind: "top_up",
      month: monthKeyIST(new Date()),
      amount: totalAll,
      num_creators: allocated,
      status: "pending_approval",
      note: v.reason,
      lines,
      created_by: actor.name || actor.email,
      is_test: Boolean(camp.is_test),
    });
  if (error) return { ok: false, error: error.message };

  await (supabase as any).from("approval_logs").insert({
    action_type: "Budget",
    action: "Submitted",
    entity_id: `${v.campaignId} · V${versionNumber}`,
    admin_email: actor.email,
    admin_name: actor.name,
    notes: `Top-up of ₹${totalAll.toLocaleString("en-IN")} (${allocated} creators) requested. Reason: ${v.reason}`,
  });

  const amountText = new Intl.NumberFormat("en-IN").format(totalAll);
  after(async () => {
    const approvers = await resolveBudgetApproverEmails();
    if (approvers.length === 0) return;
    await sendNotification({
      type: NOTIFICATION_TYPES.CAMPAIGN_CREATED,
      to: approvers,
      subject: `Budget approval needed · ${v.campaignId} V${versionNumber} — ₹${amountText} top-up`,
      title: "Budget top-up requested",
      subtitle: `CAMPAIGN ID: ${v.campaignId}`,
      htmlBody: `<p style="margin:0 0 10px;"><strong>${actor.name ?? actor.email}</strong> requested a top-up of <strong>INR ${amountText}</strong> (+${allocated} creators) on ${camp.campaign_name ?? v.campaignId}.</p><p style="margin:0 0 10px;"><strong>Reason:</strong> ${v.reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><p style="margin:0;">Approve or reject it on the <strong>Budget</strong> tab.</p>`,
      plainBody: `${actor.name ?? actor.email} requested a top-up of INR ${amountText} (+${allocated} creators) on ${v.campaignId}. Reason: ${v.reason}. Decide on the Budget tab.`,
      collabId: v.campaignId,
    });
  });

  revalidateBudgetSurfaces();
  return { ok: true, versionNumber, amount: totalAll };
}

/**
 * Context for the top-up form — which version number the submit will mint,
 * plus the campaign's CURRENT month money math (allocated / utilized /
 * remaining) so the team sees what's actually left before asking for more.
 */
export async function getTopUpContext(campaignId: string): Promise<{
  ok: boolean;
  nextVersion?: number;
  monthLabel?: string;
  allocated?: number;
  utilized?: number;
  remaining?: number;
  error?: string;
}> {
  await assertPermission("campaign_create");
  const id = (campaignId ?? "").trim();
  if (!id) return { ok: false, error: "campaign required" };
  const supabase = createServiceClient();
  const nowMonth = monthKeyIST(new Date());

  const [nextVersion, expectedMap, versionsRes] = await Promise.all([
    nextVersionNumber(supabase, id),
    computeExpectedByCampaignMonth(supabase),
    (supabase as any)
      .from("campaign_budget_versions")
      .select("amount, status, month")
      .eq("campaign_id", id)
      .eq("month", nowMonth)
      .in("status", ["approved", "closed"]),
  ]);

  const allocated = (
    (versionsRes?.data ?? []) as Array<{ amount: number }>
  ).reduce((s, v) => s + Number(v.amount ?? 0), 0);
  const utilized = expectedMap.get(id)?.get(nowMonth)?.expected ?? 0;

  return {
    ok: true,
    nextVersion,
    monthLabel: monthLabel(nowMonth),
    allocated,
    utilized,
    remaining: Math.max(0, allocated - utilized),
  };
}

/**
 * Admin annotation on a carry-forward: WHY the money wasn't utilized in its
 * original month. Keeps the auto-generated note; the human reason is stored
 * separately (gap_reason) and shown on the Budget tab so the gap is
 * documented.
 */
export async function setVersionGapReason(
  versionId: number,
  reason: string,
): Promise<BudgetVersionActionResult> {
  const actor = await assertPermission("admin");
  const supabase = createServiceClient();
  const clean = (reason ?? "").trim();
  const { error } = await (supabase as any)
    .from("campaign_budget_versions")
    .update({ gap_reason: clean || null })
    .eq("id", versionId);
  if (error) return { ok: false, error: error.message };

  await (supabase as any).from("approval_logs").insert({
    action_type: "Budget",
    action: "Gap reason noted",
    entity_id: `version #${versionId}`,
    admin_email: actor.email,
    admin_name: actor.name,
    notes: clean || "(cleared)",
  });
  revalidatePath("/budget");
  return { ok: true };
}

/** Reject a pending budget version. Rejecting a V0 rejects its campaign too. */
export async function rejectBudgetVersion(
  versionId: number,
  reason?: string,
): Promise<BudgetVersionActionResult> {
  const actor = await assertPermission("budget_approve");
  const supabase = createServiceClient();

  const v = await loadPendingVersion(supabase, versionId);
  if (!v) return { ok: false, error: "This version isn't pending approval." };

  const { error } = await (supabase as any)
    .from("campaign_budget_versions")
    .update({ status: "rejected" })
    .eq("id", versionId)
    .eq("status", "pending_approval");
  if (error) return { ok: false, error: error.message };

  // A campaign can't run on a rejected first budget — reject it with V0.
  if (v.kind === "initial") {
    await (supabase as any)
      .from("campaigns")
      .update({ status: "Rejected", updated_at: new Date().toISOString() })
      .eq("campaign_id", v.campaign_id)
      .ilike("status", "pending%");
  }

  await (supabase as any).from("approval_logs").insert({
    action_type: "Budget",
    action: "Rejected",
    entity_id: `${v.campaign_id} · V${v.version_number}`,
    admin_email: actor.email,
    admin_name: actor.name,
    notes:
      (reason ?? "").trim() ||
      (v.kind === "initial"
        ? "First budget rejected — campaign rejected with it."
        : "Top-up rejected."),
  });

  revalidateBudgetSurfaces();
  return { ok: true };
}
