"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { attributionName } from "@/lib/impersonation";
import { assertCreateAllowed } from "@/lib/test-mode";
import { createServiceClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env.server";
import { formatDate, formatRupees } from "@/lib/formatters";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
  sendNotification,
} from "@/lib/notifications";
import {
  parseShopifyAddress,
  buildLegacyNomenclature,
} from "@/lib/onboarding-helpers";
import {
  OnboardingSchema,
  applyBarterLock,
} from "@/features/onboarding/schema";
import type { OnboardingResult } from "@/features/onboarding/actions";

/**
 * Historic onboarding fill — the "reach out → onboard → posting" full flow on
 * HISTORIC rows (Historic Analytics row drawer). Mirrors the live Onboarding
 * submit (features/onboarding/actions.ts#submitOnboarding) EXACTLY, minus the
 * collab email to the creator, and writes to `historic_posts`:
 *
 *   1. Shopify order lookup (synced table → on-demand live pull → hard gate,
 *      with the same Shopify-validation-failed alert to the submitter).
 *   2. Collab mint via mint_historic_onboarding_block: reuse the collab already
 *      mapped to this order (posts ∪ historic), else next C over posts ∪
 *      historic. The parent historic row KEEPS its already-minted P / post_id —
 *      only extra deliverable rows take fresh P-numbers (continue-from-max).
 *   3. Parent row UPDATE: collab config + order + address + attribution.
 *   4. §6.2 deliverable expansion: total = reels + statics; extra deliverables
 *      spawn as new historic_posts rows sharing the collab_id.
 *   5. Bank/agency/state sync to the creators table (creator-level truth).
 *   6. Actor confirmation email (the internal save receipt — NOT the collab
 *      email; that flow is deliberately absent here).
 *
 * After this fill the row(s) show in the drawer as On Board, and the existing
 * posting-backlog fill completes the flow to Posted.
 */
