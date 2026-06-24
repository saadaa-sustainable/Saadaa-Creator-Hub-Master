"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { readTermsAttachmentFile, TERMS_ATTACHMENT } from "@/lib/attachments";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { stampTestRows } from "@/features/settings/actions";
import { isOnboardedActive } from "@/lib/workflow";
import { sendMail } from "@/lib/email";
import { serverEnv } from "@/lib/env.server";
import { formatDate, formatRupees } from "@/lib/formatters";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
  sendNotification,
} from "@/lib/notifications";
import { OnboardingSchema, applyBarterLock } from "./schema";

export type OnboardingResult =
  | { ok: true; postId: string; childrenSpawned: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
  "Chandigarh",
  "Andaman and Nicobar",
  "Dadra and Nagar Haveli",
  "Daman and Diu",
  "Lakshadweep",
] as const;

interface ParsedAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
}

/**
 * Parses a Shopify India address string into components.
 * Shopify format: "[street parts...], City, State, Pincode, Country"
 * Strategy: anchor on known values (country, pincode, state) then derive
 * city as the part immediately preceding state — no city list needed.
 */
function parseShopifyAddress(addr: string | null): ParsedAddress {
  const empty: ParsedAddress = {
    street: null,
    city: null,
    state: null,
    pincode: null,
    country: null,
  };
  if (!addr) return empty;

  let parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return empty;

  let country: string | null = null;
  let pincode: string | null = null;
  let state: string | null = null;
  let city: string | null = null;

  // 1. Country: last part that is all letters/spaces
  if (parts.length > 1 && /^[A-Za-z\s]+$/.test(parts.at(-1)!)) {
    country = parts.at(-1)!;
    parts = parts.slice(0, -1);
  }

  // 2. Pincode: rightmost 6-digit number
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d{6}$/.test(parts[i])) {
      pincode = parts[i];
      parts = [...parts.slice(0, i), ...parts.slice(i + 1)];
      break;
    }
  }

  // 3. State: rightmost part matching INDIAN_STATES; record its original index
  let stateOriginalIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (INDIAN_STATES.some((s) => s.toLowerCase() === parts[i].toLowerCase())) {
      state = parts[i];
      stateOriginalIdx = i;
      parts = [...parts.slice(0, i), ...parts.slice(i + 1)];
      break;
    }
  }

  // 4. City: the part that was immediately BEFORE state in the original sequence.
  //    After removing state at stateOriginalIdx, that part is now at stateOriginalIdx-1.
  //    If no state found, fall back to last remaining part.
  const cityIdx =
    stateOriginalIdx > 0 ? stateOriginalIdx - 1 : parts.length - 1;
  if (parts.length > 0 && cityIdx >= 0 && cityIdx < parts.length) {
    city = parts[cityIdx];
    parts = [...parts.slice(0, cityIdx), ...parts.slice(cityIdx + 1)];
  }

  // 5. Everything remaining = street address
  const street = parts.length > 0 ? parts.join(", ") : null;
  return { street, city, state, pincode, country };
}

function buildLegacyNomenclature(
  postId: string,
  username: unknown,
  contentType: unknown,
  date: string,
): string | null {
  const handle = typeof username === "string" ? username.trim() : "";
  const type = typeof contentType === "string" ? contentType.trim() : "";
  if (!postId || !handle || !type) return null;
  return `${postId}-${handle}-${type}-${date}`;
}

/**
 * Server action — Onboarding submission (Save Onboarding & Order).
 * Mirrors legacy submitOrderCreation:
 *   1. Lookup shopify_orders by order_id → resolve email, address, tracking, etc.
 *   2. UPDATE posts: agency, collab_type, commercial_amount, est_delivery, notes,
 *      order_status, workflow_status='On Board', reels/posts/stories,
 *      ads_usage_rights, order_id, email (from Shopify), state (from address),
 *      bank_*.
 *   3. §6.2 deliverable expansion: parent row gets deliverable_type, reduces
 *      counts to 1/0; child rows spawned if total > 1 (stories dropped).
 *   4. Mirror to legacy Sheet (mirror_onboard).
 */
