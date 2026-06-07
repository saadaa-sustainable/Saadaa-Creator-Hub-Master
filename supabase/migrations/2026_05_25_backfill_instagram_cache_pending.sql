-- ============================================================================
-- 2026-05-25 — Backfill: queue scrape for creators with no cache row
--
-- Bug: pre-2026-05-25 `submitReachOut` did NOT enqueue `instagram_cache` after
-- the `submit_reachout` RPC. Any creator added via the inbound paste-and-submit
-- path (which bypasses the live IG lookup widget) is stuck with NULL followers,
-- verification, category, profile_pic forever because the 3-hr cron has no
-- pending row to scrape.
--
-- Fix in code: features/reach-out/actions.ts now upserts a pending cache row
-- after the RPC. This migration heals the existing orphans.
--
-- Idempotent — ON CONFLICT DO NOTHING never demotes an already-scraped row
-- back to pending.
-- ============================================================================

insert into public.instagram_cache (username, status, attempts, scraped_at)
select
  lower(c.username),
  'pending',
  0,
  null
from public.creators c
left join public.instagram_cache ic
  on ic.username = lower(c.username)
where c.username is not null
  and trim(c.username) <> ''
  and ic.username is null
on conflict (username) do nothing;
