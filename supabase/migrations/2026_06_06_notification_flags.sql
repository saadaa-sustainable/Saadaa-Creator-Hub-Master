-- ============================================================================
-- 2026-06-06 — Notification idempotency sent-flags  (Wave 7, DEFERRED CRON)
--
-- DO NOT APPLY VIA AGENT — the parent applies this migration.
--
-- Wave 7 ships the EVENT-DRIVEN notifications (Campaign Created, Payment
-- Processed) wired into the app server actions in apps/web. The TIME-BASED /
-- cron notifications (Pending Onboarding, Posting Pending, Content Submission
-- Reminder, Payment Eligibility Achieved, Payment Pending / SLA breach,
-- Campaign Ending Soon) are a focused follow-up that needs pg_cron + an edge
-- function (or an extension of scrape-pending-apify) AND per-row idempotency so
-- a daily run never re-emails the same row.
--
-- This migration adds ONLY those idempotency sent-flag columns — additive,
-- nullable, no behavioural change. The cron stamps each flag after it emails a
-- row, then filters on `... IS NULL` (timestamptz) / `= false` (boolean) so a
-- notification fires exactly once per row.
--
-- Recipients per type live in the TODO(cron) block of
--   apps/web/lib/notifications.ts
-- The matching email_type values live in NOTIFICATION_TYPES in the same file.
--
-- User Invitation is intentionally NOT covered here — it needs an invite-token
-- table + an /auth/accept route and is a separate work item.
-- ============================================================================

-- ── posts ───────────────────────────────────────────────────────────────────
-- Content Submission Reminder → creator (10-day-after-product content deadline).
alter table public.posts
  add column if not exists content_reminder_sent_at timestamptz;

-- Posting Pending → assigned user (On Board past est_delivery + buffer).
alter table public.posts
  add column if not exists posting_pending_sent_at timestamptz;

comment on column public.posts.content_reminder_sent_at is
  'Wave7 cron idempotency: stamped when the Content Submission Reminder email fired for this post. NULL = not yet sent.';
comment on column public.posts.posting_pending_sent_at is
  'Wave7 cron idempotency: stamped when the Posting Pending alert fired for this post. NULL = not yet sent.';

-- ── payments ─────────────────────────────────────────────────────────────────
-- Payment Eligibility Achieved → accounts team (Not Due → Due transition).
alter table public.payments
  add column if not exists eligibility_email_sent boolean default false;

-- Payment Pending / SLA breach → accounts team / global admins
-- (Due past estimated_payable_date + grace).
alter table public.payments
  add column if not exists sla_breach_alert_sent boolean default false;

comment on column public.payments.eligibility_email_sent is
  'Wave7 cron idempotency: true once the Payment Eligibility Achieved email fired for this payment.';
comment on column public.payments.sla_breach_alert_sent is
  'Wave7 cron idempotency: true once the Payment Pending / SLA-breach alert fired for this payment.';

-- ── campaigns ────────────────────────────────────────────────────────────────
-- Campaign Ending Soon → creating user + global admins (end_date within N days).
alter table public.campaigns
  add column if not exists ending_alert_sent boolean default false;

comment on column public.campaigns.ending_alert_sent is
  'Wave7 cron idempotency: true once the Campaign Ending Soon alert fired for this campaign.';
