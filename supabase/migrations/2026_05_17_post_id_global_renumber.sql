-- POST_ID global renumbering policy + deliverable_index column.
-- After this migration, run renumberPostIdsGloballyV2(true) in GAS editor to dry-run,
-- then (false) to apply the renumbering.
-- Idempotent.

alter table public.posts
  add column if not exists deliverable_index int;

create index if not exists posts_deliverable_index_idx
  on public.posts(inf_id, collab_number, deliverable_index)
  where deliverable_index is not null;

-- Initial backfill of deliverable_index from existing post_number ordering.
-- Future writes (GAS renumber + submitReachOut) will replace this with authoritative values.
update public.posts p
  set deliverable_index = sub.idx
  from (
    select id,
      row_number() over (
        partition by inf_id, collab_number
        order by post_number nulls last, id
      ) as idx
    from public.posts
    where inf_id is not null
  ) sub
  where sub.id = p.id
    and p.deliverable_index is null;