export async function submitOnboarding(
  input: unknown,
): Promise<OnboardingResult> {
  const actor = await assertPermission("onboarding_write");

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
  const supabase = createServiceClient();

  // Onboarding cap (2026-06-10): a campaign can ONBOARD at most its allocated
  // creator count (Σ campaign_budget.num_influencers). Reach-out is unlimited;
  // the cap bites HERE. We count distinct creators currently onboarded-and-active
  // (On Board / Order Sent / Posted / Delivered) — a creator who is later
  // offboarded (voided) leaves this set, freeing a slot for a pending reach-out
  // to be onboarded in their place. cap=0 (no budget rows) ⇒ no cap.
  {
    const { data: thisPost } = await (supabase as any)
      .from("posts")
      .select("campaign_id, username, workflow_status")
      .eq("post_id", v.postId)
      .maybeSingle();
    const campaignId = (thisPost?.campaign_id ?? "").trim();
    const thisUser = (thisPost?.username ?? "").trim().toLowerCase();
    // Skip the gate if this collab is already onboarded (re-submit / edit) — it
    // already holds its slot — or if it carries no campaign.
    if (campaignId && !isOnboardedActive(thisPost?.workflow_status)) {
      const [capRes, onbRes] = await Promise.all([
        (supabase as any)
          .from("campaign_budget")
          .select("num_influencers")
          .eq("campaign_id", campaignId),
        (supabase as any)
          .from("posts")
          .select("username, workflow_status")
          .eq("campaign_id", campaignId)
          .limit(5000),
      ]);
      const cap = ((capRes.data ?? []) as Array<{ num_influencers: number | null }>).reduce(
        (s, r) => s + (Number(r.num_influencers ?? 0) || 0),
        0,
      );
      if (cap > 0) {
        const onboarded = new Set(
          ((onbRes.data ?? []) as Array<{
            username: string | null;
            workflow_status: string | null;
          }>)
            .filter((p) => isOnboardedActive(p.workflow_status))
            .map((p) => (p.username ?? "").trim().toLowerCase())
            .filter(Boolean),
        );
        if (!onboarded.has(thisUser) && onboarded.size >= cap) {
          return {
            ok: false,
            error: `Campaign ${campaignId} is at its onboarding cap (${onboarded.size}/${cap}). Raise the allocation in Edit Campaign, or offboard an onboarded creator to free a slot.`,
          };
        }
      }
    }
  }

  // 1. Shopify order lookup (synced table first).
  const SHOPIFY_ORDER_SELECT =
    "order_id, email, tracking_id, tracking_status, fulfillment, order_date, address, customer_name, garments_sent, line_skus, delivery_date, order_placed_date";
  const firstLookup = await supabase
    .from("shopify_orders")
    .select(SHOPIFY_ORDER_SELECT)
    .eq("order_id", v.orderId)
    .maybeSingle();
  if (firstLookup.error) return { ok: false, error: firstLookup.error.message };
  let order = firstLookup.data;

  // On miss, try an on-demand live pull. The 3-hr bulk sync may not have a
  // freshly-placed order yet, so ask the sync-shopify-orders edge function to
  // fetch THIS order live from Shopify and (Option B) upsert it only if it
  // carries the INF/INF tag. Then re-check. Best-effort — any failure falls
  // through to the not-found path below.
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
      console.error("[onboarding] on-demand Shopify pull failed:", err);
    }
    const retry = await supabase
      .from("shopify_orders")
      .select(SHOPIFY_ORDER_SELECT)
      .eq("order_id", v.orderId)
      .maybeSingle();
    order = retry.data;
  }

  if (!order) {
    // Spec: Shopify Validation Failed → Assigned User. The submitter (the actor
    // onboarding this collab) is the assigned user; alert them that the entered
    // Order ID was not found in the synced shopify_orders. Best-effort + non-
    // blocking via after(); logged to email_logs. Fires only on a SAVED submit,
    // not the inline preview lookup.
    const assignee = (actor.email ?? "").trim();
    if (assignee.includes("@")) {
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      after(async () => {
        await sendNotification({
          type: NOTIFICATION_TYPES.SHOPIFY_VALIDATION_FAILED,
          to: assignee,
          subject: `Shopify order ${v.orderId} not found — onboarding blocked`,
          title: "Shopify order validation failed",
          subtitle: `POST ID: ${v.postId}`,
          htmlBody: `<p style="margin:0 0 12px;">The Shopify Order ID entered while onboarding could not be validated — it was not in the synced data, and a live check on Shopify also did not return a usable order.</p>
<table style="width:100%;border-collapse:collapse;font-size:0.86rem;margin:0 0 14px;">
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;width:34%;">Post ID</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">${esc(v.postId)}</td></tr>
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;">Order ID</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">${esc(v.orderId)}</td></tr>
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;">Reason</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">Order not found, or missing the influencer tag (INF)</td></tr>
</table>
<p style="margin:0;color:#6E695E;font-size:0.82rem;">Check the Order ID is correct and that the order is tagged for influencer orders (INF) on Shopify, then retry onboarding.</p>`,
          postId: v.postId,
        });
      });
    }
    return {
      ok: false,
      error: `Shopify order ${v.orderId} could not be validated. Check the Order ID and make sure the order is tagged for influencer orders (INF) on Shopify.`,
      fieldErrors: { orderId: "Order not found / not tagged" },
    };
  }

  // 2. Fetch parent post for inf_id (needed for child row spawning) + existing post_number/collab
  const { data: parentPost, error: parentErr } = await supabase
    .from("posts")
    .select(
      "post_id, post_id_short, post_number, collab_number, collab_id, inf_id, username, campaign_id, content_type, reach_out_date, reachout_direction, creator_brief_link, nomenclature",
    )
    .eq("post_id", v.postId)
    .maybeSingle();

  if (parentErr) return { ok: false, error: parentErr.message };
  if (!parentPost) {
    return {
      ok: false,
      error: `Post ${v.postId} not found.`,
      fieldErrors: { postId: "Post not found" },
    };
  }
  const parent = parentPost as Record<string, unknown>;

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const nomenclatureDate =
    typeof parent.reach_out_date === "string" && parent.reach_out_date
      ? parent.reach_out_date
      : today;
  const parentNomenclature =
    (parent.nomenclature as string | null) ||
    buildLegacyNomenclature(
      v.postId,
      parent.username,
      parent.content_type,
      nomenclatureDate,
    );
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
  const onboardedBy = actor.name || actor.email || null;

  // Collab ID (groups all deliverable rows of this collaboration). Prefer the
  // value already stamped at reach-out; otherwise derive it from
  // inf_id || '-C' || collab_number so legacy rows created before the restructure
  // still get a collab_id stamped on first onboard.
  const collabNumber = (parent.collab_number as number | null) ?? 1;
  const collabId =
    (parent.collab_id as string | null) ??
    (parent.inf_id ? `${parent.inf_id}-C${collabNumber}` : null);

  // §6.2 deliverable expansion — first deliverable type
  const total = v.reels + v.posts;
  const firstType: "reel" | "post" | null =
    total > 0 ? (v.reels > 0 ? "reel" : "post") : null;
  const parentReels = firstType === "reel" ? 1 : 0;
  const parentPosts = firstType === "post" ? 1 : 0;

  // Equal-split rule: the agreed collab price (`v.commercials`) is divided
  // across all deliverables (parent + children) so SUM(commercial_amount)
  // across the collab equals the originally agreed total.
  const perDeliverableAmount =
    total > 0 ? Math.round((v.commercials / total) * 100) / 100 : v.commercials;

  // 3. UPDATE parent post
  const postPatch: Record<string, unknown> = {
    agency_name: v.agency || null,
    onboard_date: today,
    onboarded_by: onboardedBy,
    nomenclature: parentNomenclature,
    collab_type: v.collabType,
    commercial_amount: perDeliverableAmount,
    barter_amount: 0,
    est_delivery: v.estDelivery,
    notes: v.remarks || null,
    order_id: v.orderId,
    order_status: v.orderStatus,
    workflow_status: "On Board",
    reels: parentReels,
    static_posts: parentPosts,
    stories: 0,
    ads_usage_rights: v.adsUsageRights || null,
    email: orderEmail,
    tracking_id: orderTrackingId,
    garment_qty: garmentQty,
    garments_sent: orderGarments,
    bank_name: v.bankName || null,
    bank_number: v.bankNumber || null,
    ifsc: v.ifsc || null,
    // Onboarding does not create a payment row yet; the post flips to a
    // payment-tracked state only when posting flips it to Posted. Leaving
    // payment_status null keeps the PaymentStatus enum (Not Due | Due | Done)
    // intact for downstream Accounts Hub queries.
    payment_status: null,
    // Collab ID model: all deliverable rows of this collab share collab_id.
    // Grouping is by collab_id, NOT by parent/child. deliverable_index is kept
    // for ordering only.
    collab_id: collabId,
    parent_post_id: v.postId,
    deliverable_role: total > 1 ? "parent" : "single",
  };
  if (parsedAddr.state) postPatch.state = parsedAddr.state;
  if (parsedAddr.city) postPatch.city = parsedAddr.city;
  if (parsedAddr.pincode) postPatch.pincode = parsedAddr.pincode;
  if (parsedAddr.country) postPatch.country = parsedAddr.country;
  if (parsedAddr.street) postPatch.street_address = parsedAddr.street;
  if (firstType) {
    postPatch.deliverable_type = firstType;
    postPatch.deliverable_index = 1;
  }

  const { error: updErr } = await (supabase as any)
    .from("posts")
    .update(postPatch)
    .eq("post_id", v.postId);

  if (updErr) return { ok: false, error: updErr.message };

  // Sync creator-level fields to creators table — these belong to the creator, not the post.
  // Fire-and-forget: don't block onboarding if this fails.
  if (parent.inf_id) {
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
          if (error) console.error("[onboarding] creator sync failed:", error.message);
        });
    }
  }

  // 4. Spawn child deliverable rows (only when total > 1)
  // Each child gets next available PER-CREATOR post_number (P is linear per
  // creator across collabs). Sequential read + insert pattern; falls back
  // gracefully.
  let childrenSpawned = 0;
  // Test Mode: collect every post in this collab (the onboarded parent + any
  // spawned children) so they can be stamped is_test=true when Collab scope is on.
  const testCollabPostIds: string[] = [v.postId];
  if (total > 1) {
    const remainingReels = firstType === "reel" ? v.reels - 1 : v.reels;
    const remainingPosts = firstType === "post" ? v.posts - 1 : v.posts;

    const { data: maxRow } = await supabase
      .from("posts")
      .select("post_number")
      .eq("inf_id", parent.inf_id as string)
      .order("post_number", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    let nextPostNum =
      (((maxRow as Record<string, unknown> | null)?.post_number as
        | number
        | null) ?? 0) + 1;
    let childIdx = 2; // parent is index 1

    const children: Record<string, unknown>[] = [];
    const pushChild = (kind: "reel" | "post") => {
      // Collab ID model: post_id IS the short deliverable id (no -C suffix).
      // The -C{k} lives on collab_id, shared across every deliverable of the
      // collab.
      const postIdShort = `${parent.inf_id}-P${nextPostNum}`;
      const postId = postIdShort;
      children.push({
        post_id: postId,
        post_id_short: postIdShort,
        post_number: nextPostNum,
        collab_number: collabNumber,
        collab_id: collabId,
        inf_id: parent.inf_id as string,
        username: parent.username as string,
        campaign_id: parent.campaign_id as string,
        content_type: parent.content_type ?? null,
        nomenclature: buildLegacyNomenclature(
          postId,
          parent.username,
          parent.content_type,
          nomenclatureDate,
        ),
        workflow_status: "On Board",
        reach_out_date: parent.reach_out_date ?? today,
        reachout_direction: parent.reachout_direction ?? null,
        onboard_date: today,
        onboarded_by: onboardedBy,
        reels: kind === "reel" ? 1 : 0,
        static_posts: kind === "post" ? 1 : 0,
        stories: 0,
        ads_usage_rights: v.adsUsageRights || null,
        collab_type: v.collabType,
        // Equal-split rule: agreed total / # of deliverables. SUM across the
        // collab equals the originally agreed amount (e.g. ₹10,000 ÷ 3 reels
        // = ₹3,333.33 per row → sum back to ₹10,000).
        commercial_amount: perDeliverableAmount,
        barter_amount: 0,
        est_delivery: v.estDelivery,
        order_id: v.orderId,
        order_status: v.orderStatus,
        email: orderEmail,
        tracking_id: orderTrackingId,
        garment_qty: garmentQty,
        garments_sent: orderGarments,
        agency_name: v.agency || null,
        bank_name: v.bankName || null,
        bank_number: v.bankNumber || null,
        ifsc: v.ifsc || null,
        creator_brief_link: parent.creator_brief_link ?? null,
        notes: v.remarks || null,
        // Onboarding does not create a payment row yet; the post flips to a
    // payment-tracked state only when posting flips it to Posted. Leaving
    // payment_status null keeps the PaymentStatus enum (Not Due | Due | Done)
    // intact for downstream Accounts Hub queries.
    payment_status: null,
        parent_post_id: v.postId,
        deliverable_role: "child",
        deliverable_type: kind,
        deliverable_index: childIdx,
        state: parsedAddr.state,
        city: parsedAddr.city,
        pincode: parsedAddr.pincode,
        country: parsedAddr.country,
        street_address: parsedAddr.street,
      });
      nextPostNum++;
      childIdx++;
    };

    for (let i = 0; i < remainingReels; i++) pushChild("reel");
    for (let i = 0; i < remainingPosts; i++) pushChild("post");

    if (children.length > 0) {
      const { error: childErr } = await (supabase as any)
        .from("posts")
        .insert(children);
      if (!childErr) childrenSpawned = children.length;
      else console.error("[onboarding] child spawn failed:", childErr.message);
    }
    // Test Mode: stamp the spawned child deliverable rows when Collab scope is on.
    if (children.length > 0) {
      testCollabPostIds.push(...children.map((c) => c.post_id as string));
    }
  }

  // Test Mode: when the Collab scope is on, mark this collab's posts is_test=true —
  // the onboarded parent post plus any spawned child deliverable rows. No-op off.
  await stampTestRows([
    {
      scope: "collab",
      table: "posts",
      idColumn: "post_id",
      ids: testCollabPostIds,
    },
  ]);

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  // ── Submitter confirmation (Wave 7.x) ───────────────────────────────────
  // Email the actor that onboarding was saved. This is SEPARATE from the
  // collab email (sendCollabEmail), which goes to the influencer — this one
  // confirms the actor's own save. Fire-and-forget via after(); best-effort.
  const creatorHandle = (parent.username as string | null) ?? v.postId;
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
      subject: `Onboarding saved — ${creatorHandle} / ${collabId}`,
      title: "Onboarding saved",
      subtitle: `COLLAB ID: ${collabId}`,
      summaryLines: [
        `Onboarding details for @${creatorHandle} have been saved. The collaboration is now in the Posting stage.`,
      ],
      rows: [
        { label: "Creator", value: `@${creatorHandle}` },
        { label: "Collab ID", value: collabId },
        { label: "Post ID (deliverable)", value: v.postId },
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
        "This confirms your save. The collaboration email to the creator is sent separately.",
      postId: v.postId,
      collabId,
    });
  });

  revalidateTag("posts");
  revalidatePath("/onboarding");
  revalidatePath("/order-status");
  revalidatePath("/journey");
  revalidatePath("/posting");

  return { ok: true, postId: v.postId, childrenSpawned };
}

