-- ============================================================================
-- 2026-06-06 — Pending Onboarding cron idempotency flag  (Wave 7, DEFERRED CRON)
--
-- DO NOT APPLY VIA AGENT — the parent applies this migration.
--
-- Companion to 2026_06_06_notification_flags.sql. That migration added the
-- sent-flags for the other five time-based notifications (content reminder,
-- posting pending, payment eligibility, payment SLA breach, campaign ending).
-- It did NOT add a flag for the "Pending Onboarding" alert (Reach Out rows
-- that have sat untouched past the follow-up window), so the daily cron has no
-- way to fire that one exactly once. This migration adds ONLY that column.
--
-- Additive, nullable, no behavioural change. The daily cron route
--   apps/web/app/api/cron/notifications/route.ts
-- stamps this when the Pending Onboarding email fires for a post, then filters
-- on `onboarding_pending_sent_at IS NULL` so it never re-emails the same row.
--
-- Matching email_type = NOTIFICATION_TYPES.PENDING_ONBOARDING ('pending_onboarding').
-- ============================================================================

-- Pending Onboarding → assigned user (posts.onboarded_by). Reach Out rows whose
-- reach_out_date is older than the follow-up window and not yet acted on.
alter table public.posts
  add column if not exists onboarding_pending_sent_at timestamptz;

comment on column public.posts.onboarding_pending_sent_at is
  'Wave7 cron idempotency: stamped when the Pending Onboarding alert fired for this post. NULL = not yet sent.';
