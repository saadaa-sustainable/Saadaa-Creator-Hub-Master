"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { readTermsAttachmentFile, TERMS_ATTACHMENT } from "@/lib/attachments";
import { logSystemError, resolveSystemError } from "@/lib/system-errors";
import { assertPermission } from "@/lib/rbac.server";
import { assertCreateAllowed } from "@/lib/test-mode";
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
      .eq(v.id != null ? "id" : "post_id", v.id ?? v.postId)
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
      // A reach-out row has no post_id yet — reference it by its row id instead.
      const rowRef = v.postId ?? (v.id != null ? `row #${v.id}` : "—");
      after(async () => {
        await sendNotification({
          type: NOTIFICATION_TYPES.SHOPIFY_VALIDATION_FAILED,
          to: assignee,
          subject: `Shopify order ${v.orderId} not found — onboarding blocked`,
          title: "Shopify order validation failed",
          subtitle: `POST ID: ${rowRef}`,
          htmlBody: `<p style="margin:0 0 12px;">The Shopify Order ID entered while onboarding could not be validated — it was not in the synced data, and a live check on Shopify also did not return a usable order.</p>
<table style="width:100%;border-collapse:collapse;font-size:0.86rem;margin:0 0 14px;">
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;width:34%;">Post ID</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">${esc(rowRef)}</td></tr>
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;">Order ID</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">${esc(v.orderId)}</td></tr>
<tr><td style="background:#F5F1EC;border:1px solid #E7E2D2;padding:8px 12px;font-weight:600;">Reason</td><td style="border:1px solid #E7E2D2;padding:8px 12px;">Order not found, or missing the influencer tag (INF)</td></tr>
</table>
<p style="margin:0;color:#6E695E;font-size:0.82rem;">Check the Order ID is correct and that the order is tagged for influencer orders (INF) on Shopify, then retry onboarding.</p>`,
          postId: v.postId ?? null,
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
      "id, post_id, post_id_short, post_number, collab_number, collab_id, inf_id, username, campaign_id, content_type, reach_out_date, reachout_direction, creator_brief_link, nomenclature",
    )
    .eq(v.id != null ? "id" : "post_id", (v.id ?? v.postId)!)
    .maybeSingle();

  if (parentErr) return { ok: false, error: parentErr.message };
  if (!parentPost) {
    return {
      ok: false,
      error: `Post ${v.id ?? v.postId} not found.`,
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

  // §6.2 deliverable expansion
  const total = v.reels + v.posts;

  // Mint at ONBOARDING. A reach-out row arrives with NULL post_id/post_number/
  // collab — this is its FIRST onboard, so mint_onboarding_block reserves the
  // contiguous P-block (P{maxP+1..maxP+N}) AND the collab C (reuse-on-same-order
  // else next C), with maxP/maxC over posts ∪ historic_posts (historic
  // continuation). A re-onboard of an already-minted row (post_id present) keeps
  // its stored P/C — no re-mint. See project_collab_deliverable_numbering_rule.
  const isFirstOnboard = parent.post_id == null;
  let collabNumber: number | null = null;
  let collabId: string | null = null;
  let startPostNumber: number;
  let postIdBase: string;
  if (isFirstOnboard) {
    if (!parent.inf_id) {
      return { ok: false, error: "Reach-out row is missing its creator id." };
    }
    const { data: minted, error: mintErr } = await (supabase as any).rpc(
      "mint_onboarding_block",
      {
        p_inf_id: parent.inf_id,
        p_order_id: v.orderId,
        p_deliverable_count: Math.max(total, 1),
      },
    );
    if (mintErr) return { ok: false, error: mintErr.message };
    const m = Array.isArray(minted) ? minted[0] : minted;
    collabNumber = (m?.collab_number as number | null) ?? null;
    collabId = (m?.collab_id as string | null) ?? null;
    startPostNumber = (m?.start_post_number as number | null) ?? 1;
    postIdBase =
      (m?.post_id_base as string | null) ??
      `${parent.inf_id}-P${startPostNumber}`;
  } else {
    // Re-onboard / edit of an already-minted collab — reuse its stored ids.
    postIdBase = parent.post_id as string;
    startPostNumber = (parent.post_number as number | null) ?? 1;
    collabNumber = (parent.collab_number as number | null) ?? null;
    collabId =
      (parent.collab_id as string | null) ??
      (parent.inf_id ? `${parent.inf_id}-C${collabNumber ?? 1}` : postIdBase);
  }

  const firstType: "reel" | "post" | null =
    total > 0 ? (v.reels > 0 ? "reel" : "post") : null;
  const parentReels = firstType === "reel" ? 1 : 0;
  const parentPosts = firstType === "post" ? 1 : 0;

  // Equal-split rule: the agreed collab price is divided across all deliverables
  // (parent + children) so SUM(commercial_amount) across the collab equals the
  // originally agreed total.
  const perDeliverableAmount =
    total > 0 ? Math.round((v.commercials / total) * 100) / 100 : v.commercials;

  // Nomenclature now that the deliverable post_id (postIdBase) is known.
  const parentNomenclature =
    (parent.nomenclature as string | null) ||
    buildLegacyNomenclature(
      postIdBase,
      parent.username,
      parent.content_type,
      nomenclatureDate,
    );

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
    // Collab ID model: all deliverable rows of this collab share collab_id +
    // collab_number. Grouping is by collab_id, NOT by parent/child.
    // deliverable_index is kept for ordering only.
    collab_number: collabNumber,
    collab_id: collabId,
    parent_post_id: postIdBase,
    deliverable_role: total > 1 ? "parent" : "single",
  };
  // First onboard mints the deliverable post_id onto the (previously NULL)
  // reach-out row. A re-onboard keeps the stored post_id (do not clobber).
  if (isFirstOnboard) {
    postPatch.post_id = postIdBase;
    postPatch.post_id_short = postIdBase;
    postPatch.post_number = startPostNumber;
  }
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
    .eq(v.id != null ? "id" : "post_id", v.id ?? v.postId);

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
  const testCollabPostIds: string[] = [postIdBase];
  if (isFirstOnboard && total > 1) {
    const remainingReels = firstType === "reel" ? v.reels - 1 : v.reels;
    const remainingPosts = firstType === "post" ? v.posts - 1 : v.posts;

    // Children take the next P-numbers from the block reserved by
    // mint_onboarding_block (the parent took startPostNumber). No re-query of
    // max(post_number) — that would race the reservation.
    let nextPostNum = startPostNumber + 1;
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
        parent_post_id: postIdBase,
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
  const creatorHandle = (parent.username as string | null) ?? postIdBase;
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
        { label: "Post ID (deliverable)", value: postIdBase },
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
      postId: postIdBase,
      collabId,
    });
  });

  revalidateTag("posts");
  revalidatePath("/onboarding");
  revalidatePath("/order-status");
  revalidatePath("/journey");
  revalidatePath("/posting");

  return { ok: true, postId: postIdBase, childrenSpawned };
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

/** Approved (active) campaigns, for the repeat-collab campaign dropdown. */
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
      (c) => c.campaign_id && String(c.status ?? "").toLowerCase() === "active",
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
  kind: "campaignBrief" | "terms" | "voiceNote";
  label: string;
  fileName: string;
  status: "attached" | "missing" | "unavailable";
  url?: string | null;
  driveId?: string | null;
  note?: string;
}

