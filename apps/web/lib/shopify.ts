/**
 * Shopify admin deep links.
 *
 * We store the customer-facing order NUMBER (e.g. 1453329), not Shopify's
 * internal 13-digit order id — the admin's canonical /orders/{id} route needs
 * the internal id, so links go through the admin order-list search instead,
 * which resolves an order number to its order page in one click.
 */
const SHOPIFY_STORE_HANDLE = "saadaa-design";

export function shopifyOrderAdminUrl(
  orderId: string | null | undefined,
): string | null {
  const id = (orderId ?? "").trim();
  if (!id) return null;
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_HANDLE}/orders?query=${encodeURIComponent(id)}`;
}