// ─── Repeat Collab (C2+ for an existing creator, started at Onboarding) ───────

export interface OnboardableCreator {
  inf_id: string;
  username: string;
  inf_name: string | null;
}

/** Existing creators, for the Onboarding "repeat collab" creator dropdown. */
export async function listOnboardableCreators(): Promise<OnboardableCreator[]> {
  await assertPermission("onboarding_write");
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("creators")
    .select("inf_id, username, inf_name")
    .order("inf_id");
  return ((data ?? []) as OnboardableCreator[]).filter((c) => c.inf_id);
}

/** Open (non-closed) campaigns, for the repeat-collab campaign dropdown. */
export async function listOpenCampaigns(): Promise<
  Array<{ campaign_id: string; campaign_name: string | null }>
> {
  await assertPermission("onboarding_write");
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, campaign_name, status")
    .order("campaign_id", { ascending: false });
  return (
    (data ?? []) as Array<{
      campaign_id: string;
      campaign_name: string | null;
      status: string | null;
    }>
  )
    .filter(
      (c) => c.campaign_id && String(c.status ?? "").toLowerCase() !== "closed",
    )
    .map((c) => ({ campaign_id: c.campaign_id, campaign_name: c.campaign_name }));
}

/**
 * Start a NEW collab (C2+) for an EXISTING creator and onboard it in one step.
 * Reach Out only creates C1 (new creators); repeat collabs begin here. We create
 * the C2+ parent post (atomic per-creator P/C via create_repeat_collab) then
 * delegate to the normal submitOnboarding flow. If onboarding fails validation
 * or the order check, the just-created parent is removed (no orphan).
 */
