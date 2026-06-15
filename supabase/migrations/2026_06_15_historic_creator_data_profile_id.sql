-- profile_id on historic_creator_data = legacy Instagram numeric user id
-- (Apify raw_json.id / IG web_profile_info data.user.id). Backfilled by username/ig_handle.
-- Must NOT be unique: the same creator repeats across many historic collab rows.
alter table public.historic_creator_data add column if not exists profile_id text;
alter table public.historic_creator_data drop constraint if exists historic_creator_data_profile_id_key;
create index if not exists idx_historic_creator_data_profile_id on public.historic_creator_data (profile_id);
comment on column public.historic_creator_data.profile_id is 'Legacy Instagram numeric user id (Apify raw_json.id), backfilled by username/ig_handle match. Non-unique (repeats per creator).';
