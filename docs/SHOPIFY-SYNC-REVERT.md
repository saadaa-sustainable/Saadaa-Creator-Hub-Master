# Shopify order sync — local Python script vs Supabase cron

Two interchangeable ways to keep `shopify_orders` in sync (Supabase = sole source
of truth). Both pull Shopify Admin orders tagged `inf` (last N days) and upsert by
`order_id`. The Python script exists to avoid paying per Supabase cron +
edge-function invocation — host it yourself instead.

## Option A — LOCAL Python script (cheaper, self-hosted)

`sync_shopify_orders.py` (repo root) replicates the edge function's `mapOrder()`
1:1. Reads creds from `apps/web/.env.local` (`SHOPIFY_ADMIN_TOKEN`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`; store defaults to
`saadaa-design.myshopify.com`).

```
pip install requests
python sync_shopify_orders.py --once          # single pass
python sync_shopify_orders.py                  # daemon, every 3h (--interval secs)
python sync_shopify_orders.py --order-id 123   # backfill one order
```

Run it as a daemon (a `screen`/`tmux` session, a `launchd`/systemd unit, or a
scheduled GitHub Action that calls `--once`). While it runs, **unschedule the
Supabase cron** so you aren't billed twice:

```sql
select cron.unschedule('sync-shopify-orders-3h');
```

The `sync-shopify-orders` edge function stays DEPLOYED (the single-order on-demand
path — `?order_id=` — is still used by the app for instant order linking, and it's
the fallback). Only the bulk 3-hr cron is turned off.

## Option B — Supabase cron (original, always-on, costs per run)

Edge function `supabase/functions/sync-shopify-orders/index.ts` + pg_cron
`sync-shopify-orders-3h` (`30 */3 * * *`). To RESTORE the cron after using Option A:

```sql
select cron.schedule(
  'sync-shopify-orders-3h', '30 */3 * * *',
  $$select net.http_post(
     url := 'https://xynyvbagcudjrzklwnqp.supabase.co/functions/v1/sync-shopify-orders',
     headers := jsonb_build_object(
       'Content-Type','application/json',
       'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                      where name='supabase_service_role_key')))$$);
```

## Notes
- Don't run BOTH (cron + daemon) — harmless (idempotent upsert) but wasteful.
- The Python script needs `SHOPIFY_DAYS_BACK` ≥ your sync gap. If the daemon was
  down for a while, run `--days-back 30` once to backfill.
- Field mapping lives in two places now (TS edge fn + Python). If you change one,
  change the other.
