"use server";

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { isOnboardedActive } from "@/lib/workflow";
import {
  NOTIFICATION_TYPES,
  resolveGlobalAdminEmails,
  sendNotification,
  wrapNotificationHtml,
} from "@/lib/notifications";
import { checkReachoutAllowed } from "@/features/reach-out/guards";
import { CONTENT_CODES } from "@/features/reach-out/content-codes";
import {
  EDITABLE_FIELDS,
  ONBOARDING_EDIT_DIFF_LABELS,
  ONBOARDING_EDIT_FIELD_LABELS,
  type OnboardingEditField,
  type OnboardingEditForm,
} from "./edit-fields";

/**
 * Onboarding edit → approval flow (actions).
 *
 * A team member can correct a submitted onboarding (e.g. a wrong order_id). The
 * change is NOT applied directly — it is held as an `onboarding_edit_requests`
 * row (status 'Pending Approval'), global admins are emailed, and it appears in
 * /approvals with a before/after diff. While pending, posting for the whole
 * collab is blocked (see features/posting/actions.ts). On approval the `after`
 * snapshot is applied to every deliverable of the collab; on rejection it is
 * discarded. Field constants + types live in ./edit-fields (client-safe).
 */

type EditTarget = { collabId?: string; rowId?: number };

const reachoutRequestKey = (rowId: number) => `reachout:${rowId}`;
const legacyOnboardingRequestKey = (rowId: number) => `legacy:${rowId}`;

export async function getOnboardingEditForm(
  target: EditTarget,
): Promise<
  { ok: true; form: OnboardingEditForm } | { ok: false; error: string }
