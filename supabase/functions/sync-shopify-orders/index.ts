// supabase/functions/sync-shopify-orders/index.ts
//
// TWO modes:
//  1. BULK (no params) — runs every 3 hours via pg_cron. Pulls Shopify Admin
//     API orders tagged `inf` within the date window and upserts them into
//     `shopify_orders` (Supabase = sole source of truth).
//  2. SINGLE-ORDER on-demand (?order_id=X or POST { order_id }) — resolves ONE
//     order live by its order NUMBER (the value the team enters + posts.order_id
//     stores, e.g. 1444809 — NOT Shopify's internal id) and (Option B) upserts it
//     ONLY if it carries the `inf` influencer tag. Used by onboarding to validate
//     a freshly-placed order the 3-hr bulk sync hasn't picked up yet.
//
// Env (Supabase Edge secrets):
//   SUPABASE_URL                — auto-injected by runtime
//   SUPABASE_SERVICE_ROLE_KEY   — auto-injected by runtime
//   SHOPIFY_STORE_DOMAIN        — e.g. "saadaa.myshopify.com" (no protocol)
//   SHOPIFY_ADMIN_API_TOKEN     — Shopify Admin API token (read_orders scope)
//   SHOPIFY_API_VERSION         — optional, default 2024-10
//   SHOPIFY_DAYS_BACK           — optional, default 14 (bulk window)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN");
const SHOPIFY_ADMIN_API_TOKEN = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2024-10";
const DAYS_BACK = Number(Deno.env.get("SHOPIFY_DAYS_BACK") ?? "14");
const MAX_PAGES = Number(Deno.env.get("SHOPIFY_MAX_PAGES") ?? "4");
// Tag(s) marking influencer orders. The live data uses `inf`. Comma-separated
// for OR-match; override via the SHOPIFY_ORDER_TAGS edge secret if it changes.
const ORDER_TAGS = (Deno.env.get("SHOPIFY_ORDER_TAGS") ?? "inf")
  .split(",")
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);

// Field list requested from Shopify — shared by bulk + single-order fetch so
// mapOrder() always has everything it needs.
const ORDER_FIELDS =
  "id,order_number,name,email,phone,created_at,processed_at,cancelled_at,cancel_reason,financial_status,fulfillment_status,total_price,subtotal_price,total_discounts,discount_codes,tags,note,customer,shipping_address,billing_address,line_items,fulfillments,refunds";

interface ShopifyAddress {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
}

interface ShopifyLineItem {
  sku?: string | null;
  title?: string | null;
  quantity?: number | null;
  name?: string | null;
}

