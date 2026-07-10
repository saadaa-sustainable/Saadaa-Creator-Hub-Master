import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import type { InfOrderRow } from "@/features/accounts-hub/types";

/**
 * GET /api/accounts/inf-orders
 *
 * Order-detail view for the accounts team: EVERY collab that is mapped to a
 * Collab ID and has an order (both Barter and Barter + Paid). Unmapped orders
 * (no collab_id) are excluded. One representative row per collab_id (lowest
 * post_id); `commercial` is the collab total (sum of the deliverable splits)
 * finalized at onboarding. Order details (date / tracking / total) come from
 * shopify_orders joined by order_id in JS (no PostgREST FK on the text key).
 */
export async function GET() {
  try {
    await assertPermission("accounts_write");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(
      `
      post_id, inf_id, collab_id, collab_number, campaign_id, collab_type,
      commercial_amount, garment_qty, order_id, order_status, onboard_date,
      creator:creators ( inf_name, username, profile_pic ),
      campaign:campaigns ( campaign_id, campaign_name )
    `,
    )
    .not("collab_id", "is", null)
    .not("order_id", "is", null)
    .limit(10_000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<Record<string, any>>;

  // Group by collab_id → representative (lowest post_id) + collab commercial total.
  const byCollab = new Map<
    string,
    { rep: Record<string, any>; total: number; count: number }
  >();
  for (const r of rows) {
    const key = String(r.collab_id);
    const entry = byCollab.get(key);
    const amount = Number(r.commercial_amount ?? 0);
    if (!entry) {
      byCollab.set(key, { rep: r, total: amount, count: 1 });
    } else {
      entry.total += amount;
      entry.count += 1;
      if (String(r.post_id ?? "") < String(entry.rep.post_id ?? "")) {
        entry.rep = r;
      }
    }
  }

  // Pull order details for the representative orders.
  const orderIds = [
    ...new Set(
      [...byCollab.values()]
        .map((e) => String(e.rep.order_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const orderById = new Map<string, Record<string, any>>();
  if (orderIds.length > 0) {
    const { data: orders } = await (supabase as any)
      .from("shopify_orders")
      .select("order_id, order_date, order_placed_date, tracking_status, total_price")
      .in("order_id", orderIds)
      .limit(10_000);
    for (const o of (orders ?? []) as Array<Record<string, any>>) {
      orderById.set(String(o.order_id), o);
    }
  }

  const result: InfOrderRow[] = [...byCollab.entries()].map(([key, e]) => {
    const r = e.rep;
    const order = orderById.get(String(r.order_id ?? "").trim());
    return {
      post_id: String(r.post_id ?? ""),
      collab_id: key,
      inf_id: r.inf_id ?? null,
      inf_name: r.creator?.inf_name ?? null,
      username: r.creator?.username ?? null,
      profile_pic: r.creator?.profile_pic ?? null,
      campaign_id: r.campaign?.campaign_id ?? r.campaign_id ?? null,
      campaign_name: r.campaign?.campaign_name ?? null,
      collab_type: r.collab_type ?? null,
      commercial: e.total,
      garment_qty: r.garment_qty ?? null,
      onboard_date: r.onboard_date ?? null,
      order_id: r.order_id ?? null,
      order_date: order?.order_date ?? order?.order_placed_date ?? null,
      order_status: r.order_status ?? null,
      tracking_status: order?.tracking_status ?? null,
      order_total: order?.total_price != null ? Number(order.total_price) : null,
      deliverables: e.count,
    };
  });

  // Newest onboardings first.
  result.sort((a, b) =>
    String(b.onboard_date ?? "").localeCompare(String(a.onboard_date ?? "")),
  );

  return NextResponse.json({ rows: result });
}