export async function submitRepeatCollab(
  input: unknown,
): Promise<OnboardingResult> {
  await assertPermission("onboarding_write");
  const obj = (input ?? {}) as Record<string, unknown>;
  const infId = String(obj.infId ?? "").trim();
  const campaignId = String(obj.campaignId ?? "").trim();
  const contentType = String(obj.contentType ?? "").trim();
  if (!infId)
    return {
      ok: false,
      error: "Select an existing creator",
      fieldErrors: { infId: "Creator required" },
    };
  if (!campaignId)
    return {
      ok: false,
      error: "Campaign required",
      fieldErrors: { campaignId: "Campaign required" },
    };

  const { infId: _i, campaignId: _c, contentType: _ct, ...onboardingFields } =
    obj;

  // Pre-validate onboarding fields (dummy postId) so we never create an orphan
  // C2 post when the form data is invalid.
  const pre = OnboardingSchema.safeParse({
    ...onboardingFields,
    postId: "PENDING",
  });
  if (!pre.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of pre.error.issues) {
      const path = issue.path.join(".");
      if (path !== "postId" && !fieldErrors[path])
        fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any).rpc("create_repeat_collab", {
    p_inf_id: infId,
    p_campaign_id: campaignId,
    p_content_type: contentType || null,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  const newPostId = (row?.post_id as string | undefined) ?? undefined;
  if (!newPostId)
    return { ok: false, error: "Could not create the repeat collab." };

  const result = await submitOnboarding({
    ...onboardingFields,
    postId: newPostId,
  });
  if (!result.ok) {
    // Failed onboard → remove the just-created C2 parent so no orphan remains.
    await (supabase as any).from("posts").delete().eq("post_id", newPostId);
  }
  return result;
}

// ─── Collab Email ─────────────────────────────────────────────────────────────

export type CollabEmailPreviewResult =
  | {
      ok: true;
      collabId: string;
      creatorName: string;
      emailTo: string;
      deliverables: string[];
      agreedAmount: string;
      barterAmount: string;
      collabType: string;
      adsUsageRights: string;
      campaignId: string | null;
      attachments: CollabEmailAttachment[];
    }
  | { ok: false; error: string };

export type SendCollabEmailResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string };

export interface CollabEmailAttachment {
  kind: "campaignBrief" | "terms";
  label: string;
  fileName: string;
  status: "attached" | "missing" | "unavailable";
  url?: string | null;
  driveId?: string | null;
  note?: string;
}

function extractDriveFileId(urlOrId: string | null | undefined): string | null {
  const value = String(urlOrId || "").trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(value) && !value.includes("/")) return value;
  return (
    value.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    value.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ??
    null
  );
}

