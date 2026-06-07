-- Expand shopify_orders with the additional Shopify Admin API data we now pull.
-- Fields are written by Code.js#fetchInfOrders (existing trigger). Sheet stays
-- at 12 columns — these extras live in Supabase only.
-- Idempotent.

alter table public.shopify_orders
  add column if not exists subtotal_price        numeric(12,2),
  add column if not exists total_price           numeric(12,2),
  add column if not exists discount_total        numeric(12,2),
  add column if not exists discount_codes        text,           -- comma-separated
  add column if not exists tags                  text,           -- comma-separated
  add column if not exists note                  text,
  add column if not exists financial_status      text,
  add column if not exists customer_order_count  int,
  add column if not exists cancelled_at          timestamptz,
  add column if not exists cancel_reason         text,
  add column if not exists refund_reason         text,
  add column if not exists refunded_at           timestamptz,
  add column if not exists refund_amount         numeric(12,2),
  add column if not exists line_skus             text,           -- comma-separated SKUs
  add column if not exists fulfillment_events    jsonb;          -- full status audit trail

-- Helpful indexes
create index if not exists shopify_orders_tags_idx           on public.shopify_orders using gin (to_tsvector('simple', coalesce(tags, '')));
create index if not exists shopify_orders_discount_codes_idx on public.shopify_orders(discount_codes) where discount_codes is not null;
create index if not exists shopify_orders_cancelled_idx      on public.shopify_orders(cancelled_at) where cancelled_at is not null;
