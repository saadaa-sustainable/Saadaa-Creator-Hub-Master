-- ============================================================================
-- 2026-06-06 — RBAC matrix extension (Wave 9, D12 + D13) + User Master fields
--
-- ADDITIVE ONLY. Mirrors the new PermissionKey scopes added to lib/rbac.ts:
--   order_status_view, sheet_view, offboarding_write, system_config, role_mgmt
--
-- Net effect for current users: nobody loses a scope. Global Admins gain the
-- five new scopes (incl. offboarding_write — so Tanvi, who is in ADMIN_EMAILS
-- and on the Global Admin role, can run Offboarding without any change to
-- ADMIN_EMAILS). User + Accounts Team gain only the read scopes they already
-- effectively had (order_status_view, sheet_view); they are explicitly DENIED
-- the admin-only + offboarding scopes so the matrix is unambiguous.
--
-- NOTE on safety: even before this seed runs, getActor() in lib/auth.ts grants
-- any non-admin scope to a Global Admin via the `permissions.includes("admin")`
-- implication inside hasPermission(). So admins already pass an
-- offboarding_write check. This seed makes the grant explicit + visible in the
-- User Panel permission matrix.
-- ============================================================================

-- --- New scope grants for the 3 system roles -------------------------------
with
  ga as (select id from public.access_roles where name = 'Global Admin'),
  us as (select id from public.access_roles where name = 'User'),
  ac as (select id from public.access_roles where name = 'Accounts Team')
insert into public.access_role_permissions (role_id, scope, granted) values
  -- Global Admin = all new scopes granted
  ((select id from ga), 'order_status_view', true),
  ((select id from ga), 'sheet_view',        true),
  ((select id from ga), 'offboarding_write', true),
  ((select id from ga), 'system_config',     true),
  ((select id from ga), 'role_mgmt',         true),

  -- User = view scopes only; admin-only + offboarding explicitly denied
  ((select id from us), 'order_status_view', true),
  ((select id from us), 'sheet_view',        true),
  ((select id from us), 'offboarding_write', false),
  ((select id from us), 'system_config',     false),
  ((select id from us), 'role_mgmt',         false),

  -- Accounts Team = view scopes only; admin-only + offboarding explicitly denied
  ((select id from ac), 'order_status_view', true),
  ((select id from ac), 'sheet_view',        true),
  ((select id from ac), 'offboarding_write', false),
  ((select id from ac), 'system_config',     false),
  ((select id from ac), 'role_mgmt',         false)
on conflict (role_id, scope) do update set granted = excluded.granted;

-- --- Custom 'Offboarding Manager' role (D12) -------------------------------
-- For FUTURE assignment to a non-admin who should own offboarding without full
-- admin. NOT assigned to anyone here. is_system=false so the User Panel can
-- edit/delete it like any custom role.
insert into public.access_roles (name, description, is_system, color, created_by)
values
  ('Offboarding Manager',
   'Move collabs to the terminal Offboarding stage + view performance analytics',
   false, '#B57514', 'system')
on conflict (name) do nothing;

insert into public.access_role_permissions (role_id, scope, granted)
select r.id, v.scope, v.granted
from public.access_roles r
cross join (values
  ('offboarding_write', true),
  ('performance_view',  true)
) as v(scope, granted)
where r.name = 'Offboarding Manager'
on conflict (role_id, scope) do update set granted = excluded.granted;

-- --- User Master fields (Wave 9, Part C — additive) ------------------------
-- Shrishti User Master spec columns missing from user_access. Both nullable +
-- no default so existing rows are unaffected and no INSERT path breaks.
alter table public.user_access
  add column if not exists employee_id text;

alter table public.user_access
  add column if not exists department text;