export async function submitHistoricOnboarding(
  input: unknown,
): Promise<OnboardingResult> {
  const actor = await assertPermission("onboarding_write");
  await assertCreateAllowed("collab", actor, "Collabs (Onboarding)");

  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const v = applyBarterLock(parsed.data);
  if (v.id == null) return { ok: false, error: "Historic row id missing" };
  const supabase = createServiceClient();

  // Parent historic row — already carries post_id / post_number from ingest.
  const { data: parentRow, error: parentErr } = await (supabase as any)
    .from("historic_posts")
    .select(
      "id, post_id, post_id_short, post_number, collab_number, collab_id, inf_id, username, campaign_id, content_type, reach_out_date, reachout_direction, logged_by, source_tag, nomenclature, order_id, onboard_date, influencer_category, gender, followers, avg_likes, engaged_rate, profile_pic, profile_id, email",
    )
    .eq("id", v.id)
    .maybeSingle();
  if (parentErr) return { ok: false, error: parentErr.message };
  if (!parentRow) return { ok: false, error: `Historic row #${v.id} not found.` };
  const parent = parentRow as Record<string, unknown>;
  if (!parent.inf_id) {
    return { ok: false, error: "Historic row is missing its creator id." };
  }

  // Blacklist gate — same as the live onboarding.
  {
    const { data: creator, error: creatorError } = await (supabase as any)
      .from("creators")
      .select("username, is_blacklisted, blacklist_reason")
      .eq("inf_id", parent.inf_id)
      .maybeSingle();
    if (creatorError) {
      return {
        ok: false,
        error: "Creator eligibility could not be verified. Try again.",
      };
    }
    if (creator?.is_blacklisted === true) {
      const reason = String(creator.blacklist_reason ?? "").trim();
      return {
        ok: false,
        error: `@${creator.username ?? parent.username} is offboarded and cannot be onboarded again.${reason ? ` Reason: ${reason}` : ""}`,
      };
    }
  }
  // (No campaign onboarding cap here — historic rows carry legacy campaign
  // codes with no campaign_budget allocations; the cap is a live-pipeline rule.)

  // 1. Shopify order lookup (synced table first, then on-demand live pull) —
  // identical to the live onboarding gate.
  const SHOPIFY_ORDER_SELECT =
    "order_id, email, tracking_id, tracking_status, fulfillment, order_date, address, customer_name, garments_sent, line_skus, delivery_date, order_placed_date";
  const firstLookup = await supabase
    .from("shopify_orders")
    .select(SHOPIFY_ORDER_SELECT)
    .eq("order_id", v.orderId)
    .maybeSingle();
  if (firstLookup.error) return { ok: false, error: firstLookup.error.message };
  let order = firstLookup.data;

  if (
    !order &&
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
    serverEnv.SUPABASE_SERVICE_KEY
  ) {
    try {
      await fetch(
        `${serverEnv.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-shopify-orders?order_id=${encodeURIComponent(v.orderId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serverEnv.SUPABASE_SERVICE_KEY}`,
            apikey: serverEnv.SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (err) {
      console.error("[historic-onboarding] on-demand Shopify pull failed:", err);
    }
    const retry = await supabase
      .from("shopify_orders")
      .select(SHOPIFY_ORDER_SELECT)
      .eq("order_id", v.orderId)
      .maybeSingle();
    order = retry.data;
  }

  if (!order) {
    const assignee = (actor.email ?? "").trim();
    if (assignee.includes("@")) {
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const rowRef = (parent.post_id as string | null) ?? `row #${v.id}`;
      after(async () => {
        await sendNotification({
          type: NOTIFICATION_TYPES.SHOPIFY_VALIDATION_FAILED,
          to: assignee,
          subject: `Shopify order ${v.orderId} not found — onboarding blocked`,
          title: "Shopify order validation failed",
          subtitle: `POST ID: ${rowRef}`,
          htmlBody: `<p style="margin:0 0 12px;">The Shopify Order ID entered while onboarding a historic row could not be validated — it was not in the synced data, and a live check on Shopify also did not return a usable order.</p>
<table style="width:100%;border-collapse:collapse;font-size:0.86rem;margin:0 0 14px;">
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;width:34%;">Post ID</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">${esc(rowRef)}</td></tr>
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;">Order ID</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">${esc(v.orderId)}</td></tr>
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;">Reason</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">Order not found, or missing the influencer tag (INF)</td></tr>
</table>
<p style="margin:0;color:#6E695E;font-size:0.82rem;">Check the Order ID is correct and that the order is tagged for influencer orders (INF) on Shopify, then retry onboarding.</p>`,
          postId: (parent.post_id as string | null) ?? null,
        });
      });
    }
    return {
      ok: false,
      error: `Shopify order ${v.orderId} could not be validated. Check the Order ID and make sure the order is tagged for influencer orders (INF) on Shopify.`,
      fieldErrors: { orderId: "Order not found / not tagged" },
    };
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const nomenclatureDate =
    typeof parent.reach_out_date === "string" && parent.reach_out_date
      ? (parent.reach_out_date as string)
      : today;
  const orderObj = order as Record<string, unknown>;
  const orderEmail = (orderObj.email as string | null) ?? null;
  const orderAddress = (orderObj.address as string | null) ?? null;
  const orderTrackingId = (orderObj.tracking_id as string | null) ?? null;
  const orderGarments = (orderObj.garments_sent as string | null) ?? null;
  const orderLineSkus = (orderObj.line_skus as string | null) ?? null;
  const parsedAddr = parseShopifyAddress(orderAddress);
  const garmentQty =
    orderLineSkus
      ?.split(",")
      .map((sku) => sku.trim())
      .filter(Boolean).length ||
    orderGarments
      ?.split(",")
      .map((garment) => garment.trim())
      .filter(Boolean).length ||
    null;
  const onboardedBy = await attributionName(actor);

  // §6.2 deliverable expansion — the parent historic row is deliverable #1;
  // the remaining (total - 1) spawn as new historic rows.
  const total = v.reels + v.posts;

  // Mint the collab (C). The parent KEEPS its ingest-minted P / post_id — the
  // RPC only reserves fresh P-numbers for the extra deliverable rows. Advisory
  // lock shared with the live mint so concurrent live + historic onboards for
  // one creator serialize.
  const { data: minted, error: mintErr } = await (supabase as any).rpc(
    "mint_historic_onboarding_block",
    { p_inf_id: parent.inf_id, p_order_id: v.orderId },
  );
  if (mintErr) return { ok: false, error: mintErr.message };
  const m = Array.isArray(minted) ? minted[0] : minted;
  const collabNumber = (m?.collab_number as number | null) ?? null;
  const collabId =
    (m?.collab_id as string | null) ??
    `${parent.inf_id}-C${collabNumber ?? 1}`;
  const startPostNumber = (m?.start_post_number as number | null) ?? null;

  const parentPostId = parent.post_id as string;

  // Equal-split rule: the agreed collab price is divided across all
  // deliverables so SUM(commercial_amount) across the collab equals the
  // originally agreed total.
  const perDeliverableAmount =
    total > 0 ? Math.round((v.commercials / total) * 100) / 100 : v.commercials;

  const parentNomenclature =
    (parent.nomenclature as string | null) ||
    buildLegacyNomenclature(
      parentPostId,
      parent.username,
      parent.content_type,
      nomenclatureDate,
    );

  // 3. UPDATE the parent historic row. (historic_posts has no reels/static/
  // stories/deliverable_type/bank columns — the counts live in the spawned
  // rows themselves; bank details sync to the creators table below.)
  const parentPatch: Record<string, unknown> = {
    agency_name: v.agency || null,
    onboard_date: today,
    onboarded_by: onboardedBy,
    nomenclature: parentNomenclature,
    collab_type: v.collabType,
    commercial_amount: perDeliverableAmount,
    est_delivery: v.estDelivery,
    notes: v.remarks || null,
    order_id: v.orderId,
    order_status: v.orderStatus,
    workflow_status: "On Board",
    ads_usage_rights: v.adsUsageRights || null,
    email: orderEmail,
    tracking_id: orderTrackingId,
    garment_qty: garmentQty != null ? String(garmentQty) : null,
    garments_sent: orderGarments,
    collab_number: collabNumber,
    collab_id: collabId,
    deliverable_index: 1,
  };
  if (parsedAddr.state) parentPatch.state = parsedAddr.state;
  if (parsedAddr.city) parentPatch.city = parsedAddr.city;
  if (parsedAddr.pincode) parentPatch.pincode = parsedAddr.pincode;
  if (parsedAddr.country) parentPatch.country = parsedAddr.country;
  if (parsedAddr.street) parentPatch.street_address = parsedAddr.street;

  const { error: updErr } = await (supabase as any)
    .from("historic_posts")
    .update(parentPatch)
    .eq("id", v.id);
  if (updErr) return { ok: false, error: updErr.message };

  // Creator-level sync — bank/agency/state belong to the creator, not the row.
  {
    const creatorPatch: Record<string, string | null> = {};
    if (v.bankName) creatorPatch.bank_name = v.bankName;
    if (v.bankNumber) creatorPatch.bank_number = v.bankNumber;
    if (v.ifsc) creatorPatch.ifsc = v.ifsc;
    if (v.agency) creatorPatch.agency_name = v.agency;
    if (parsedAddr.state) creatorPatch.state = parsedAddr.state;
    if (Object.keys(creatorPatch).length > 0) {
      (supabase as any)
        .from("creators")
        .update(creatorPatch)
        .eq("inf_id", parent.inf_id)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error)
            console.error(
              "[historic-onboarding] creator sync failed:",
              error.message,
            );
        });
    }
  }

  // 4. Spawn the extra deliverable rows (total > 1) — new historic_posts rows
  // sharing the collab, taking the fresh P-numbers reserved by the mint.
  let childrenSpawned = 0;
  if (total > 1 && startPostNumber != null) {
    const children: Record<string, unknown>[] = [];
    for (let i = 0; i < total - 1; i++) {
      const pn = startPostNumber + i;
      const childPostId = `${parent.inf_id}-P${pn}`;
      children.push({
        post_id: childPostId,
        post_id_short: childPostId,
        post_number: pn,
        collab_number: collabNumber,
        collab_id: collabId,
        deliverable_index: i + 2,
        inf_id: parent.inf_id,
        username: parent.username,
        campaign_id: parent.campaign_id ?? null,
        content_type: parent.content_type ?? null,
        source_tag: parent.source_tag ?? null,
        nomenclature: buildLegacyNomenclature(
          childPostId,
          parent.username,
          parent.content_type,
          nomenclatureDate,
        ),
        workflow_status: "On Board",
        reach_out_date: parent.reach_out_date ?? today,
        reachout_direction: parent.reachout_direction ?? null,
        logged_by: parent.logged_by ?? null,
        onboard_date: today,
        onboarded_by: onboardedBy,
        collab_type: v.collabType,
        commercial_amount: perDeliverableAmount,
        est_delivery: v.estDelivery,
        order_id: v.orderId,
        order_status: v.orderStatus,
        ads_usage_rights: v.adsUsageRights || null,
        email: orderEmail,
        tracking_id: orderTrackingId,
        garment_qty: garmentQty != null ? String(garmentQty) : null,
        garments_sent: orderGarments,
        agency_name: v.agency || null,
        notes: v.remarks || null,
        influencer_category: parent.influencer_category ?? null,
        gender: parent.gender ?? null,
        followers: parent.followers ?? null,
        avg_likes: parent.avg_likes ?? null,
        engaged_rate: parent.engaged_rate ?? null,
        profile_pic: parent.profile_pic ?? null,
        profile_id: parent.profile_id ?? null,
        state: parsedAddr.state,
        city: parsedAddr.city,
        pincode: parsedAddr.pincode,
        country: parsedAddr.country,
        street_address: parsedAddr.street,
        is_historic: true,
      });
    }
    if (children.length > 0) {
      const { error: childErr } = await (supabase as any)
        .from("historic_posts")
        .insert(children);
      if (!childErr) childrenSpawned = children.length;
      else
        console.error(
          "[historic-onboarding] child spawn failed:",
          childErr.message,
        );
    }
  }

  // Actor confirmation email — the internal save receipt (kept). The collab
  // email to the creator is deliberately NOT part of the historic flow.
  const creatorHandle = (parent.username as string | null) ?? parentPostId;
  const deliverableSummary =
    total > 0
      ? [
          v.reels > 0 ? `${v.reels} Reel${v.reels > 1 ? "s" : ""}` : "",
          v.posts > 0 ? `${v.posts} Static Post${v.posts > 1 ? "s" : ""}` : "",
        ]
          .filter(Boolean)
          .join(" + ")
      : "—";
  after(async () => {
    await notifyActorConfirmation({
      actor,
      type: NOTIFICATION_TYPES.ONBOARDING_CONFIRMATION,
      subject: `Historic onboarding saved — ${creatorHandle} / ${collabId}`,
      title: "Historic onboarding saved",
      subtitle: `COLLAB ID: ${collabId}`,
      summaryLines: [
        `Onboarding details for @${creatorHandle} have been saved on the historic record. Fill the post link from the row drawer to complete the flow.`,
      ],
      rows: [
        { label: "Creator", value: `@${creatorHandle}` },
        { label: "Collab ID", value: collabId },
        { label: "Post ID (deliverable)", value: parentPostId },
        { label: "Order ID", value: v.orderId },
        { label: "Collaboration Type", value: v.collabType },
        { label: "Commercials", value: formatRupees(v.commercials) },
        { label: "Deliverables", value: deliverableSummary },
        { label: "Stories", value: v.stories > 0 ? v.stories : null },
        { label: "Ads Usage Rights", value: v.adsUsageRights || "None" },
        { label: "Content Duration", value: v.duration || null },
        { label: "Estimated Delivery", value: formatDate(v.estDelivery) },
        { label: "Order Status", value: v.orderStatus },
        { label: "Agency", value: v.agency || null },
        { label: "Bank Name", value: v.bankName || null },
        { label: "Bank Account", value: v.bankNumber || null },
        { label: "IFSC Code", value: v.ifsc || null },
        { label: "Remarks", value: v.remarks || null },
      ],
      footnote:
        "This confirms your save on the historic record. No collaboration email is sent from the historic flow.",
      postId: parentPostId,
      collabId,
    });
  });

  revalidatePath("/historic-analytics");

  return { ok: true, postId: parentPostId, childrenSpawned };
}
