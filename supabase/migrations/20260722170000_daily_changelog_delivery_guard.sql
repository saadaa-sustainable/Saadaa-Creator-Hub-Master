-- One consolidated daily report per changelog date. The route claims this row
-- before SMTP so Vercel retries and manual backfills cannot duplicate a send.
create unique index if not exists email_logs_daily_changelog_date_uidx
  on public.email_logs (post_id)
  where email_type = 'daily_changelog';