> {
  await assertPermission("onboarding_write");
  const cid = (target.collabId ?? "").trim();
  const rowId = Number(target.rowId ?? 0);
  if (rowId <= 0 && !cid)
    return { ok: false, error: "Collab ID missing" };

  const supabase = createServiceClient();
  const columns =
    "id, post_id, inf_id, username, campaign_id, content_type, workflow_status, order_id, collab_type, commercial_amount, ads_usage_rights, est_delivery, bank_name, bank_number, ifsc, collab_id, collab_number";
  let seed: Record<string, any> | null = null;
  if (rowId > 0) {
    const { data, error } = await (supabase as any)
      .from("posts")
      .select(columns)
      .eq("id", rowId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    seed = data;
    if (!seed)
      return { ok: false, error: `Onboarding row ${rowId} not found` };
  }
  const kind = seed?.workflow_status === "Reach Out" ? "reachout" : "onboarding";
  let rowsQuery = (supabase as any)
    .from("posts")
    .select(columns);
  if (kind === "reachout") rowsQuery = rowsQuery.eq("id", rowId);
  else if (seed?.collab_id) rowsQuery = rowsQuery.eq("collab_id", seed.collab_id);
  else if (seed?.inf_id && seed.collab_number != null)
    rowsQuery = rowsQuery
      .eq("inf_id", seed.inf_id)
      .eq("collab_number", seed.collab_number)
      .is("collab_id", null);
  else if (seed) rowsQuery = rowsQuery.eq("id", seed.id);
  else rowsQuery = rowsQuery.eq("collab_id", cid);
  rowsQuery = rowsQuery.order("post_id", { ascending: true });
  const { data: rows, error } = await rowsQuery;
  if (error) return { ok: false, error: error.message };
  const list = (rows ?? []) as Array<Record<string, any>>;
  if (!list.length)
    return {
      ok: false,
      error:
        kind === "reachout"
          ? `Reach-out row ${rowId} not found`
          : `Onboarding ${cid || rowId} not found`,
    };
  const rep = list[0];
  if (kind === "reachout" && rep.workflow_status !== "Reach Out") {
    return { ok: false, error: "This row has already been onboarded." };
  }
  const requestKey =
    kind === "reachout"
      ? reachoutRequestKey(rep.id)
      : rep.collab_id || legacyOnboardingRequestKey(rep.id);
  const entityLabel =
    kind === "reachout"
      ? `Reach Out #${rep.id}`
      : rep.collab_id ||
        (rep.inf_id && rep.collab_number != null
          ? `${rep.inf_id}-C${rep.collab_number}`
          : rep.post_id || `Onboarding #${rep.id}`);

  const [{ data: creator }, { data: pendingReq }, { data: campaigns }] =
    await Promise.all([
      rep.inf_id
        ? (supabase as any)
            .from("creators")
            .select("inf_name, username")
            .eq("inf_id", rep.inf_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      (supabase as any)
        .from("onboarding_edit_requests")
        .select("id")
        .eq("collab_id", requestKey)
        .eq("status", "Pending Approval")
        .maybeSingle(),
      (supabase as any)
        .from("campaigns")
        .select("campaign_id, campaign_name, status")
        .order("campaign_id", { ascending: false }),
    ]);

  const total = list.reduce((s, r) => s + Number(r.commercial_amount ?? 0), 0);

  return {
    ok: true,
    form: {
      kind,
      rowId: rep.id,
      rowIds: list.map((row) => Number(row.id)).filter((id) => id > 0),
      collabId: kind === "onboarding" ? rep.collab_id : null,
      entityLabel,
      postId: String(rep.post_id ?? ""),
      infId: rep.inf_id ?? null,
      creatorName: creator?.inf_name ?? null,
      username: rep.username ?? creator?.username ?? null,
      campaignId: rep.campaign_id ?? null,
      deliverables: list.length,
      campaigns: ((campaigns ?? []) as Array<Record<string, unknown>>)
        .filter(
          (campaign) =>
            String(campaign.status ?? "").toLowerCase() === "active" ||
            campaign.campaign_id === rep.campaign_id,
        )
        .map((campaign) => ({
          value: String(campaign.campaign_id ?? ""),
          label: campaign.campaign_name
            ? `${campaign.campaign_id} — ${campaign.campaign_name}`
            : String(campaign.campaign_id ?? ""),
        }))
        .filter((campaign) => campaign.value),
      values: {
        campaign_id: String(rep.campaign_id ?? ""),
        content_type: String(rep.content_type ?? ""),
        order_id: String(rep.order_id ?? ""),
        collab_type: String(rep.collab_type ?? ""),
        commercial_amount: String(total),
        ads_usage_rights: String(rep.ads_usage_rights ?? ""),
        est_delivery: String(rep.est_delivery ?? "").slice(0, 10),
        bank_name: String(rep.bank_name ?? ""),
        bank_number: String(rep.bank_number ?? ""),
        ifsc: String(rep.ifsc ?? ""),
      },
      pending: Boolean(pendingReq),
    },
  };
}

export interface EditOrderPreview {
  order_id: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  garments_sent: string | null;
  tracking_id: string | null;
  order_status: string | null;
  total_price: number | null;
}

/** Fetch a Shopify order's details for the Edit modal's Fetch button preview. */
export async function fetchOrderForEdit(
  orderId: string,
): Promise<
  { ok: true; order: EditOrderPreview } | { ok: false; error: string }
> {
  await assertPermission("onboarding_write");
  const id = orderId.trim();
  if (!id) return { ok: false, error: "Enter an order id" };
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("shopify_orders")
    .select(
      "order_id, customer_name, email, phone, address, garments_sent, tracking_id, tracking_status, fulfillment, total_price",
    )
    .eq("order_id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data)
    return {
      ok: false,
      error: `Order ${id} not found in synced Shopify orders.`,
    };
  return {
    ok: true,
    order: {
      order_id: String(data.order_id ?? id),
      customer_name: data.customer_name ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      garments_sent: data.garments_sent ?? null,
      tracking_id: data.tracking_id ?? null,
      order_status: data.tracking_status ?? data.fulfillment ?? null,
      total_price: data.total_price != null ? Number(data.total_price) : null,
    },
  };
}

async function validateAssignmentChange(
  supabase: any,
  form: OnboardingEditForm,
  nextCampaignId: string,
): Promise<string | null> {
  if (nextCampaignId === form.values.campaign_id) return null;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("status")
    .eq("campaign_id", nextCampaignId)
    .maybeSingle();
  if (campaignError)
    return "Campaign eligibility could not be verified. Try again.";
  if (String(campaign?.status ?? "").toLowerCase() !== "active") {
    return `Campaign ${nextCampaignId} is not active. Select an approved active campaign.`;
  }

  const { data: targetRows, error: targetError } = await supabase
    .from("posts")
    .select("id, username")
    .in("id", form.rowIds);
  if (targetError || !targetRows?.length)
    return "The record could not be verified. Refresh and try again.";

  const username = String(targetRows[0]?.username ?? form.username ?? "")
    .trim()
    .toLowerCase();
  if (!username) return "Creator identity could not be verified.";

  const duplicate = await checkReachoutAllowed(
    supabase,
    username,
    nextCampaignId,
    {
      excludeRowIds: targetRows.map((row: { id: number }) => row.id),
    },
  );
  if (duplicate) return duplicate.error;

  if (form.kind === "reachout") return null;

  const [capRes, onboardedRes] = await Promise.all([
    supabase
      .from("campaign_budget")
      .select("num_influencers")
      .eq("campaign_id", nextCampaignId),
    supabase
      .from("posts")
      .select("username, workflow_status")
      .eq("campaign_id", nextCampaignId)
      .limit(10_000),
  ]);
  if (capRes.error || onboardedRes.error)
    return "Campaign capacity could not be verified. Try again.";

  const cap = (
    (capRes.data ?? []) as Array<{ num_influencers: number | null }>
  ).reduce((sum, row) => sum + (Number(row.num_influencers ?? 0) || 0), 0);
  if (cap <= 0) return null;

  const onboarded = new Set(
    (
      (onboardedRes.data ?? []) as Array<{
        username: string | null;
        workflow_status: string | null;
      }>
    )
      .filter((row) => isOnboardedActive(row.workflow_status))
      .map((row) =>
        String(row.username ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  if (!onboarded.has(username) && onboarded.size >= cap) {
    return `Campaign ${nextCampaignId} is at its onboarding cap (${onboarded.size}/${cap}). Raise its allocation or free a slot before approving this move.`;
  }
  return null;
}

export async function submitOnboardingEdit(input: {
  collabId?: string;
  rowId?: number;
  reason: string;
  values: Partial<Record<OnboardingEditField, string>>;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await assertPermission("onboarding_write");
  const cid = (input.collabId ?? "").trim();
  const rowId = Number(input.rowId ?? 0);
  if (!cid && rowId <= 0) return { ok: false, error: "Edit target missing" };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5)
    return {
      ok: false,
      error: "Add a short reason for the edit (min 5 chars).",
    };

  const cur = await getOnboardingEditForm({ collabId: cid, rowId });
  if (!cur.ok) return { ok: false, error: cur.error };
  if (cur.form.pending)
    return {
      ok: false,
      error: "This record already has an edit awaiting approval.",
    };

  const before = cur.form.values;
  const afterVals: Record<string, string> = {};
  const changed: OnboardingEditField[] = [];
  for (const f of EDITABLE_FIELDS) {
    const nv = String(input.values[f] ?? before[f] ?? "").trim();
    afterVals[f] = nv;
    if (nv !== String(before[f] ?? "").trim()) changed.push(f);
  }
  if (changed.length === 0)
    return { ok: false, error: "No changes to submit." };
  if (!afterVals.campaign_id)
    return { ok: false, error: "Campaign is required." };
  if (!afterVals.content_type)
    return { ok: false, error: "Content type is required." };
  if (
    afterVals.content_type !== before.content_type &&
    !CONTENT_CODES.some((content) => content.code === afterVals.content_type)
  )
    return { ok: false, error: "Select a valid content type." };

  const supabase = createServiceClient();
  const assignmentError = await validateAssignmentChange(
    supabase,
    cur.form,
    afterVals.campaign_id,
  );
  if (assignmentError) return { ok: false, error: assignmentError };

  const requestKey =
    cur.form.kind === "reachout"
      ? reachoutRequestKey(cur.form.rowId!)
      : cur.form.collabId ?? legacyOnboardingRequestKey(cur.form.rowId!);
  const { error } = await (supabase as any)
    .from("onboarding_edit_requests")
    .insert({
      collab_id: requestKey,
      post_id: cur.form.postId || null,
      inf_id: cur.form.infId,
      requested_by: actor.email ?? null,
      requested_by_name: actor.name ?? actor.email ?? null,
      reason,
      before,
      after: afterVals,
      status: "Pending Approval",
    });
  if (error) {
    const dup =
      error.code === "23505" ||
      String(error.message ?? "").includes("one_pending");
    return {
      ok: false,
      error: dup
        ? "This record already has an edit awaiting approval."
        : error.message,
    };
  }

  revalidatePath("/approvals");
  revalidateTag("approvals-count");
  revalidatePath("/onboarding");

  // Notify global admins (best-effort, after the response).
  const summary = {
    kind: cur.form.kind,
    requestKey,
    entityLabel: cur.form.entityLabel,
    creator:
      cur.form.creatorName ??
      cur.form.username ??
      cur.form.infId ??
      cur.form.entityLabel,
    requester: actor.name ?? actor.email ?? "a team member",
    reason,
    changed: changed.map((f) => ({
      label: ONBOARDING_EDIT_DIFF_LABELS[f] ?? ONBOARDING_EDIT_FIELD_LABELS[f],
      before: before[f] || "—",
      after: afterVals[f] || "—",
    })),
  };
  after(async () => {
    const admins = (await resolveGlobalAdminEmails()).filter(
      (e) => e && e.includes("@"),
    );
    if (admins.length === 0) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rowsHtml = summary.changed
      .map(
        (c) =>
          `<tr><td style="padding:6px 10px;background:#F5F1EC;border:1px solid #E7E2D2;font-weight:800;">${esc(c.label)}</td><td style="padding:6px 10px;border:1px solid #E7E2D2;border-left:0;color:#C0392B;">${esc(c.before)}</td><td style="padding:6px 10px;border:1px solid #E7E2D2;border-left:0;color:#4F7C4D;font-weight:700;">${esc(c.after)}</td></tr>`,
      )
      .join("");
    const bodyHtml = `
      <p style="margin:0 0 12px;">A ${summary.kind === "reachout" ? "reach-out" : "onboarding"} edit needs your approval before it applies.${summary.kind === "onboarding" ? " Posting for this collab is blocked until you decide." : ""}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 12px;">
        <tr><td style="padding:6px 10px;background:#F5F1EC;border:1px solid #E7E2D2;font-weight:800;width:34%;">Record</td><td style="padding:6px 10px;border:1px solid #E7E2D2;border-left:0;" colspan="2">${esc(summary.entityLabel)}</td></tr>
        <tr><td style="padding:6px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Creator</td><td style="padding:6px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;" colspan="2">${esc(summary.creator)}</td></tr>
        <tr><td style="padding:6px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Requested by</td><td style="padding:6px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;" colspan="2">${esc(summary.requester)}</td></tr>
        <tr><td style="padding:6px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;">Reason</td><td style="padding:6px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;" colspan="2">${esc(summary.reason)}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:6px 10px;background:#2C2420;color:#F0C61E;border:1px solid #2C2420;font-weight:800;">Field</td><td style="padding:6px 10px;background:#2C2420;color:#FFFCF8;border:1px solid #2C2420;border-left:0;font-weight:800;">Before</td><td style="padding:6px 10px;background:#2C2420;color:#FFFCF8;border:1px solid #2C2420;border-left:0;font-weight:800;">After</td></tr>
        ${rowsHtml}
      </table>
      <p style="margin:14px 0 0;font-size:12px;color:#9A9384;">Approve or reject this in the Approvals page.</p>`;
    await sendNotification({
      type: NOTIFICATION_TYPES.CAMPAIGN_CREATED,
      to: admins,
      subject: `${summary.kind === "reachout" ? "Reach-out" : "Onboarding"} edit needs approval — ${summary.entityLabel}`,
      title: `${summary.kind === "reachout" ? "Reach-out" : "Onboarding"} Edit — Approval Needed`,
      subtitle: summary.entityLabel,
      htmlBody: wrapNotificationHtml({
        title: `${summary.kind === "reachout" ? "Reach-out" : "Onboarding"} Edit — Approval Needed`,
        subtitle: summary.entityLabel,
        bodyHtml,
      }),
      wrap: false,
      collabId: summary.kind === "onboarding" ? summary.requestKey : null,
    });
  });

  return { ok: true };
}

/** Light state/city extraction from a Shopify India address tail "…, City, State, Pincode, Country". */
function deriveStateCity(addr: string): {
  state: string | null;
  city: string | null;
} {
  const parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return { state: null, city: null };
  // Drop trailing country + 6-digit pincode, then state is next, city before it.
  let tail = [...parts];
  if (/^[A-Za-z\s]+$/.test(tail.at(-1) ?? "")) tail = tail.slice(0, -1);
  if (/^\d{6}$/.test(tail.at(-1) ?? "")) tail = tail.slice(0, -1);
  const state = tail.at(-1) ?? null;
  const city = tail.length >= 2 ? (tail.at(-2) ?? null) : null;
  return { state, city };
}

export async function decideOnboardingEdit(
  id: number,
  decision: "approve" | "reject",
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await assertPermission("admin");
  const supabase = createServiceClient();
  const { data: req, error } = await (supabase as any)
    .from("onboarding_edit_requests")
    .select("*")
    .eq("id", id)
    .eq("status", "Pending Approval")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!req)
    return { ok: false, error: "Request not found or already decided." };

  const derivedBefore: Record<string, string> = {};
  const derivedAfter: Record<string, string> = {};
  const before = (req.before ?? {}) as Record<string, string>;
  const afterValues = (req.after ?? {}) as Record<string, string>;
  if (
    decision === "approve" &&
    !String(req.collab_id).startsWith("reachout:") &&
    afterValues.order_id &&
    afterValues.order_id !== before.order_id
  ) {
    const [{ data: order }, { data: current }] = await Promise.all([
      (supabase as any)
        .from("shopify_orders")
        .select("email, tracking_id, garments_sent, address, fulfillment")
        .eq("order_id", afterValues.order_id)
        .maybeSingle(),
      (supabase as any)
        .from("posts")
        .select("email, tracking_id, garments_sent, order_status, state, city")
        .eq("post_id", req.post_id)
        .maybeSingle(),
    ]);
    if (!order)
      return {
        ok: false,
        error: `Order ${afterValues.order_id} is no longer available in synced Shopify orders.`,
      };
    const parsed = deriveStateCity(String(order.address ?? ""));
    const next = {
      email: order.email,
      tracking_id: order.tracking_id,
      garments_sent: order.garments_sent,
      order_status: order.fulfillment,
      state: parsed.state,
      city: parsed.city,
    };
    for (const [key, value] of Object.entries(next)) {
      const previous = String(current?.[key] ?? "").trim();
      const incoming = String(value ?? "").trim();
      if (previous !== incoming) {
        derivedBefore[key] = previous;
        derivedAfter[key] = incoming;
      }
    }
  }

  const { error: decisionError } = await (supabase as any).rpc(
    "decide_onboarding_edit_request",
    {
      p_request_id: id,
      p_decision: decision,
      p_admin_email: actor.email ?? null,
      p_admin_name: actor.name ?? actor.email ?? null,
      p_note: note?.trim() || null,
      p_derived_before: derivedBefore,
      p_derived_after: derivedAfter,
    },
  );
  if (decisionError) return { ok: false, error: decisionError.message };

  revalidatePath("/approvals");
  revalidateTag("approvals-count");
  revalidatePath("/onboarding");
  revalidateTag("posts");
  // Commercial / order-id edits move the Expected budget the moment they're
  // approved — refresh every surface that shows it.
  revalidatePath("/budget");
  revalidatePath("/cost-analytics");
  revalidatePath("/dashboard");
  revalidatePath("/campaigns");
  revalidatePath("/journey");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/reach-out/inbound");
  return { ok: true };
}