export async function getCollabEmailPreview(
  postId: string,
): Promise<CollabEmailPreviewResult> {
  await assertPermission("onboarding_write");
  if (!postId.trim()) return { ok: false, error: "Post ID missing" };

  const supabase = createServiceClient();
  const { data: postRaw, error: postErr } = await (supabase as any)
    .from("posts")
    .select(
      "post_id, inf_id, campaign_id, reels, static_posts, stories, commercial_amount, collab_type, ads_usage_rights, email, order_id, creator_brief_link",
    )
    .eq("post_id", postId.trim())
    .maybeSingle();

  if (postErr)
    return { ok: false, error: (postErr as { message: string }).message };
  const post = postRaw as Record<string, unknown> | null;
  if (!post) return { ok: false, error: `Post ${postId} not found` };

  const infId = post.inf_id as string | null;
  const orderId = post.order_id as string | null;
  const campaignId = (post.campaign_id as string | null) ?? null;

  // Run all independent lookups in parallel.
  const [creatorRaw, campaignRaw, orderRaw, termsFile] = await Promise.all([
    infId
      ? (supabase as any)
          .from("creators")
          .select("inf_name, email")
          .eq("inf_id", infId)
          .maybeSingle()
          .then(
            (r: { data: unknown }) => r.data as Record<string, unknown> | null,
          )
      : Promise.resolve(null),
    campaignId
      ? (supabase as any)
          .from("campaigns")
          .select("brief_link, internal_brief_link")
          .eq("campaign_id", campaignId)
          .maybeSingle()
          .then(
            (r: { data: unknown }) => r.data as Record<string, unknown> | null,
          )
      : Promise.resolve(null),
    orderId && !(post.email as string | null)
      ? (supabase as any)
          .from("shopify_orders")
          .select("email")
          .eq("order_id", orderId)
          .maybeSingle()
          .then(
            (r: { data: unknown }) => r.data as Record<string, unknown> | null,
          )
      : Promise.resolve(null),
    readTermsAttachmentFile(),
  ]);

  const creatorName = (creatorRaw?.inf_name as string | null) ?? "";
  const creatorEmail = (creatorRaw?.email as string | null) ?? "";
  const emailTo =
    (post.email as string | null) ??
    creatorEmail ??
    (orderRaw?.email as string | null) ??
    "";

  const reels = (post.reels as number | null) ?? 0;
  const staticPosts = (post.static_posts as number | null) ?? 0;
  const stories = (post.stories as number | null) ?? 0;
  const deliverables: string[] = [];
  if (reels > 0) deliverables.push(`${reels} Reel${reels > 1 ? "s" : ""}`);
  if (staticPosts > 0)
    deliverables.push(
      `${staticPosts} Static Post${staticPosts > 1 ? "s" : ""}`,
    );
  if (stories > 0)
    deliverables.push(`${stories} Stor${stories > 1 ? "ies" : "y"}`);

  const collabType = (post.collab_type as string | null) ?? "";
  const isPureBarter = collabType.toLowerCase() === "barter";
  const commercials = String((post.commercial_amount as number | null) ?? 0);

  // Only use campaign's brief_link / brief_pdf_url.
  // Never fall back to post.creator_brief_link — that field holds the internal
  // spreadsheet link set during reach-out, not a creator-facing brief PDF.
  const campaignBriefUrl =
    (campaignRaw?.brief_link as string | null) ||
    (campaignRaw?.internal_brief_link as string | null) ||
    "";

  const isSpreadsheetUrl = campaignBriefUrl.includes("spreadsheets");
  const campaignBriefDriveId = isSpreadsheetUrl
    ? null
    : extractDriveFileId(campaignBriefUrl);

  const briefStatus: CollabEmailAttachment["status"] = campaignBriefDriveId
    ? "attached"
    : campaignBriefUrl
      ? "unavailable"
      : "missing";
  const briefNote = campaignBriefDriveId
    ? "Will be attached to the email."
    : isSpreadsheetUrl
      ? "Brief link is a Google Spreadsheet — update campaign with a Docs/Slides/PDF link."
      : campaignBriefUrl
        ? "Brief link is not a Google Drive file URL."
        : "No campaign brief found for this campaign.";

  const attachments: CollabEmailAttachment[] = [
    {
      kind: "campaignBrief",
      label: "Campaign Brief",
      fileName: "Campaign brief from campaign form",
      status: briefStatus,
      url: campaignBriefUrl || null,
      driveId: campaignBriefDriveId,
      note: briefNote,
    },
    {
      kind: "terms",
      label: "T&C Document",
      fileName: TERMS_ATTACHMENT.fileName,
      status: termsFile ? "attached" : "missing",
      url: termsFile ? TERMS_ATTACHMENT.url : null,
      note: termsFile
        ? "Will be attached to the email."
        : "Permanent T&C PDF was not found in the project root.",
    },
  ];

  return {
    ok: true,
    collabId: post.post_id as string,
    creatorName,
    emailTo,
    deliverables,
    agreedAmount: isPureBarter ? "0" : commercials,
    barterAmount: "0",
    collabType,
    adsUsageRights: (post.ads_usage_rights as string | null) ?? "",
    campaignId,
    attachments,
  };
}

