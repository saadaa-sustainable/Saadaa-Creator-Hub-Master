-- collab_counter (creators) + collab_id C1 (cleaned_data). Applied via Supabase MCP as
-- creators_collab_counter_trigger + cleaned_data_collab_id_c1.

-- 1. creators.collab_counter = distinct collabs per creator, kept in sync by a trigger
--    on posts (reach-out C1, onboarding repeat C2+, inf_id moves, deletes).
create or replace function public.sync_creator_collab_counter()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare v_inf text;
begin
  v_inf := coalesce(new.inf_id, old.inf_id);
  if v_inf is null then return coalesce(new, old); end if;
  update creators c set collab_counter = (
    select count(distinct p.collab_number) from posts p
    where p.inf_id = v_inf and p.collab_number is not null)
  where c.inf_id = v_inf;
  if tg_op = 'UPDATE' and new.inf_id is distinct from old.inf_id and old.inf_id is not null then
    update creators c set collab_counter = (
      select count(distinct p.collab_number) from posts p
      where p.inf_id = old.inf_id and p.collab_number is not null)
    where c.inf_id = old.inf_id;
  end if;
  return coalesce(new, old);
end$fn$;
drop trigger if exists trg_sync_collab_counter on posts;
create trigger trg_sync_collab_counter
  after insert or update of inf_id, collab_number or delete on posts
  for each row execute function public.sync_creator_collab_counter();
update creators c set collab_counter = coalesce((
  select count(distinct p.collab_number) from posts p
  where p.inf_id = c.inf_id and p.collab_number is not null), 0);
-- Result: 141 creators @ 1 collab, 7,688 imported @ 0.

-- 2. cleaned_data.collab_id = {sif}-C1 for every real-SIF historic row (historic collabs
--    are untrackable as separate episodes → one collab per creator). SIF_ERROR left null.
update cleaned_data set collab_id = sif_id || '-C1'
where sif_id ~ '^SIF-\d+$' and sif_id <> 'SIF_ERROR';
-- Result: 11,252 rows tagged; 2,178 SIF_ERROR null.
