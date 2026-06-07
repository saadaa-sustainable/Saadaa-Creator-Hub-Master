-- ============================================================================
-- 2026-05-25 — Fix broken cron jobs (Authorization placeholder never replaced)
--
-- Both 3-hr cron jobs (`scrape-pending-apify-3h`, `sync-shopify-orders-3h`)
-- shipped with the literal placeholder `Bearer YOUR_SERVICE_ROLE_KEY_HERE`
-- in the Authorization header. The cron fires on schedule but each Edge
-- Function call returns 401 Unauthorized, so the apify scrape + shopify sync
-- pipelines have NEVER been triggered by cron.
--
-- This migration reschedules both jobs using a Vault-backed service role JWT
-- so the secret is never stored plaintext in `cron.job` rows.
--
-- PREREQUISITE — one-time secret seeding (NOT in git, run via Dashboard SQL
-- Editor with the real key from `apps/web/.env.local` → SUPABASE_SERVICE_KEY):
--
--   select vault.create_secret(
--     '<paste SUPABASE_SERVICE_KEY here>',
--     'supabase_service_role_key',
--     'Service role JWT for pg_cron → Edge Function invocations.'
--   );
--
-- To rotate the key later:
--
--   update vault.secrets
--      set secret = '<new key>'
--    where name = 'supabase_service_role_key';
--
-- Idempotent. Safe to re-run.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- 1. Unschedule the broken jobs so we can recreate them with the vault lookup.
do $$
begin
  perform cron.unschedule('scrape-pending-apify-3h');
exception when others then null;
end$$;

do $$
begin
  perform cron.unschedule('sync-shopify-orders-3h');
exception when others then null;
end$$;

-- 2. Reschedule with vault-backed bearer. `(select decrypted_secret …)` runs
-- inside the cron job at fire time, so the JWT never sits plaintext in
-- cron.job rows.
select cron.schedule(
  'scrape-pending-apify-3h',
  '15 */3 * * *',
  $job$
  select net.http_post(
    url := 'https://xynyvbagcudjrzklwnqp.supabase.co/functions/v1/scrape-pending-apify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'supabase_service_role_key'
         limit 1
      )
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $job$
);

select cron.schedule(
  'sync-shopify-orders-3h',
  '30 */3 * * *',
  $job$
  select net.http_post(
    url := 'https://xynyvbagcudjrzklwnqp.supabase.co/functions/v1/sync-shopify-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'supabase_service_role_key'
         limit 1
      )
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $job$
);
