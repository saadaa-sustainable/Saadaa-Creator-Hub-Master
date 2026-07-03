-- Local mirror of the Meta Ads warehouse SIF-tagged ads. The warehouse lives
-- in a separate Supabase project that Vercel cannot scan within a request
-- (every paged read timed out in prod), so a daily cron + manual seeds write
-- the rollup here and the app reads THIS table (same region, one query).
-- Applied via MCP 2026-07-03.
create table if not exists public.meta_ads_cache (
  token text primary key,           -- SIF-<n>-P<n>, uppercased
  ads jsonb not null,               -- WarehouseAd[] (spend desc, thumbs embedded)
  refreshed_at timestamptz not null default now()
);
alter table public.meta_ads_cache enable row level security;
comment on table public.meta_ads_cache is 'Per-post rollup of warehouse ae_table_view ads (SIF-token keyed). Written by /api/cron/warehouse-sync; read by Ad Status + payment not-tested stamping.';

-- Classification display columns the extended selects expect (never migrated;
-- PostgREST 42703 fallback fired per render). Read-only from the app.
alter table public.posts
  add column if not exists ads_results text,
  add column if not exists ads_status text;