interface ShopifyFulfillment {
  status?: string | null;
  shipment_status?: string | null;
  tracking_number?: string | null;
  tracking_numbers?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ShopifyOrder {
  id: number;
  order_number?: number;
  name?: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  processed_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  total_price?: string | null;
  subtotal_price?: string | null;
  total_discounts?: string | null;
  discount_codes?: { code: string }[] | null;
  tags?: string;
  note?: string | null;
  customer?: { first_name?: string | null; last_name?: string | null; orders_count?: number | null } | null;
  shipping_address?: ShopifyAddress | null;
  billing_address?: ShopifyAddress | null;
  line_items?: ShopifyLineItem[] | null;
  fulfillments?: ShopifyFulfillment[] | null;
  refunds?: { created_at?: string | null; transactions?: { amount?: string }[] }[] | null;
}

function flattenAddress(a?: ShopifyAddress | null): string | null {
  if (!a) return null;
  const parts = [a.address1, a.address2, a.city, a.province, a.zip, a.country]
    .filter((s): s is string => Boolean(s && s.trim()));
  return parts.length ? parts.join(", ") : null;
}

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function mapOrder(o: ShopifyOrder): Record<string, unknown> {
  const customerName = o.customer
    ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ")
    : null;

  const lineSkus = (o.line_items ?? [])
    .map((li) => li.sku)
    .filter((s): s is string => Boolean(s))
    .join(", ");

  const garmentsSent = (o.line_items ?? [])
    .map((li) => li.title || li.name)
    .filter((s): s is string => Boolean(s))
    .join(", ");

  const fulfillments = (o.fulfillments ?? []).sort((a, b) =>
    String(b.updated_at ?? b.created_at ?? "").localeCompare(
      String(a.updated_at ?? a.created_at ?? ""),
    ),
  );
  const latest = fulfillments[0];

  const chain = fulfillments
    .map((f) => {
      const when = fmtDate(f.created_at ?? f.updated_at);
      const status = f.shipment_status ?? f.status ?? "Unknown";
      return when ? `${when} ${status}` : status;
    })
    .reverse()
    .join(" → ");

  const totalRefund = (o.refunds ?? []).reduce((sum, r) => {
    const amt = (r.transactions ?? []).reduce(
      (s, t) => s + (Number(t.amount) || 0),
      0,
    );
    return sum + amt;
  }, 0);

  const refundedAt = (o.refunds ?? []).map((r) => r.created_at).filter(Boolean).sort().pop() ?? null;

  return {
    // Key on the order NUMBER (what the team uses + what posts.order_id stores),
    // NOT the Shopify internal id. Storing String(o.id) caused id-format
    // mismatches → duplicate rows (one per number, one per internal id) and broke
    // creator linkage. Fallback to the internal id only if order_number is absent.
    order_id: String(o.order_number ?? o.id),
    // Internal Shopify id kept alongside — powers direct admin deep links
    // (admin.shopify.com/.../orders/{id}); never used as the row key.
    shopify_internal_id: o.id ?? null,
    customer_name: customerName,
    email: o.email ?? null,
    phone: o.phone ?? o.shipping_address?.phone ?? null,
    garments_sent: garmentsSent || null,
    line_skus: lineSkus || null,
    order_date: fmtDate(o.processed_at ?? o.created_at),
    order_placed_date: fmtDate(o.created_at),
    fulfillment: o.fulfillment_status ?? null,
    tracking_id:
      latest?.tracking_number ??
      (latest?.tracking_numbers && latest.tracking_numbers[0]) ??
      null,
    tracking_status: latest?.shipment_status ?? latest?.status ?? null,
    delivery_date:
      latest?.shipment_status === "delivered"
        ? fmtDate(latest?.updated_at ?? latest?.created_at)
        : null,
    address: flattenAddress(o.shipping_address ?? o.billing_address),
    subtotal_price: Number(o.subtotal_price ?? 0) || null,
    total_price: Number(o.total_price ?? 0) || null,
    discount_total: Number(o.total_discounts ?? 0) || null,
    discount_codes: (o.discount_codes ?? []).map((d) => d.code).join(", ") || null,
    tags: o.tags ?? null,
    note: o.note ?? null,
    financial_status: o.financial_status ?? null,
    customer_order_count: o.customer?.orders_count ?? null,
    cancelled_at: o.cancelled_at ?? null,
    cancel_reason: o.cancel_reason ?? null,
    refunded_at: refundedAt,
    refund_amount: totalRefund > 0 ? totalRefund : null,
    fulfillment_events: chain ? { chain } : null,
    synced_at: new Date().toISOString(),
  };
}

function orderHasInfTag(o: ShopifyOrder): boolean {
  const orderTags = String(o.tags ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase());
  return ORDER_TAGS.some((t) => orderTags.includes(t));
}

function parseLinkHeader(link: string | null): string | null {
  if (!link) return null;
  const next = link.split(",").find((p) => p.includes('rel="next"'));
  if (!next) return null;
  const m = next.match(/<([^>]+)>/);
  return m ? m[1] : null;
}

async function shopifyFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN!,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return shopifyFetch(url);
  }
  return res;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ── SINGLE-ORDER on-demand mode (Option B: INF tag required to upsert) ────────
