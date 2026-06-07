-- Email logs sink for all outbound CreatorHub emails.
--
-- The collab-email flow (features/onboarding/actions.ts sendCollabEmail) and
-- the upcoming notification matrix insert into public.email_logs, but no
-- migration ever created the table — so logging silently errored at runtime.
-- This creates it to match the insert shape in the code.
--
-- Columns mirror the insert payload:
--   post_id, collab_id, sent_to, subject, email_type, status, error
--
-- PII (recipient emails) lives here, so RLS is enabled with NO public policy —
-- only the service-role client (which bypasses RLS, used by all server actions)
-- can read/write. created_at defaults to now().

create table if not exists public.email_logs (
  id          bigint generated always as identity primary key,
  post_id     text,
  collab_id   text,
  sent_to     text,
  subject     text,
  email_type  text not null default 'collab',
  status      text not null default 'sent',
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_email_logs_post_id_status
  on public.email_logs (post_id, status);

create index if not exists idx_email_logs_created_at
  on public.email_logs (created_at desc);

alter table public.email_logs enable row level security;
-- No policies: locked to service_role (bypasses RLS). anon/auth cannot read PII.
