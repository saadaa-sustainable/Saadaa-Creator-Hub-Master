-- MOM follow-up — track collab email sent timestamp on each post.
-- Used to render a red alert in Onboarding overview when an onboarded
-- post never had its collaboration email sent, so the team can recover.
-- collab_email_skipped allows the team to mark a post as "intentionally
-- no email" so it stops appearing in the Error Portal Missing Email list.
-- Idempotent.

alter table public.posts
  add column if not exists collab_email_sent_at timestamptz;

alter table public.posts
  add column if not exists collab_email_skipped boolean default false;

create index if not exists posts_collab_email_sent_idx
  on public.posts(collab_email_sent_at)
  where collab_email_sent_at is null;

create index if not exists posts_collab_email_missing_idx
  on public.posts(workflow_status, collab_email_sent_at, collab_email_skipped)
  where collab_email_sent_at is null and collab_email_skipped = false;
