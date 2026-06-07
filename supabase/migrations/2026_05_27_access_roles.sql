-- ============================================================================
-- 2026-05-27 — Custom role + permission system
--
-- Replaces the hardcoded role matrix in lib/rbac.ts with a DB-driven schema.
-- Global Admins can now create their own roles (e.g. "Junior Onboarder",
-- "Read-Only Auditor") and assign granular permission scopes.
--
-- System roles (Global Admin, User, Accounts Team) are seeded with
-- is_system=true so they cannot be deleted from the UI.
-- ============================================================================

create table if not exists public.access_roles (
  id            uuid primary key default gen_random_uuid(),
  name          text       unique not null,
  description   text,
  is_system     boolean    not null default false,
  color         text,          -- optional accent color hex (UI badge)
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.access_role_permissions (
  role_id       uuid       not null references public.access_roles(id) on delete cascade,
  scope         text       not null,
  granted       boolean    not null default true,
  primary key (role_id, scope)
);

create index if not exists idx_arp_role on public.access_role_permissions (role_id);
create index if not exists idx_arp_scope on public.access_role_permissions (scope);

-- Touch trigger on access_roles ----------------------------------------------
create or replace function public.touch_access_roles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_access_roles_updated_at on public.access_roles;
create trigger trg_access_roles_updated_at
  before update on public.access_roles
  for each row execute function public.touch_access_roles_updated_at();

-- RLS — service role only; app reads/writes go through permission-gated
-- server actions.
alter table public.access_roles enable row level security;
alter table public.access_role_permissions enable row level security;

drop policy if exists "access_roles service" on public.access_roles;
create policy "access_roles service" on public.access_roles
  for all to service_role using (true) with check (true);

drop policy if exists "arp service" on public.access_role_permissions;
create policy "arp service" on public.access_role_permissions
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.access_roles to service_role;
grant select, insert, update, delete on public.access_role_permissions to service_role;

-- Seed system roles ---------------------------------------------------------
insert into public.access_roles (name, description, is_system, color, created_by)
values
  ('Global Admin',  'Full administrative access — everything',                 true, '#F0C61E', 'system'),
  ('User',          'Default team member — workflow stages, no admin / billing', true, '#4F7C4D', 'system'),
  ('Accounts Team', 'Payments + Accounts Hub + Cost Analytics only',             true, '#0F766E', 'system')
on conflict (name) do nothing;

-- Permission scopes mirror PermissionKey union in lib/rbac.ts ---------------
-- Seed the system role grants.
with
  ga as (select id from public.access_roles where name = 'Global Admin'),
  us as (select id from public.access_roles where name = 'User'),
  ac as (select id from public.access_roles where name = 'Accounts Team')
insert into public.access_role_permissions (role_id, scope, granted) values
  ((select id from ga), 'admin',              true),
  ((select id from ga), 'campaign_create',    true),
  ((select id from ga), 'reachout_outbound',  true),
  ((select id from ga), 'reachout_inbound',   true),
  ((select id from ga), 'onboarding_write',   true),
  ((select id from ga), 'posting_submit',     true),
  ((select id from ga), 'accounts_write',     true),
  ((select id from ga), 'performance_view',   true),

  ((select id from us), 'admin',              false),
  ((select id from us), 'campaign_create',    true),
  ((select id from us), 'reachout_outbound',  true),
  ((select id from us), 'reachout_inbound',   true),
  ((select id from us), 'onboarding_write',   true),
  ((select id from us), 'posting_submit',     true),
  ((select id from us), 'accounts_write',     false),
  ((select id from us), 'performance_view',   true),

  ((select id from ac), 'admin',              false),
  ((select id from ac), 'campaign_create',    false),
  ((select id from ac), 'reachout_outbound',  false),
  ((select id from ac), 'reachout_inbound',   false),
  ((select id from ac), 'onboarding_write',   false),
  ((select id from ac), 'posting_submit',     false),
  ((select id from ac), 'accounts_write',     true),
  ((select id from ac), 'performance_view',   true)
on conflict (role_id, scope) do update set granted = excluded.granted;

-- View — convenient role+permission rollup ---------------------------------
create or replace view public.access_role_summary as
select
  r.id,
  r.name,
  r.description,
  r.is_system,
  r.color,
  r.created_by,
  r.created_at,
  r.updated_at,
  coalesce(
    (select count(*) from public.access_role_permissions p where p.role_id = r.id and p.granted),
    0
  ) as granted_count,
  coalesce(
    (select count(*) from public.user_access u where u.role = r.name),
    0
  ) as user_count
from public.access_roles r;

grant select on public.access_role_summary to service_role;
