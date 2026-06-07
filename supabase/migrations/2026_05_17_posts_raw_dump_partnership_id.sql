-- Adds raw_dump + partnership_id columns to public.posts.
-- These columns already exist in the Creator Data sheet (cols RAW_DUMP, PARTNERSHIP_ID)
-- and the posting workflow form writes to them, but the Supabase posts table never had them.
-- The Posting view backend currently does NOT select these columns from Supabase
-- (would 400 since they don't exist). After running this migration, you can re-enable
-- `raw_dump,partnership_id` in the select= at InfluencerBackend.js#_getPostingTableDataFromSupabase_
-- and flip the row-output back to String(p.raw_dump || '').trim() / String(p.partnership_id || '').trim().
-- Idempotent.

alter table public.posts
  add column if not exists raw_dump text;

alter table public.posts
  add column if not exists partnership_id text;