function buildCollabEmailHtml(opts: {
  collabId: string;
  creatorName: string;
  agreedAmount: string;
  barterAmount: string;
  deliverables: string[];
  adsUsageRights: string;
  collabType: string;
}): string {
  const escHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const collabId = escHtml(opts.collabId);
  const creatorName = escHtml(opts.creatorName || "creator");
  const agreedAmount = escHtml(opts.agreedAmount);
  const barterAmount = escHtml(opts.barterAmount);
  const adsUsageRights = escHtml(opts.adsUsageRights);
  const collabType = opts.collabType;
  const isPureBarter = collabType.toLowerCase() === "barter";
  const deliverableLines = opts.deliverables
    .map((d) => `<li>${escHtml(d)}</li>`)
    .join("");
  const adsLine = adsUsageRights
    ? `<li>Ads usage rights: <strong>${adsUsageRights}</strong></li>`
    : `<li>Ads usage rights</li>`;
  const commercialsHtml = isPureBarter
    ? `<li>Barter collaboration: product worth <strong>INR ${barterAmount}</strong></li>`
    : `<li>Agreed amount: <strong>INR ${agreedAmount}</strong></li>${Number(barterAmount) > 0 ? `<li>Barter value: <strong>INR ${barterAmount}</strong></li>` : ""}`;

  return `<div style="font-family:Arial,sans-serif;color:#161513;max-width:600px;margin:0 auto;line-height:1.65;background:#FAF8F5;">
<div style="background:#2C2420;padding:24px 28px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td><h2 style="color:#F0C61E;margin:0;font-size:1.18rem;letter-spacing:0.2px;">Collaboration Confirmation</h2><p style="color:rgba(255,255,255,0.66);margin:5px 0 0;font-size:0.78rem;letter-spacing:0.5px;text-transform:uppercase;">Collab ID: <strong style="color:#FFFCF8;">${collabId}</strong></p></td><td align="right" style="vertical-align:middle;"><span style="background:#F0C61E;color:#2C2420;font-size:0.7rem;font-weight:800;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">Saadaa</span></td></tr></table>
</div>
<div style="background:#FAF8F5;padding:26px 28px;border:1px solid #E7E2D2;border-top:none;border-radius:0 0 12px 12px;">
<p style="margin:0 0 10px;">Hi <strong>${creatorName}</strong>,</p>
<p style="margin:0 0 16px;">We're excited to move forward with a collaboration with you.</p>
<p style="margin:0 0 18px;"><span style="display:inline-block;background:#F0EAD6;color:#2C2420;font-size:0.76rem;font-weight:800;padding:5px 12px;border-radius:999px;">COLLAB ID: ${collabId}</span></p>
<h3 style="color:#2C2420;font-size:0.82rem;font-weight:800;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #E7E2D2;padding-bottom:7px;margin:20px 0 10px;">Agreed Deliverables</h3>
<ul style="padding-left:20px;margin:0 0 18px;color:#161513;">${deliverableLines}${adsLine}</ul>
<h3 style="color:#2C2420;font-size:0.82rem;font-weight:800;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #E7E2D2;padding-bottom:7px;margin:20px 0 10px;">Commercials</h3>
<ul style="padding-left:20px;margin:0 0 18px;color:#161513;">${commercialsHtml}</ul>
<h3 style="color:#2C2420;font-size:0.82rem;font-weight:800;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #E7E2D2;padding-bottom:7px;margin:20px 0 10px;">Important Guidelines</h3>
<p style="margin-bottom:6px;"><strong>Hashtags &amp; Tags:</strong></p>
<ul style="padding-left:20px;margin-bottom:16px;color:#161513;"><li>Use hashtags: <strong>#RAHOSAADAA #PEHNOSAADAA #SAADAA #saadaa_women #saadaa_men</strong></li><li>Send a collaboration request to <strong>@saadaadesigns</strong> and <strong>@saadaa_women</strong> or <strong>@saadaa_men</strong></li></ul>
<p style="margin-bottom:6px;"><strong>Timelines:</strong></p>
<ul style="padding-left:20px;margin-bottom:16px;color:#161513;"><li>Script to be shared on the <strong>3rd day</strong> after receiving the product</li><li>First draft to be shared on the <strong>7th day</strong> after receiving the product</li><li>Final content to go live on the <strong>10th day</strong> after receiving the product</li></ul>
<div style="background:#F0EAD6;border:1px solid #E8C87A;border-radius:10px;padding:13px 16px;margin:18px 0;">
<p style="margin:0 0 6px;font-size:0.88rem;"><strong>Payment:</strong> Processed one month after content goes live, either on the <strong>10th or 25th</strong> of the following month.</p>
<p style="margin:0;font-size:0.88rem;"><strong>To receive payment, reply to this email with your invoice/bill</strong> mentioning Collab ID <strong>${collabId}</strong>. Payments without a bill and Collab ID cannot be processed.</p>
</div>
<p>Kindly confirm from your side so we can proceed with the next steps. We're looking forward to creating something impactful together.</p>
<p style="margin-top:24px;margin-bottom:0;">Thanks and Regards,</p>
<p style="margin-top:4px;font-size:1.08rem;font-weight:800;color:#2C2420;letter-spacing:0.4px;">Saadaa</p>
</div>
<p style="font-size:0.7rem;color:#9A9384;text-align:center;margin-top:10px;padding-bottom:8px;">This email was sent via CreatorHub, Saadaa's Influencer Management Platform.</p>
</div>`;
}

