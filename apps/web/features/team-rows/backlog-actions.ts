"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { postDateFromUrl } from "@/lib/instagram-shortcode";
import { isContentLink } from "@/lib/workflow";
import { syncCreatorPartnership } from "@/lib/partnership-sync";

/**
 * Historic backlog filling — the team completes missing data on `historic_posts`
 * rows straight from the Historic Analytics row drawer:
 *
 *  - Onboard: enter the Shopify order id → order details auto-fetched and
 *    written onto the row (email / tracking / products / status), plus any
 *    missing collab_type. NO collab-email flow (deliberately).
 *  - Posting: paste the post URL → the post date is auto-derived from the IG
 *    shortcode (same as the live Posting form) and the creator's Meta
 *    partnership invite is auto-sent (best-effort).
 *
 * Funnel + Internal (historic source) read historic_posts on render, so counts
 * reflect the fill on the next refresh.
 */

function todayIsoInIndia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export interface BacklogOrderResult {
  ok: boolean;
  error?: string;
  /** What was written (for the toast). */
  applied?: {
    order_id: string;
    email: string | null;
    tracking_id: string | null;
    order_status: string | null;
    garments_sent: string | null;
  };
}

/** Fill order data on a historic row from a Shopify order id (backlog onboard). */
export async function historicBacklogOnboard(input: {
  id: number;
  orderId: string;
  collabType?: string;
}): Promise<BacklogOrderResult> {
  await assertPermission("onboarding_write");
  const id = Number(input.id);
  const orderId = (input.orderId ?? "").trim();
  if (!Number.isFinite(id) || id <= 0)
    return { ok: false, error: "Row id missing" };
  if (!orderId) return { ok: false, error: "Enter the Shopify order id" };

  const supabase = createServiceClient();
  const [{ data: row, error: rowErr }, { data: order, error: ordErr }] =
    await Promise.all([
      (supabase as any)
        .from("historic_posts")
        .select("id, workflow_status, onboard_date, collab_type")
        .eq("id", id)
        .maybeSingle(),
      (supabase as any)
        .from("shopify_orders")
        .select(
          "order_id, email, tracking_id, tracking_status, fulfillment, garments_sent, address",
        )
        .eq("order_id", orderId)
        .maybeSingle(),
    ]);
  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row) return { ok: false, error: "Historic row not found" };
  if (ordErr) return { ok: false, error: ordErr.message };
  if (!order)
    return {
      ok: false,
      error: `Order ${orderId} not found in synced Shopify orders.`,
    };

  const status =
    (order.tracking_status as string | null) ??
    (order.fulfillment as string | null) ??
    null;
  const patch: Record<string, unknown> = {
    order_id: orderId,
    email: order.email ?? null,
    tracking_id: order.tracking_id ?? null,
    order_status: status,
    garments_sent: order.garments_sent ?? null,
  };
  if (input.collabType?.trim()) patch.collab_type = input.collabType.trim();
  if (!row.onboard_date) patch.onboard_date = todayIsoInIndia();
  // Reached-out row gains its order → it is onboarded now. Never downgrade a
  // row that already progressed (Posted stays Posted).
  const wf = String(row.workflow_status ?? "").trim().toLowerCase();
  if (!wf || wf === "reach out") patch.workflow_status = "On Board";

  const { error: updErr } = await (supabase as any)
    .from("historic_posts")
    .update(patch)
    .eq("id", id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/historic-analytics");
  return {
    ok: true,
    applied: {
      order_id: orderId,
      email: (order.email as string | null) ?? null,
      tracking_id: (order.tracking_id as string | null) ?? null,
      order_status: status,
      garments_sent: (order.garments_sent as string | null) ?? null,
    },
  };
}

export interface BacklogPostingResult {
  ok: boolean;
  error?: string;
  postDate?: string;
  dateSource?: "shortcode" | "today";
}

/** Fill the post link on a historic row — auto post-date + auto partnership invite. */
export async function historicBacklogPosting(input: {
  id: number;
  postLink: string;
}): Promise<BacklogPostingResult> {
  await assertPermission("posting_submit");
  const id = Number(input.id);
  const postLink = (input.postLink ?? "").trim();
  if (!Number.isFinite(id) || id <= 0)
    return { ok: false, error: "Row id missing" };
  if (!isContentLink(postLink))
    return {
      ok: false,
      error: "Enter a real content URL (instagram.com/… or youtube).",
    };

  // Post date: decoded from the IG shortcode (same rule as the live Posting
  // form); falls back to today when the URL carries no decodable id.
  const decoded = postDateFromUrl(postLink);
  const postDate = decoded ?? todayIsoInIndia();

  const supabase = createServiceClient();
  const { data: row, error: rowErr } = await (supabase as any)
    .from("historic_posts")
    .select("id, inf_id, username")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row) return { ok: false, error: "Historic row not found" };

  const { error: updErr } = await (supabase as any)
    .from("historic_posts")
    .update({
      post_link: postLink,
      post_date: postDate,
      workflow_status: "Posted",
    })
    .eq("id", id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/historic-analytics");

  // Auto-invite the creator's Meta partnership (best-effort, never blocks).
  const infId = (row.inf_id as string | null) ?? null;
  const username = (row.username as string | null) ?? null;
  if (infId || username) {
    after(async () => {
      try {
        await syncCreatorPartnership({
          infId,
          username,
          autoInvite: true,
          source: "historic-backlog",
        });
      } catch (err) {
        console.error("[historic-backlog] partnership invite failed:", err);
      }
    });
  }

  return {
    ok: true,
    postDate,
    dateSource: decoded ? "shortcode" : "today",
  };
}
