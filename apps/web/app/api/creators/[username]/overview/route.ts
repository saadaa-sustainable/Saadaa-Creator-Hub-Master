import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { username } = await params;
  const handle = decodeURIComponent(username).trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ error: "Username missing" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: creator, error: creatorErr } = await (supabase as any)
    .from("creators")
    .select("*")
    .eq("username", handle)
    .maybeSingle();

  if (creatorErr) {
    return NextResponse.json({ error: creatorErr.message }, { status: 500 });
  }
  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const creatorRow = creator as Record<string, unknown>;
  // Posts SELECT — only columns that exist on `posts`. Columns like contact /
  // address / state live ONLY on creators (per current schema); never include
  // here or PostgREST 400s the whole query and posts silently come back empty.
  // Posts SELECT — columns that exist in the live `posts` table. NOTE: the
  // generated types.gen.ts is currently behind the live schema (state, city,
  // pincode, country, street_address, parent_post_id, deliverable_role,
  // tracking_id, garments_sent, garment_qty all exist live per
  // submitOnboarding writes). Keep this in sync with `features/onboarding/
  // actions.ts#postPatch`.
  const { data: postsRaw, error: postsErr } = await (supabase as any)
    .from("posts")
    .select(
      "post_id, post_id_short, campaign_id, workflow_status, content_type, nomenclature, collab_type, commercial_amount, barter_amount, reels, static_posts, stories, ads_usage_rights, order_id, order_status, tracking_id, garment_qty, garments_sent, payment_status, collab_email_sent_at, reach_out_date, onboard_date, post_date, est_delivery, deliverable_index, collab_number, post_link, download_link, email, agency_name, bank_name, bank_number, ifsc, state, city, pincode, country, street_address",
    )
    .or(`inf_id.eq.${creatorRow.inf_id},username.eq.${handle}`)
    .order("reach_out_date", { ascending: false, nullsFirst: false })
    .limit(12);

  if (postsErr) {
    console.error("[creator-overview] posts query failed:", postsErr.message);
  }

  const posts = (postsRaw ?? []) as Record<string, unknown>[];

  // Backfill missing creator-level fields from the most recent post that has
  // them. Only columns that exist on BOTH tables can be backfilled this way.
  // `contact` lives only on creators (posts has no phone column) — leave it.
  const backfillCols = [
    "email",
    "agency_name",
    "bank_name",
    "bank_number",
    "ifsc",
    "state",
  ] as const;
  for (const col of backfillCols) {
    const existing = creatorRow[col];
    if (existing != null && existing !== "") continue;
    for (const post of posts) {
      const value = post[col];
      if (value != null && value !== "") {
        creatorRow[col] = value;
        break;
      }
    }
  }

  // Contact lives only on creators (no `phone` column on posts). Backfill from
  // shopify_orders.phone using the most recent linked order_id.
  if (!creatorRow.contact) {
    const latestOrderId = posts
      .map((p) => p.order_id)
      .find((id): id is string => typeof id === "string" && id.length > 0);
    if (latestOrderId) {
      const { data: shopOrder } = await (supabase as any)
        .from("shopify_orders")
        .select("phone, customer_name, address")
        .eq("order_id", latestOrderId)
        .maybeSingle();
      if (shopOrder?.phone) creatorRow.contact = shopOrder.phone;
      if (!creatorRow.address && shopOrder?.address) {
        creatorRow.address = shopOrder.address;
      }
    }
  }
  const postIds = posts
    .map((post) => post.post_id)
    .filter((postId): postId is string => typeof postId === "string");

  let payments: Record<string, unknown>[] = [];
  if (postIds.length > 0) {
    const { data: paymentRows } = await (supabase as any)
      .from("payments")
      .select("post_id, amount, status, payment_date, due_date, utr")
      .in("post_id", postIds);
    payments = (paymentRows ?? []) as Record<string, unknown>[];
  }

  const totalPaid = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount ?? 0);
    const status = String(payment.status ?? "").toLowerCase();
    return status.includes("paid") ? sum + amount : sum;
  }, 0);
  const totalPayable = payments.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0,
  );

  return NextResponse.json({
    creator: creatorRow,
    stats: {
      postCount: posts.length,
      onboardedCount: posts.filter((post) =>
        ["On Board", "Order Sent", "Posted"].includes(
          String(post.workflow_status ?? ""),
        ),
      ).length,
      paidTotal: totalPaid,
      payableTotal: totalPayable,
      paymentCount: payments.length,
    },
    posts,
    payments,
  });
}