async function fetchDriveFileAsAttachment(driveId: string): Promise<{
  fileName: string;
  mimeType: string;
  base64: string;
} | null> {
  try {
    // Works for files shared as "Anyone with the link"
    const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const mimeType =
      res.headers.get("content-type")?.split(";")[0] ?? "application/pdf";
    const disposition = res.headers.get("content-disposition") ?? "";
    const fileNameMatch = disposition.match(
      /filename[^;=\n]*=["']?([^"'\n;]+)/i,
    );
    const fileName = fileNameMatch?.[1]?.trim() ?? "Campaign_Brief.pdf";
    return { fileName, mimeType, base64: buffer.toString("base64") };
  } catch {
    return null;
  }
}

export async function sendCollabEmail(payload: {
  postId: string;
  collabId: string;
  emailTo: string;
  creatorName: string;
  agreedAmount: string;
  barterAmount: string;
  deliverables: string[];
  adsUsageRights: string;
  collabType: string;
  attachmentDriveIds?: string[];
}): Promise<SendCollabEmailResult> {
  await assertPermission("onboarding_write");

  const emailTo = payload.emailTo.trim();
  if (!emailTo || !emailTo.includes("@")) {
    return { ok: false, error: "Invalid email address" };
  }

  const htmlBody = buildCollabEmailHtml({
    collabId: payload.collabId,
    creatorName: payload.creatorName,
    agreedAmount: payload.agreedAmount,
    barterAmount: payload.barterAmount,
    deliverables: payload.deliverables,
    adsUsageRights: payload.adsUsageRights,
    collabType: payload.collabType,
  });

  const supabase = createServiceClient();

  // Stamp sent_at immediately — UI updates without waiting for SMTP.
  await (supabase as any)
    .from("posts")
    .update({ collab_email_sent_at: new Date().toISOString() })
    .eq("post_id", payload.postId);

  revalidateTag("posts");
  revalidatePath("/onboarding");

  // Send email + log after response is returned (non-blocking via after()).
  const sendPayload = { ...payload, htmlBody };
  after(async () => {
    const [termsFile, briefFile] = await Promise.all([
      readTermsAttachmentFile(),
      sendPayload.attachmentDriveIds?.[0]
        ? fetchDriveFileAsAttachment(sendPayload.attachmentDriveIds[0])
        : Promise.resolve(null),
    ]);
    const attachments = [termsFile, briefFile].filter(
      (f): f is NonNullable<typeof f> => f !== null,
    );
    const result = await sendMail({
      to: sendPayload.emailTo,
      subject: `Collaboration Confirmation - ${sendPayload.collabId}`,
      htmlBody: sendPayload.htmlBody,
      attachments: attachments.length ? attachments : undefined,
    });
    const sb = createServiceClient();
    await (sb as any).from("email_logs").insert({
      post_id: sendPayload.postId,
      collab_id: sendPayload.collabId,
      sent_to: sendPayload.emailTo,
      subject: `Collaboration Confirmation - ${sendPayload.collabId}`,
      email_type: "collab",
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : (result.error ?? "unknown"),
    });
  });

  return { ok: true, sentTo: emailTo };
}

export async function skipCollabEmail(
  postId: string,
): Promise<{ ok: boolean; error?: string }> {
  await assertPermission("onboarding_write");
  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("posts")
    .update({ collab_email_skipped: true })
    .eq("post_id", postId);
  if (error) return { ok: false, error: error.message };
  revalidateTag("posts");
  revalidatePath("/onboarding");
  return { ok: true };
}

/**
 * Preview a Shopify order (used by inline form before commit).
 * Returns full snapshot so UI can show email/tracking/address/garments.
 */
export async function lookupShopifyOrder(orderId: string) {
  await assertPermission("onboarding_write");
  const id = orderId.trim();
  if (!id) return { found: false } as const;

  const supabase = createServiceClient();
  const SELECT =
    "order_id, email, tracking_id, tracking_status, fulfillment, order_date, address, customer_name, total_price, line_skus, phone, garments_sent, delivery_date";
  const first = await supabase
    .from("shopify_orders")
    .select(SELECT)
    .eq("order_id", id)
    .maybeSingle();
  if (first.error) return { found: false, error: first.error.message } as const;
  if (first.data) return { found: true, order: first.data } as const;

  // Not synced yet — try the same on-demand live Shopify pull that submit uses
  // (Option B: only upserts if the order carries the `inf` tag), then re-check.
  // Keeps the inline preview consistent with what Submit will do.
  if (serverEnv.NEXT_PUBLIC_SUPABASE_URL && serverEnv.SUPABASE_SERVICE_KEY) {
    try {
      await fetch(
        `${serverEnv.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-shopify-orders?order_id=${encodeURIComponent(id)}`,
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
      console.error("[onboarding] preview on-demand Shopify pull failed:", err);
    }
    const retry = await supabase
      .from("shopify_orders")
      .select(SELECT)
      .eq("order_id", id)
      .maybeSingle();
    if (retry.data) return { found: true, order: retry.data } as const;
  }
  return { found: false } as const;
}
