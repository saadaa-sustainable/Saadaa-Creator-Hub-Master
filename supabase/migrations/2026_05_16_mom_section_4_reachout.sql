-- MOM §4 — Reach Out (Outbound + Inbound)
-- Adds direction tag, per-deliverable commercials breakup, and per-creator brief link.
-- Idempotent — safe to re-run.

alter table public.posts
  add column if not exists reachout_direction      text default 'outbound',
  add column if not exists creator_brief_link      text;
-- Note: commercial_breakup_json was replaced by flat columns
-- (commercial_reel_rate, commercial_post_rate, commercial_story_rate) in
-- 2026_05_16_flatten_json_columns.sql. Run that migration after this one.

-- Constrain direction to known values (drop + re-add for idempotency).
do $$
begin
  if exists (select 1 from information_schema.constraint_column_usage
             where table_name = 'posts' and constraint_name = 'posts_reachout_direction_chk') then
    alter table public.posts drop constraint posts_reachout_direction_chk;
  end if;
end$$;
alter table public.posts
  add constraint posts_reachout_direction_chk check (reachout_direction in ('inbound','outbound'));

create index if not exists posts_reachout_direction_idx on public.posts(reachout_direction);
create index if not exists posts_creator_brief_link_idx on public.posts(creator_brief_link) where creator_brief_link is not null;

-- Helper view: defined in 2026_05_16_flatten_json_columns.sql (references the flat
-- commercial_* columns added there). Skipped here to avoid stale schema reference.