// Saadaa pronunciation voice note — a fixed brand asset attached to every collab
// email. Shared "Anyone with the link" in Drive; override the ID via env if the
// file is ever replaced. Best-effort (does NOT gate the send).
const PRONUNCIATION_DRIVE_FILE_ID = (
  process.env.PRONUNCIATION_DRIVE_FILE_ID ?? "1sNQB9CozBjI4IiujLjNGbaz2FB9RCEBt"
).trim();
const PRONUNCIATION_ATTACHMENT = {
  fileName: "Saadaa_Pronunciation.m4a",
  mimeType: "audio/mp4",
} as const;

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
      "post_id, collab_id, collab_number, inf_id, campaign_id, reels, static_posts, stories, commercial_amount, garment_qty, collab_type, ads_usage_rights, email, order_id, creator_brief_link",
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
  if (reels > 0)
    deliverables.push(`${reels} Collaboration Reel${reels > 1 ? "s" : ""}`);
  if (staticPosts > 0)
    deliverables.push(
      `${staticPosts} Static Post${staticPosts > 1 ? "s" : ""}`,
    );
  if (stories > 0)
    deliverables.push(`${stories} Stor${stories > 1 ? "ies" : "y"}`);

  const collabType = (post.collab_type as string | null) ?? "";
  const isPureBarter = collabType.toLowerCase() === "barter";
  const commercials = String((post.commercial_amount as number | null) ?? 0);
  // Barter value is now the GARMENT QUANTITY (number of products), for BOTH
  // Barter and Barter + Paid. Passed through the `barterAmount` field.
  const garmentQty = String((post.garment_qty as string | null) ?? "").trim();

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
        : "T&C PDF unavailable (Drive fetch + bundled fallback both failed).",
    },
    {
      // Fixed brand asset, resolved server-side from Drive at send time (not from
      // the client) — no driveId here so it never enters attachmentDriveIds.
      kind: "voiceNote",
      label: "Pronunciation Voice Note",
      fileName: PRONUNCIATION_ATTACHMENT.fileName,
      status: "attached",
      url: null,
      note: "Saadaa pronunciation clip — attached to the email.",
    },
  ];

  // The email must show the COLLAB id (SIF-N-C{n}), not the deliverable/post id
  // (SIF-N-P{n}). Prefer the stamped collab_id; fall back to inf_id-C{collab_number}
  // for legacy rows, and only then to post_id.
  const collabDisplayId =
    (post.collab_id as string | null) ||
    (infId ? `${infId}-C${Number(post.collab_number ?? 1)}` : null) ||
    (post.post_id as string);

  return {
    ok: true,
    collabId: collabDisplayId,
    creatorName,
    emailTo,
    deliverables,
    agreedAmount: isPureBarter ? "0" : commercials,
    barterAmount: garmentQty, // now = garment quantity (products), both types
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
  const garments = barterAmount.trim();
  const barterText = garments
    ? `${garments} product${garments === "1" ? "" : "s"}`
    : "products as per order confirmation";
  const adsLine = adsUsageRights
    ? `<li><strong>${adsUsageRights}</strong> of Ads Usage Rights for ads/whitelisting and brand platforms</li>`
    : `<li>Ads Usage Rights for ads/whitelisting and brand platforms</li>`;
  const commercialsHtml = isPureBarter
    ? `<li>Barter: <strong>${barterText}</strong></li>`
    : `<li>Total Agreed Amount: <strong>₹${agreedAmount}</strong></li><li>Barter: <strong>${barterText}</strong></li>`;

  const H3 =
    'color:#2C2420;font-size:0.82rem;font-weight:800;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #E7E2D2;padding-bottom:7px;margin:22px 0 10px;';
  const UL = "padding-left:20px;margin:0 0 8px;color:#161513;";

  return `<div style="font-family:Arial,sans-serif;color:#161513;max-width:600px;margin:0 auto;line-height:1.65;background:#FAF8F5;">
<div style="background:#2C2420;padding:24px 28px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td><h2 style="color:#F0C61E;margin:0;font-size:1.18rem;letter-spacing:0.2px;">Collaboration Confirmation</h2><p style="color:rgba(255,255,255,0.66);margin:5px 0 0;font-size:0.78rem;letter-spacing:0.5px;text-transform:uppercase;">Collab ID: <strong style="color:#FFFCF8;">${collabId}</strong></p></td><td align="right" style="vertical-align:middle;"><span style="background:#F0C61E;color:#2C2420;font-size:0.7rem;font-weight:800;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">Saadaa</span></td></tr></table>
</div>
<div style="background:#FAF8F5;padding:26px 28px;border:1px solid #E7E2D2;border-top:none;border-radius:0 0 12px 12px;">
<p style="margin:0 0 10px;">Hi <strong>${creatorName}</strong>,</p>
<p style="margin:0 0 16px;">We're excited to move forward with this collaboration. Please find the confirmed collaboration details, timelines, payment terms, and content guidelines below.</p>
<p style="margin:0 0 8px;"><span style="display:inline-block;background:#F0EAD6;color:#2C2420;font-size:0.76rem;font-weight:800;padding:5px 12px;border-radius:999px;">COLLAB ID: ${collabId}</span></p>
<h3 style="${H3}">Agreed Deliverables</h3>
<ul style="${UL}">${deliverableLines}${adsLine}</ul>
<h3 style="${H3}">Commercials</h3>
<ul style="${UL}">${commercialsHtml}</ul>
<h3 style="${H3}">Timelines</h3>
<ul style="${UL}"><li>Script Submission: <strong>Within 3 days</strong> of product delivery</li><li>First Draft Submission: <strong>Within 7 days</strong> of product delivery</li><li>Content Go Live: <strong>Within 10 days</strong> of product delivery</li></ul>
<p style="margin:0 0 8px;font-size:0.86rem;color:#6E695E;">All timelines will be counted from the date the product is delivered.</p>
<h3 style="${H3}">Payment Terms</h3>
<ul style="${UL}"><li>Payment will be processed once all agreed deliverables are live and the required ad partnership is active.</li><li>Payments are processed as per our standard payment cycle, one month after the content goes live, on the next applicable payment date, either the <strong>15th or the 30th</strong>.</li><li>To process the payment, please reply to this email with your generated invoice/bill for the agreed amount, clearly mentioning <strong>Collab ID: ${collabId}</strong>.</li></ul>
<h3 style="${H3}">Content Guidelines</h3>
<ul style="${UL}"><li>Use the hashtags: <strong>#RAHOSAADAA #PEHNOSAADAA #SAADAA</strong></li><li>Send the collaboration request to the agreed SAADAA Instagram handle.</li><li>Tag the relevant handles: <strong>@saadaadesigns</strong> and <strong>@saadaa_women</strong> or <strong>@saadaa_men</strong>.</li><li>Please include <strong>@saadaadesigns</strong> and the relevant handle (@saadaa_women or @saadaa_men) in the caption.</li><li>Ensure that the SAADAA brand name is pronounced correctly in the content <em>(a pronunciation voice note is attached).</em></li><li>Use the correct spelling of SAADAA throughout the video, caption, and all overlay text.</li><li>Ensure the product is properly ironed and presented neatly before shooting.</li><li>You're free to write the caption in your own style, as long as it clearly highlights the brand and product.</li></ul>
<h3 style="${H3}">Content Direction</h3>
<p style="margin:0 0 8px;">Keep the content authentic and aligned with your usual content style. The storytelling should feel natural, engaging, and relevant to your audience.</p>
<p style="margin:0 0 14px;">Focus on clean visuals that clearly highlight the product's fit, fabric, and overall look. Please ensure that both the product and brand are clearly visible throughout the content.</p>
<div style="background:#F0EAD6;border:1px solid #E8C87A;border-radius:10px;padding:13px 16px;margin:18px 0;">
<p style="margin:0;font-size:0.88rem;">Kindly review all the details carefully and reply to this email with your confirmation. By confirming, you acknowledge and agree to the deliverables, commercials, timelines, payment terms, content guidelines, and usage rights mentioned above.</p>
</div>
<p style="margin:0 0 4px;">Looking forward to working together and creating great content.</p>
<p style="margin-top:20px;margin-bottom:0;">Thanks &amp; Regards,</p>
<p style="margin-top:4px;font-size:1.08rem;font-weight:800;color:#2C2420;letter-spacing:0.4px;">SAADAA Team</p>
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
  const actor = await assertPermission("onboarding_write");

  const emailTo = payload.emailTo.trim();
  if (!emailTo || !emailTo.includes("@")) {
    return { ok: false, error: "Invalid email address" };
  }

  // The person sending the mail is CC'd; tanvi@saadaa.in is always BCC'd.
  const senderCc = (actor.email ?? "").trim();
  const COLLAB_EMAIL_BCC = "tanvi@saadaa.in";

  // HARD GATE — the creator must never receive an incomplete email. Resolve the
  // two REQUIRED attachments (campaign brief + T&C) up front and confirm the
  // sender CC. If any is missing, block the send entirely, log it to the Error
  // Portal (so the team can fix + retry), and do NOT stamp collab_email_sent_at.
  // The pronunciation voice note is a best-effort brand asset — it does NOT gate.
  const [termsFile, briefFile, voiceRaw] = await Promise.all([
    readTermsAttachmentFile(),
    payload.attachmentDriveIds?.[0]
      ? fetchDriveFileAsAttachment(payload.attachmentDriveIds[0])
      : Promise.resolve(null),
    PRONUNCIATION_DRIVE_FILE_ID
      ? fetchDriveFileAsAttachment(PRONUNCIATION_DRIVE_FILE_ID)
      : Promise.resolve(null),
  ]);

  const missing: string[] = [];
  if (!briefFile) missing.push("Campaign brief");
  if (!termsFile) missing.push("T&C document");
  if (!senderCc) missing.push("Sender CC email");

  if (missing.length > 0) {
    const reason = `Email to ${emailTo} blocked — missing ${missing.join(", ")}. No email sent to the creator.`;
    await logSystemError({
      type: "collab_email_blocked",
      key: payload.postId,
      message: reason,
      source: "sendCollabEmail",
    });
    revalidatePath("/errors");
    return { ok: false, error: reason };
  }
  // Both required attachments guaranteed non-null past this point. The voice note
  // (if it resolved) is force-named/typed and appended best-effort.
  const voiceNote = voiceRaw
    ? {
        ...voiceRaw,
        fileName: PRONUNCIATION_ATTACHMENT.fileName,
        mimeType: PRONUNCIATION_ATTACHMENT.mimeType,
      }
    : null;
  const attachments = [termsFile, briefFile, voiceNote].filter(
    (f): f is NonNullable<typeof f> => f !== null,
  );

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
  const sendPayload = { ...payload, htmlBody, attachments };
  after(async () => {
    const result = await sendMail({
      to: sendPayload.emailTo,
      cc: senderCc || undefined,
      bcc: COLLAB_EMAIL_BCC,
      subject: `Collaboration Confirmation | Collab ID: ${sendPayload.collabId}`,
      htmlBody: sendPayload.htmlBody,
      attachments: sendPayload.attachments,
    });
    const sb = createServiceClient();
    await (sb as any).from("email_logs").insert({
      post_id: sendPayload.postId,
      collab_id: sendPayload.collabId,
      sent_to: sendPayload.emailTo,
      subject: `Collaboration Confirmation | Collab ID: ${sendPayload.collabId}`,
      email_type: "collab",
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : (result.error ?? "unknown"),
    });
    if (result.ok) {
      // Clear any prior block/send-failure for this collab.
      await resolveSystemError(
        "collab_email_blocked",
        sendPayload.postId,
        "sendCollabEmail",
      );
      await resolveSystemError(
        "collab_email_send_failed",
        sendPayload.postId,
        "sendCollabEmail",
      );
    } else {
      // SMTP itself failed — surface in the Error Portal for retry.
      await logSystemError({
        type: "collab_email_send_failed",
        key: sendPayload.postId,
        message: `SMTP send to ${sendPayload.emailTo} failed: ${result.error ?? "unknown"}`,
        source: "sendCollabEmail",
      });
    }
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

  // Not synced yet — try the same on-demand live Shopify pull that submit uses.
  // The edge function resolves the order by NUMBER (not internal id) and only
  // upserts when it carries the `inf` influencer tag (Option B). Keeps the
  // inline preview consistent with what Submit will do.
  if (serverEnv.NEXT_PUBLIC_SUPABASE_URL && serverEnv.SUPABASE_SERVICE_KEY) {
    let untagged = false;
    try {
      const res = await fetch(
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
      // A live order that exists but lacks the `inf` tag is a deliberate
      // rejection, not a miss — surface why so the team can fix the tag.
      const body = (await res.json().catch(() => null)) as
        | { found?: boolean; tagged?: boolean }
        | null;
      if (body?.found && body.tagged === false) untagged = true;
    } catch (err) {
      console.error("[onboarding] preview on-demand Shopify pull failed:", err);
    }
    const retry = await supabase
      .from("shopify_orders")
      .select(SELECT)
      .eq("order_id", id)
      .maybeSingle();
    if (retry.data) return { found: true, order: retry.data } as const;
    if (untagged) {
      return {
        found: false,
        error: "Order found in Shopify but not tagged “inf” — add the influencer tag, then fetch again.",
      } as const;
    }
  }
  return { found: false } as const;
}
