/**
 * Shopify admin deep links.
 *
 * `posts.order_id` holds the customer-facing order NUMBER (e.g. 1453329);
 * the admin's canonical /orders/{id} route needs Shopify's INTERNAL 13-digit
 * id, which `shopify_orders.shopify_internal_id` stores (synced by the
 * sync-shopify-orders edge fn, v13+). With the internal id we deep-link
 * straight to the order page; without it (row not yet re-synced) we fall
 * back to the admin order-list search, which is one click away.
 */
const SHOPIFY_STORE_HANDLE = "saadaa-design";

export function shopifyOrderAdminUrl(
  orderId: string | null | undefined,
  internalId?: number | string | null,
): string | null {
  const internal = String(internalId ?? "").trim();
  if (internal && /^\d+$/.test(internal)) {
    return `https://admin.shopify.com/store/${SHOPIFY_STORE_HANDLE}/orders/${internal}`;
  }
  const id = (orderId ?? "").trim();
  if (!id) return null;
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_HANDLE}/orders?query=${encodeURIComponent(id)}`;
}
