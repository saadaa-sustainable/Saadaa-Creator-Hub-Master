-- ============================================================================
-- 2026-06-06 — Sheet View cell edit audit log (Wave 6 / REQ #6, Decision D6)
--
-- Records every successful single-cell write made through the Sheet View
-- `updateSheetCell` server action so the grid can show an "edited" badge
-- (last 7 days) with editor + timestamp, and so critical-column edits can
-- trigger a "revised details" email.
--
-- One row per edit:
--   sheet_key   — Sheet View table id ("posts", "payments", …) i.e. SheetTable.id
--   table_name  — underlying Supabase table the value was written to
--   row_pk      — primary key value of the edited row (text; pk types vary)
--   column_key  — column that changed
--   old_value / new_value — text snapshots (cast at insert time)
--   edited_by   — actor.email
--   edited_at   — defaults to now()
--
-- PII (bank details, emails, etc. can pass through old/new value), so RLS is
-- enabled with NO public policy — only the service-role client (used by all
-- server actions, bypasses RLS) can read/write. Matches email_logs +
-- cell_comments lockdown pattern.
-- ============================================================================

create table if not exists public.cell_edits (
  id          bigint generated always as identity primary key,
  sheet_key   text        not null,
  table_name  text,
  row_pk      text        not null,
  column_key  text        not null,
  old_value   text,
  new_value   text,
  edited_by   text,
  edited_at   timestamptz not null default now()
);

-- Hot path: "recent edits for this sheet" — used to build the badge map.
create index if not exists idx_cell_edits_sheet_recent
  on public.cell_edits (sheet_key, edited_at desc);

-- Per-cell lookup (latest edit for a given cell).
create index if not exists idx_cell_edits_cell
  on public.cell_edits (sheet_key, row_pk, column_key, edited_at desc);

alter table public.cell_edits enable row level security;
-- No policies: locked to service_role (bypasses RLS). anon/auth cannot read PII.

grant select, insert on public.cell_edits to service_role;
