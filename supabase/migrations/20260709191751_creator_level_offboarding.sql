-- Creator-level offboarding and blacklist enforcement.
--
-- Offboarding is intentionally stored on creators, not posts. A creator who is
-- offboarded cannot be reached out or onboarded again, while every historic
-- post/collab row remains untouched for reporting.

alter table public.creators
  add column if not exists is_blacklisted boolean not null default false,
  add column if not exists blacklist_reason text,
  add column if not exists blacklisted_at timestamptz,
  add column if not exists blacklisted_by text,
  add column if not exists blacklist_evidence jsonb;

comment on column public.creators.is_blacklisted is
  'Creator-level terminal offboarding flag. Blacklisted creators cannot enter Reach Out or Onboarding again.';

comment on column public.creators.blacklist_reason is
  'Mandatory operator-entered reason recorded when the creator is offboarded.';

alter table public.creators
  drop constraint if exists creators_blacklist_fields_check;

alter table public.creators
  add constraint creators_blacklist_fields_check
  check (
    not is_blacklisted
    or (
      nullif(btrim(blacklist_reason), '') is not null
      and blacklisted_at is not null
      and nullif(btrim(blacklisted_by), '') is not null
    )
  );

create index if not exists idx_creators_blacklisted
  on public.creators (blacklisted_at desc)
  where is_blacklisted = true;

create table if not exists public.creator_audit_log (
  id bigserial primary key,
  creator_inf_id text not null,
  username text not null,
  action text not null check (action in ('offboarded')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  actor_email text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_creator_audit_log_creator
  on public.creator_audit_log (creator_inf_id, created_at desc);

create index if not exists idx_creator_audit_log_created
  on public.creator_audit_log (created_at desc);

alter table public.creator_audit_log enable row level security;

revoke all on table public.creator_audit_log from anon, authenticated;
grant select, insert on table public.creator_audit_log to service_role;
grant usage, select on sequence public.creator_audit_log_id_seq to service_role;

drop policy if exists "creator_audit_log service" on public.creator_audit_log;
create policy "creator_audit_log service"
  on public.creator_audit_log
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.log_creator_blacklist_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_blacklisted = true and old.is_blacklisted = false then
    insert into public.creator_audit_log (
      creator_inf_id,
      username,
      action,
      reason,
      actor_email,
      metadata
    ) values (
      new.inf_id,
      new.username,
      'offboarded',
      new.blacklist_reason,
      new.blacklisted_by,
      new.blacklist_evidence
    );
  end if;

  return new;
end;
$$;

revoke all on function public.log_creator_blacklist_change() from public;

drop trigger if exists creators_blacklist_audit on public.creators;
create trigger creators_blacklist_audit
  after update of is_blacklisted on public.creators
  for each row
  when (new.is_blacklisted is distinct from old.is_blacklisted)
  execute function public.log_creator_blacklist_change();
