-- ============================================================================
-- 2026-05-20 — instagram_cache.status + instagram_cache.attempts
--
-- Live instagram_cache (Apify-populated mirror) is missing both cols the
-- 3-hour cron + lookupCreator need:
--   status   — 'auto' (data present) | 'pending' (queued for Apify) | 'not_found'
--   attempts — Apify retry counter; reset to 0 on success, halts at MAX_ATTEMPTS
--
-- Existing rows default to status='auto' since they already contain data.
-- Mirrors the legacy Instagram Fetch Errors sheet's de-dupe + retry logic,
-- minus the per-error row noise (errors live in system_errors now).
-- ============================================================================

alter table public.instagram_cache
  add column if not exists status text not null default 'auto';

alter table public.instagram_cache
  add column if not exists attempts int not null default 0;

create index if not exists instagram_cache_pending_idx
  on public.instagram_cache (username)
  where status = 'pending';

comment on column public.instagram_cache.status is
  'Lifecycle: auto (data present) | pending (queued for Apify cron) | not_found (max retries exhausted).';
comment on column public.instagram_cache.attempts is
  'Apify retry counter. Reset to 0 on successful scrape.';
