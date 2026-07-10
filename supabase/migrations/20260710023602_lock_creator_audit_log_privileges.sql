-- Keep creator offboarding history append-only for the application service role.

revoke all on table public.creator_audit_log from service_role;
grant select, insert on table public.creator_audit_log to service_role;

drop policy if exists "creator_audit_log service" on public.creator_audit_log;

create policy "creator_audit_log service select"
  on public.creator_audit_log
  for select
  to service_role
  using (true);

create policy "creator_audit_log service insert"
  on public.creator_audit_log
  for insert
  to service_role
  with check (true);
