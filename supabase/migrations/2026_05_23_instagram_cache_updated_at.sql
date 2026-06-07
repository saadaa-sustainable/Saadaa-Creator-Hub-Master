-- ============================================================================
-- 2026-05-23 — instagram_cache.updated_at
--
-- Tracks when profile data was last refreshed by the Apify cron, separate
-- from scraped_at (first-scrape timestamp). Cron sets updated_at on every
-- successful Apify write so the UI can display "last refreshed X ago".
-- ============================================================================

alter table public.instagram_cache
  add column if not exists updated_at timestamptz;

-- Seed from scraped_at for existing rows.
update public.instagram_cache
  set updated_at = scraped_at
  where updated_at is null and scraped_at is not null;

comment on column public.instagram_cache.updated_at is
  'Timestamp of most recent successful Apify profile refresh. Distinct from scraped_at (first scrape).';
