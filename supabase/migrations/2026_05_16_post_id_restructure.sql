-- MOM §6.1 — POST_ID restructure to SIF-N-PN-CN
-- Adds post_id_short (without collab suffix), collab_number, post_number.
-- Backfills existing rows: SIF-N-PN  →  SIF-N-PN-C1
-- Run AFTER taking a Supabase snapshot (this rewrites every posts.post_id).
-- Idempotent.

alter table public.posts
  add column if not exists post_id_short text,
  add column if not exists collab_number int default 1,
  add column if not exists post_number   int;

-- Backfill: parse existing post_id where it matches SIF-N-PN pattern.
do $$
declare
  r record;
  m text[];
begin
  for r in (
    select id, post_id from public.posts
    where post_id is not null
      and (post_id_short is null or collab_number is null or post_number is null
           or post_id !~ '-C\d+$')
  ) loop
    -- Extract the P-segment if present
    m := regexp_match(r.post_id, '^(.+-P)(\d+)(?:-C(\d+))?$');
    if m is not null then
      update public.posts
        set post_id_short = (m[1] || m[2]),
            post_number   = m[2]::int,
            collab_number = coalesce(nullif(m[3], '')::int, 1),
            post_id       = case
                              when m[3] is null then (m[1] || m[2] || '-C1')
                              else r.post_id
                            end
      where id = r.id;
    end if;
  end loop;
end$$;

-- Unique full post_id constraint stays. Add helper index on the short form
-- (used by §6 deliverable expansion to find all rows under one Collab ID).
create index if not exists posts_post_id_short_idx on public.posts(post_id_short);
create index if not exists posts_collab_idx        on public.posts(inf_id, collab_number);

-- Constrain collab_number > 0
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'posts' and constraint_name = 'posts_collab_number_chk'
  ) then
    alter table public.posts
      add constraint posts_collab_number_chk check (collab_number is null or collab_number >= 1);
  end if;
end$$;
