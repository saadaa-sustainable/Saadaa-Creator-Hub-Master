-- ============================================================================
-- 2026-05-23 — payments: add UNIQUE(post_id) + clean up duplicate draft rows
--
-- Problem: concurrent page loads each ran the backfill check, saw no row, and
-- inserted a draft — creating N duplicate NULL-UTR rows per post_id.
-- Fix: keep only the newest row per post_id, then add a unique constraint so
-- the DB prevents this at write time. Backfill + submit both use upsert after.
-- ============================================================================

-- 1. Delete duplicate draft rows — keep the newest (highest id) per post_id.
delete from public.payments
where id not in (
  select max(id) from public.payments group by post_id
);

-- 2. Delete any remaining NULL-utr / Not Due drafts that were auto-created
--    (clean slate; backfill will recreate them on next page load via upsert).
delete from public.payments
where utr is null
  and status in ('Not Due', 'Due');

-- 3. Add unique constraint so the DB prevents duplicate post_id rows.
alter table public.payments
  add constraint payments_post_id_unique unique (post_id);
