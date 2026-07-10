"use server";

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_TYPES,
  resolveGlobalAdminEmails,
  sendNotification,
  wrapNotificationHtml,
} from "@/lib/notifications";
import {
  EDITABLE_FIELDS,
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

export async function getOnboardingEditForm(
  collabId: string,
): Promise<{ ok: true; form: OnboardingEditForm } | { ok: false; error: string }> {
  await assertPermission("onboarding_write");
  const cid = collabId.trim();
  if (!cid) return { ok: false, error: "Collab ID missing" };

  const supabase = createServiceClient();
  const { data: rows, error } = await (supabase as any)
    .from("posts")
    .select(
      "post_id, inf_id, username, campaign_id, order_id, collab_type, commercial_amount, ads_usage_rights, est_delivery, bank_name, bank_number, ifsc, collab_id, collab_number",
    )
    .eq("collab_id", cid)
    .order("post_id", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const list = (rows ?? []) as Array<Record<string, any>>;
  if (!list.length) return { ok: false, error: `Collab ${cid} not found` };
  const rep = list[0];

  const [{ data: creator }, { data: pendingReq }] = await Promise.all([
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
      .eq("collab_id", cid)
      .eq("status", "Pending Approval")
      .maybeSingle(),
  ]);

  const total = list.reduce(
    (s, r) => s + Number(r.commercial_amount ?? 0),
    0,
  );

  return {
    ok: true,
    form: {
      collabId: cid,
      postId: String(rep.post_id ?? ""),
      infId: rep.inf_id ?? null,
      creatorName: creator?.inf_name ?? null,
      username: rep.username ?? creator?.username ?? null,
      campaignId: rep.campaign_id ?? null,
      deliverables: list.length,
      values: {
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
  address: string | null;
  garments_sent: string | null;
  tracking_id: string | null;
  order_status: string | null;
  total_price: number | null;
}

/** Fetch a Shopify order's details for the Edit modal's Fetch button preview. */
export async function fetchOrderForEdit(
  orderId: string,
): Promise<{ ok: true; order: EditOrderPreview } | { ok: false; error: string }> {
  await assertPermission("onboarding_write");
  const id = orderId.trim();
  if (!id) return { ok: false, error: "Enter an order id" };
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("shopify_orders")
    .select(
      "order_id, customer_name, email, address, garments_sent, tracking_id, order_status, total_price",
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
      address: data.address ?? null,
      garments_sent: data.garments_sent ?? null,
      tracking_id: data.tracking_id ?? null,
      order_status: data.order_status ?? null,
      total_price: data.total_price != null ? Number(data.total_price) : null,
    },
  };
}

export async function submitOnboardingEdit(input: {
  collabId: string;
  reason: string;
  values: Partial<Record<OnboardingEditField, string>>;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await assertPermission("onboarding_write");
  const cid = (input.collabId ?? "").trim();
  if (!cid) return { ok: false, error: "Collab ID missing" };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5)
    return { ok: false, error: "Add a short reason for the edit (min 5 chars)." };

  const cur = await getOnboardingEditForm(cid);
  if (!cur.ok) return { ok: false, error: cur.error };
  if (cur.form.pending)
    return {
      ok: false,
      error: "This collab already has an edit awaiting approval.",
    };

  const before = cur.form.values;
  const afterVals: Record<string, string> = {};
  const changed: OnboardingEditField[] = [];
  for (const f of EDITABLE_FIELDS) {
    const nv = String(input.values[f] ?? before[f] ?? "").trim();
    afterVals[f] = nv;
    if (nv !== String(before[f] ?? "").trim()) changed.push(f);
  }
  if (changed.length === 0) return { ok: false, error: "No changes to submit." };

  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("onboarding_edit_requests")
    .insert({
      collab_id: cid,
      post_id: cur.form.postId,
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
        ? "This collab already has an edit awaiting approval."
        : error.message,
    };
  }

  revalidatePath("/approvals");
  revalidatePath("/onboarding");

  // Notify global admins (best-effort, after the response).
  const summary = {
    collabId: cid,
    creator: cur.form.creatorName ?? cur.form.username ?? cur.form.infId ?? cid,
    requester: actor.name ?? actor.email ?? "a team member",
    reason,
    changed: changed.map((f) => ({
      label: ONBOARDING_EDIT_FIELD_LABELS[f],
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
      <p style="margin:0 0 12px;">An onboarding edit needs your approval before it applies. Posting for this collab is blocked until you decide.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 12px;">
        <tr><td style="padding:6px 10px;background:#F5F1EC;border:1px solid #E7E2D2;font-weight:800;width:34%;">Collab ID</td><td style="padding:6px 10px;border:1px solid #E7E2D2;border-left:0;" colspan="2">${esc(summary.collabId)}</td></tr>
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
      subject: `Onboarding edit needs approval — ${summary.collabId}`,
      title: "Onboarding Edit — Approval Needed",
      subtitle: `Collab ID: ${summary.collabId}`,
      htmlBody: wrapNotificationHtml({
        title: "Onboarding Edit — Approval Needed",
        subtitle: `Collab ID: ${summary.collabId}`,
        bodyHtml,
      }),
      wrap: false,
      collabId: summary.collabId,
    });
  });

  return { ok: true };
}

async function applyOnboardingEdit(
  supabase: any,
  req: Record<string, any>,
): Promise<void> {
  const cid = String(req.collab_id);
  const after = (req.after ?? {}) as Record<string, string>;
  const before = (req.before ?? {}) as Record<string, string>;

  const { data: sibs } = await supabase
    .from("posts")
    .select("post_id")
    .eq("collab_id", cid);
  const sibList = (sibs ?? []) as Array<{ post_id: string }>;
  const count = sibList.length || 1;
  const total = Number(after.commercial_amount ?? 0);
  const split = count > 0 ? total / count : total;

  // Collab-level fields — applied to EVERY deliverable of the collab.
  const patch: Record<string, unknown> = {
    order_id: after.order_id || null,
    collab_type: after.collab_type || null,
    ads_usage_rights: after.ads_usage_rights || null,
    est_delivery: after.est_delivery || null,
    bank_name: after.bank_name || null,
    bank_number: after.bank_number || null,
    ifsc: after.ifsc || null,
    commercial_amount: split,
  };

  // If the order id changed, re-derive ALL order details from the new order and
  // apply them to every deliverable (email, tracking, products, state/city).
  if (after.order_id && after.order_id !== (before.order_id ?? "")) {
    const { data: ord } = await supabase
      .from("shopify_orders")
      .select("email, tracking_id, garments_sent, address, order_status")
      .eq("order_id", after.order_id)
      .maybeSingle();
    if (ord) {
      if (ord.email != null) patch.email = ord.email;
      if (ord.tracking_id != null) patch.tracking_id = ord.tracking_id;
      if (ord.garments_sent != null) patch.garments_sent = ord.garments_sent;
      if (ord.order_status != null) patch.order_status = ord.order_status;
      const parsed = deriveStateCity(String(ord.address ?? ""));
      if (parsed.state) patch.state = parsed.state;
      if (parsed.city) patch.city = parsed.city;
    }
  }

  await supabase.from("posts").update(patch).eq("collab_id", cid);
}

/** Light state/city extraction from a Shopify India address tail "…, City, State, Pincode, Country". */
function deriveStateCity(addr: string): { state: string | null; city: string | null } {
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

  if (decision === "approve") {
    await applyOnboardingEdit(supabase, req);
  }

  await (supabase as any)
    .from("onboarding_edit_requests")
    .update({
      status: decision === "approve" ? "Approved" : "Rejected",
      decided_by: actor.email ?? null,
      decided_by_name: actor.name ?? actor.email ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);

  await (supabase as any).from("approval_logs").insert({
    action_type: "onboarding_edit",
    action: decision === "approve" ? "Approved" : "Rejected",
    entity_id: String(req.collab_id),
    admin_email: actor.email ?? null,
    admin_name: actor.name ?? actor.email ?? null,
    notes: note?.trim() || req.reason || null,
  });

  revalidatePath("/approvals");
  revalidatePath("/onboarding");
  revalidateTag("posts");
  return { ok: true };
}
