-- 2026-05-21 — Shopify orders sync (3-hour cron)
--
-- Runs the `sync-shopify-orders` Edge Function every 3 hours via pg_cron + pg_net.
-- The Edge Function pulls Shopify Admin API orders tagged `IFAD` and upserts
-- them into `shopify_orders` (Supabase = sole source of truth per 2026-05-21).
--
-- REPLACE `YOUR_SERVICE_ROLE_KEY_HERE` with the value of SUPABASE_SERVICE_KEY
-- from your `.env.local` (long JWT starting `eyJhbGc...`).
--
-- Idempotent — drops + recreates the schedule.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop existing schedule if present (avoid duplicate).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-shopify-orders-3h') then
    perform cron.unschedule('sync-shopify-orders-3h');
  end if;
end$$;

-- Schedule: at minute 30 every 3 hours (00:30, 03:30, 06:30, ...).
-- Offset by 30 min from Apify cron (15 */3 * * *) to avoid contention.
select cron.schedule(
  'sync-shopify-orders-3h',
  '30 */3 * * *',
  $$
  select net.http_post(
    url     := 'https://xynyvbagcudjrzklwnqp.supabase.co/functions/v1/sync-shopify-orders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verify.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'sync-shopify-orders-3h';
