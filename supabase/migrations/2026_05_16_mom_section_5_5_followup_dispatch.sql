-- MOM §5.5 — Follow-Up reminders post-dispatch
-- Stores the day the brand actually dispatched the garment so the cron
-- can fire reminders at CD+4 / +7 / +11 days post-dispatch.
-- Idempotent.

alter table public.posts
  add column if not exists posting_dispatch_date date;

create index if not exists posts_dispatch_idx
  on public.posts(workflow_status, posting_dispatch_date)
  where posting_dispatch_date is not null;

-- Backfill from Shopify orders where the order has actually dispatched.
-- shopify_orders.order_date is fed by Code.js syncShopifyOrderData with the
-- sheet's ORDER SENT DATE (col F) — i.e. when the brand dispatched.
-- shopify_orders.tracking_status mirrors the sheet's SHIPPING STATUS (col J)
-- which the team uses as the operational truth for order tracking.
-- Skip rows that are still "Pending Dispatch" or have no shipping status set.
update public.posts p
  set posting_dispatch_date = s.order_date::date
  from public.shopify_orders s
  where p.posting_dispatch_date is null
    and p.order_id is not null
    and lower(replace(p.order_id, '#', '')) = lower(replace(s.order_id, '#', ''))
    and s.order_date is not null
    and s.tracking_status is not null
    and lower(trim(s.tracking_status)) not in ('pending dispatch', 'unfulfilled', '');
