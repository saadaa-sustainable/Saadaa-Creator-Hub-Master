-- ============================================================================
-- 2026-05-27 — Sheet View cell comments + @-mentions
--
-- Lightweight comment thread per (table_id, row_pk, column_key) so the
-- operator can leave notes / questions / followups on any Sheet View cell.
-- Mentions are stored as a `text[]` of `user_access.email` values so the
-- email column stays the foreign key into the auth table (matching how
-- `onboarded_by` already works elsewhere in the schema).
--
-- Notifications are out-of-scope for this migration — they'll plug into the
-- existing `system_errors` / Slack pipeline via a follow-up cron.
-- ============================================================================

create table if not exists public.cell_comments (
  id            bigserial primary key,
  table_id      text       not null,
  row_pk        text       not null,
  column_key    text       not null,
  body          text       not null,
  mentions      text[]     not null default '{}',
  author_email  text       not null references public.user_access(email)
                  on update cascade on delete restrict,
  resolved      boolean    not null default false,
  resolved_by   text       null references public.user_access(email)
                  on update cascade on delete set null,
  resolved_at   timestamptz null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_cell_comments_cell
  on public.cell_comments (table_id, row_pk, column_key);
create index if not exists idx_cell_comments_table
  on public.cell_comments (table_id);
create index if not exists idx_cell_comments_mentions
  on public.cell_comments using gin (mentions);
create index if not exists idx_cell_comments_author
  on public.cell_comments (author_email);

create or replace function public.touch_cell_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cell_comments_updated_at on public.cell_comments;
create trigger trg_cell_comments_updated_at
  before update on public.cell_comments
  for each row
  execute function public.touch_cell_comments_updated_at();

-- RLS — service role only for now. App reads/writes go through the server
-- action which is already permission-gated via assertPermission().
alter table public.cell_comments enable row level security;

drop policy if exists "cell_comments service" on public.cell_comments;
create policy "cell_comments service"
  on public.cell_comments
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.cell_comments to service_role;
grant usage, select on sequence public.cell_comments_id_seq to service_role;