async function handleSingleOrder(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
): Promise<Response> {
  const clean = orderId.trim().replace(/[^0-9]/g, ""); // team enters digits only
  if (!clean) return json({ ok: true, found: false, matched: 0, reason: "bad_id" });

  // The team enters the order NUMBER (e.g. 1444809 → name "#1444809"), which is
  // NOT Shopify's internal order id (e.g. 7143874855158). GET /orders/{id}.json
  // expects the internal id and 404s on an order number, so resolve by the
  // `name` search endpoint and keep the exact order_number match. `status=any`
  // so paid draft-order conversions and archived orders resolve too.
  const url =
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
    `?status=any&name=${encodeURIComponent(clean)}&limit=50&fields=${ORDER_FIELDS}`;
  const res = await shopifyFetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return json({ ok: false, error: `Shopify ${res.status}`, body: body.slice(0, 300) }, 502);
  }

  const { orders } = (await res.json()) as { orders?: ShopifyOrder[] };
  // Name search can be fuzzy — keep the exact order_number, falling back to an
  // internal-id match in case a raw internal id was ever passed in.
  const order =
    (orders ?? []).find((o) => String(o.order_number ?? "") === clean) ??
    (orders ?? []).find((o) => String(o.id ?? "") === clean) ??
    null;
  if (!order) return json({ ok: true, found: false, matched: 0, reason: "not_found" });

  // Option B — require the influencer tag before accepting the order.
  if (!orderHasInfTag(order)) {
    return json({ ok: true, found: true, matched: 0, tagged: false, reason: "untagged" });
  }

  const { error } = await supabase
    .from("shopify_orders")
    .upsert(mapOrder(order), { onConflict: "order_id" });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, found: true, matched: 1, tagged: true, order_id: String(order.order_number ?? order.id) });
}

Deno.serve(async (req) => {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_TOKEN) {
    console.error("Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_API_TOKEN");
    return json({ ok: false, error: "Shopify env not configured" }, 503);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Single-order mode: ?order_id=X (or POST body { order_id }).
  let singleOrderId: string | null = null;
  try {
    singleOrderId = new URL(req.url).searchParams.get("order_id");
    if (!singleOrderId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const v = (body as { order_id?: unknown })?.order_id;
      singleOrderId = v != null ? String(v) : null;
    }
  } catch {
    // ignore — fall through to bulk
  }
  if (singleOrderId) {
    console.log(`[sync-shopify-orders] single-order ${singleOrderId}`);
    return await handleSingleOrder(supabase, singleOrderId);
  }

  console.log("[sync-shopify-orders] bulk boot");

  const sinceIso = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();
  let url =
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
    `?status=any&limit=250&updated_at_min=${encodeURIComponent(sinceIso)}` +
    `&fields=${ORDER_FIELDS}`;

  let totalSeen = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let pageCount = 0;
  const failed: { order_id: string; error: string }[] = [];

  while (url && pageCount < MAX_PAGES) {
    pageCount++;
    console.log(`[fetch] ${url.slice(0, 120)}...`);
    const res = await shopifyFetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Shopify ${res.status}: ${body.slice(0, 400)}`);
      return json({ ok: false, error: `Shopify ${res.status}`, body: body.slice(0, 400) }, 502);
    }
    const jsonBody = (await res.json()) as { orders: ShopifyOrder[] };
    const batch = jsonBody.orders ?? [];
    totalSeen += batch.length;

    const matched = batch.filter(orderHasInfTag);
    totalMatched += matched.length;

    if (matched.length > 0) {
      const payload = matched.map(mapOrder);
      const { error: upErr, data: upData } = await supabase
        .from("shopify_orders")
        .upsert(payload, { onConflict: "order_id", count: "exact" })
        .select("order_id");
      if (upErr) {
        console.error(`[upsert] ${upErr.message}`);
        for (const o of matched)
          failed.push({ order_id: String(o.id), error: upErr.message });
      } else {
        totalUpserted += (upData ?? []).length;
      }
    }

    url = parseLinkHeader(res.headers.get("Link")) ?? "";
  }

  const moreAvailable = url && pageCount >= MAX_PAGES;
  console.log(
    `[done] seen=${totalSeen} matched=${totalMatched} upserted=${totalUpserted} failed=${failed.length} pages=${pageCount}${moreAvailable ? " (truncated)" : ""}`,
  );

  return json({
    ok: true,
    seen: totalSeen,
    matched: totalMatched,
    upserted: totalUpserted,
    pages: pageCount,
    truncated: !!moreAvailable,
    failed,
  });
});
