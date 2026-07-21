-- ============================================================================
-- 2026-07-21 — Delivery Reminder idempotency sent-flag (§5.5 resolved)
--
-- Creator-facing follow-up email: fires once when posts.est_delivery is
-- 2 days away (window: today .. today+2) and the collab is onboarded but not
-- yet Posted. Recipient = posts.email (creators table has no email column).
-- Sent from the daily notifications cron
-- (apps/web/app/api/cron/notifications/route.ts) as email_type
-- 'delivery_reminder'. Additive, nullable, no behavioural change.
-- ============================================================================

alter table public.posts
  add column if not exists delivery_reminder_sent_at timestamptz;

comment on column public.posts.delivery_reminder_sent_at is
  'Cron idempotency: stamped when the pre-deadline Delivery Reminder email fired to the creator for this post. NULL = not yet sent.';
