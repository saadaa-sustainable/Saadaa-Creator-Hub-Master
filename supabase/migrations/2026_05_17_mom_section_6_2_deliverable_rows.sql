-- MOM §6.2 — Deliverable row expansion
-- When team captures reels:N + posts:M in Onboarding's order creation,
-- the parent post_id row stays + N+M-1 child rows are inserted.
-- Each row tracks its own deliverable type so per-deliverable posting can be recorded.
-- Stories are silently dropped per founder spec (Posts + Reels only).
-- Idempotent.

alter table public.posts
  add column if not exists deliverable_type text;

-- Optional FK-like check: only allow 'reel' or 'post'.
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'posts' and constraint_name = 'posts_deliverable_type_chk'
  ) then
    alter table public.posts
      add constraint posts_deliverable_type_chk
      check (deliverable_type is null or deliverable_type in ('reel','post'));
  end if;
end$$;

create index if not exists posts_deliverable_type_idx
  on public.posts(inf_id, collab_number, deliverable_type)
  where deliverable_type is not null;

-- Backfill existing rows: infer deliverable_type from reels/static_posts counts
-- - reels > 0 AND static_posts = 0 → 'reel'
-- - reels = 0 AND static_posts > 0 → 'post'
-- - both > 0 → leave NULL (caller can't disambiguate retroactively for legacy rows)
update public.posts
  set deliverable_type = case
    when coalesce(reels,0) > 0 and coalesce(static_posts,0) = 0 then 'reel'
    when coalesce(reels,0) = 0 and coalesce(static_posts,0) > 0 then 'post'
    else null
  end
  where deliverable_type is null
    and order_id is not null;
