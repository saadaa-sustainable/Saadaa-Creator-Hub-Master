-- ============================================================================
-- 2026-05-20 — system_errors table
--
-- Generic error sink for Error Portal. Mirrors legacy `System Error Log` sheet
-- (`logSystemError_` in InfluencerBackend.js). First production users:
--   1. ig_fetch     — instaloader / Apify call failed during lookup
--   2. apify_fail   — 3-hour Apify retry exhausted
--   3. collab_email — missing creator email at email-send time
--   4. payment_*    — payment-advice failures, payable-cycle errors
--   5. shopify_sync — webhook/cron fetch failures
--
-- The Error Portal view groups + counts by `type` and surfaces unresolved rows.
-- ============================================================================

create table if not exists public.system_errors (
  id           bigserial primary key,
  type         text not null,
  key          text,
  message      text not null,
  source       text,
  resolved     boolean not null default false,
  resolved_at  timestamptz,
  resolved_by  text,
  created_at   timestamptz not null default now()
);

create index if not exists system_errors_unresolved_idx
  on public.system_errors (created_at desc)
  where resolved = false;

create index if not exists system_errors_type_idx
  on public.system_errors (type, created_at desc);

create index if not exists system_errors_key_idx
  on public.system_errors (key)
  where key is not null;

-- Dedupe helper: when the same (type, key, source) gets re-reported within a
-- short window, surface the latest message instead of accumulating duplicates.
-- Caller uses ON CONFLICT after this partial-unique index.
create unique index if not exists system_errors_dedupe_idx
  on public.system_errors (type, coalesce(key, ''), coalesce(source, ''))
  where resolved = false;

comment on table public.system_errors is
  'Generic error sink for the Error Portal — IG fetch failures, Apify retries, missing emails, etc. One unresolved row per (type, key, source).';

grant select, insert, update, delete on public.system_errors to service_role;
grant select on public.system_errors to authenticated;
