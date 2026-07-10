-- Historic backlog posting parity with the live Posting form: the team can
-- attach the raw content dump alongside the post link. (download_link already
-- exists on historic_posts.)
alter table public.historic_posts add column if not exists raw_dump text;
