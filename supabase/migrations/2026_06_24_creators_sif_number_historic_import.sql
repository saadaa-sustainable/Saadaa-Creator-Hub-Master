-- Creators table = full creator registry. inf_id keeps the historic SIF (frozen for
-- Meta ad-name matching); SIF is the ONLY linear counter in the system (P + C derive
-- per-creator from it). Adds sif_number (the linear counter / integrity check),
-- imports every historic creator, and switches submit_reachout to max(sif_number)+1.
--
-- Applied live via Supabase MCP as migrations:
--   creators_sif_number_and_historic_import
--   submit_reachout_use_sif_number_counter
-- Result: 141 -> 7,829 creators; 7,545 with profile_id, 284 deactivated (NULL).

-- 1. Linear-counter column + backfill existing.
alter table creators add column if not exists sif_number integer;
update creators
set sif_number = nullif(regexp_replace(inf_id, '\D', '', 'g'), '')::int
where sif_number is null and inf_id ~ '^SIF-\d+';

-- 2. Import historic creators — one per REAL sif_id in cleaned_data (excl. SIF_ERROR
--    + sifs already a creator), deduped to satisfy UNIQUE(username) + UNIQUE(profile_id):
--    keep one row per username (prefer fetchable + newest sif) and one per non-null
--    profile_id; also exclude usernames/profile_ids already on a creator. inf_id = the
--    historic SIF. profile_id NULL = not fetchable (deactivated). Metrics from
--    ig_data_historic (by profile_id) with cleaned_data text columns as fallback.
with base as (
  select distinct on (cd.sif_id)
    cd.sif_id,
    nullif(regexp_replace(cd.sif_id, '\D', '', 'g'), '')::int as sif_number,
    cd.profile_id,
    lower(nullif(btrim(coalesce(cd.username, cd.ig_handle)), '')) as username,
    nullif(cd.gender, '') as gender,
    coalesce(ig.followers,
      nullif(regexp_replace(coalesce(cd.followers, ''), '[^0-9]', '', 'g'), '')::bigint) as followers,
    coalesce(round(ig.avg_likes)::int,
      nullif(regexp_replace(coalesce(cd.avg_likes, ''), '[^0-9]', '', 'g'), '')::int) as avg_likes,
    ig.image_url as profile_pic
  from cleaned_data cd
  left join lateral (
    select followers, avg_likes, image_url from ig_data_historic ig
    where cd.profile_id is not null and ig.profile_id = cd.profile_id limit 1
  ) ig on true
  where cd.sif_id ~ '^SIF-\d+$' and cd.sif_id <> 'SIF_ERROR'
    and cd.sif_id not in (select inf_id from creators)
    and (cd.profile_id is null
         or cd.profile_id not in (select profile_id from creators where profile_id is not null))
  order by cd.sif_id, (cd.profile_id is not null) desc, (cd.username is not null) desc, cd.id
),
by_user as (
  select distinct on (username) * from base
  where username is not null
    and username not in (select lower(username) from creators where username is not null)
  order by username, (profile_id is not null) desc, sif_number desc
),
by_pid as (
  select distinct on (coalesce(profile_id, 'sif:' || sif_id)) * from by_user
  order by coalesce(profile_id, 'sif:' || sif_id), sif_number desc
)
insert into creators (
  inf_id, sif_number, profile_id, username, instagram_link,
  followers, avg_likes, gender, category, profile_pic, created_at, updated_at
)
select sif_id, sif_number, profile_id, username,
  'https://www.instagram.com/' || username || '/',
  followers, avg_likes, gender,
  case when followers is null then null
       when followers < 10000 then 'Nano'
       when followers < 50000 then 'Micro'
       when followers < 300000 then 'Mid tier'
       when followers < 1000000 then 'Macro'
       else 'Mega' end,
  profile_pic, now(), now()
from by_pid;

-- 3. Counter integrity (1 sif_number = 1 creator).
create unique index if not exists creators_sif_number_unique on creators (sif_number);

-- 4. submit_reachout: next SIF = max(sif_number)+1, and stamp sif_number on new creators.
--    (Full function body in submit_reachout_use_sif_number_counter — only the SIF-gen +
--    creator insert changed; the rest is identical to 2026_06_06_submit_reachout_collab_id.)

-- 5. (REVERTED) A contiguous renumber of inf_id to SIF-1..N was briefly applied then
--    REVERTED — the user clarified they did NOT want the SIFs renumbered, only the
--    table VIEW sorted ascending. So inf_id KEEPS the historic SIF. NET STATE after
--    migrations creators_renumber_inf_id_contiguous + creators_revert_renumber_restore_
--    historic_sif: inf_id = historic SIF (gappy, frozen for ad-name matching),
--    sif_number = its numeric part. Sorting creators by sif_number ASC reads
--    SIF-1, SIF-2, SIF-3, ... (low end is contiguous) — a Table-Editor view setting,
--    not a data change. Next new creator = SIF-{max(sif_number)+1} = SIF-9633.


-- 6. Reorder the surrogate id PK so id-order == sif_number-order (lowest SIF = id 1),
--    so the Table Editor's default (id-ordered) view reads SIF-1, SIF-2, SIF-3...
--    inf_id UNTOUCHED. id is a plain serial w/ no FK + no app refs. Migration
--    creators_reorder_id_by_sif_number (offset +1e8 then row_number() over sif_number;
--    setval creators_id_seq to max). Refresh the editor to see the new order.

-- 7. creator_type label (migration creators_creator_type_label): historic_creator
--    (inf_id in cleaned_data.sif_id OR profile_id in ig_data_historic) vs new_creator.
--    NOT NULL default 'new_creator' + CHECK + index. Backfill: 7,761 historic / 68 new.
--    New reach-out creators get 'new_creator' via the column default. Surfaced on the
--    Reach Out Fetch ("From Records · Historic/New").
