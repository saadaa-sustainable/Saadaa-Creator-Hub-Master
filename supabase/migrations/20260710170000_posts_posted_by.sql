-- Posting-stage attribution: who submitted the Posting form. Older Posted rows
-- stay null — the "Posted by" filter falls back to onboarded_by for them.
alter table public.posts add column if not exists posted_by text;
comment on column public.posts.posted_by is 'Who submitted the Posting form (actor name/email). Older Posted rows are null — filters fall back to onboarded_by.';
