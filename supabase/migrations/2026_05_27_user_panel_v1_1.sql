-- ============================================================================
-- 2026-05-27 — User Panel v1.1: enterprise enhancements
--
-- Adds:
--   • user_access.last_login_at, last_active_at, invited_by, invited_at, notes
--   • user_audit_log table — every invite / edit / role-change / deactivate /
--     delete event is recorded so the User Panel can render a "Recent Activity"
--     feed similar to Linear / GitHub member lists.
--
-- Audit log is append-only; no UPDATE/DELETE policies expose it to clients.
-- ============================================================================

alter table public.user_access
  add column if not exists last_login_at  timestamptz,
  add column if not exists last_active_at timestamptz,
  add column if not exists invited_by     text,
  add column if not exists invited_at     timestamptz default now(),
  add column if not exists notes          text;

create table if not exists public.user_audit_log (
  id            bigserial primary key,
  actor_email   text       not null,                  -- who performed the action
  target_email  text       not null,                  -- which user was affected
  action        text       not null check (action in (
                              'invite',
                              'edit',
                              'role_change',
                              'activate',
                              'deactivate',
                              'delete',
                              'login',
                              'csv_invite_batch'
                            )),
  before_json   jsonb,
  after_json    jsonb,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_user_audit_log_target
  on public.user_audit_log (target_email);
create index if not exists idx_user_audit_log_actor
  on public.user_audit_log (actor_email);
create index if not exists idx_user_audit_log_created
  on public.user_audit_log (created_at desc);
create index if not exists idx_user_audit_log_action
  on public.user_audit_log (action);

alter table public.user_audit_log enable row level security;

drop policy if exists "user_audit_log service" on public.user_audit_log;
create policy "user_audit_log service"
  on public.user_audit_log
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert on public.user_audit_log to service_role;
grant usage, select on sequence public.user_audit_log_id_seq to service_role;
