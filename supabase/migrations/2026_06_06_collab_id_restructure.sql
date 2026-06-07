-- ============================================================================
-- 2026-06-06 — Collab ID restructure (DATA migration)
--
-- Replaces the parent/child deliverable model with a clean Collab ID model.
--
--   inf_id     = creator id            e.g. SIF-1
--   collab_id  = inf_id || '-C' || k   e.g. SIF-1-C1   (the k-th collaboration
--                                                       with that creator; one
--                                                       reach-out = one collab)
--   post_id    = SHORT deliverable id  e.g. SIF-1-P1   (drop trailing -C{k})
--
-- A collab with 2 posts + 1 reel = posts SIF-1-P1, SIF-1-P2, SIF-1-P3, ALL
-- sharing collab_id = SIF-1-C1. Deliverables of a collab are grouped by
-- collab_id. There is NO parent/child anymore. Payment is raised per collab_id.
--
-- UNIQUENESS NOTE: post_number is GLOBAL (max+1 across ALL posts), so
-- post_id_short = inf_id||'-P'||post_number is already globally unique. The new
-- post_id (= post_id_short) is therefore unique. Verified on live data: all
-- post_id_short values are distinct and exactly equal regexp_replace of the old
-- post_id, with no NULL post_id_short. This migration nonetheless reformats from
-- coalesce(post_id_short, stripped post_id) defensively.
--
-- IDEMPOTENT + SAFE TO RE-RUN: uses `add column if not exists`, `create index
-- if not exists`, and regexp_replace UPDATEs that are no-ops once the -C suffix
-- has already been stripped (the suffix can only be removed once). collab_id
-- backfills are deterministic recomputes from inf_id + collab_number.
--
-- DOES NOT touch submit_reachout — that RPC is rewritten in the companion
-- migration 2026_06_06_submit_reachout_collab_id.sql.
--
-- Text refs to the OLD full (-C-suffixed) post_id that we rewrite:
--   • posts.post_id                (PK, loose text — no FK references it)
--   • payments.post_id             (loose text ref)
--   • payments.deliverable_post_id (loose text ref)
--   • email_logs.post_id           (loose text ref)
--   • cell_edits.row_pk            (Sheet View pk = posts.post_id; guarded —
--                                   only the `posts` sheet rows match the
--                                   -C pattern, others are untouched)
-- NOT rewritten:
--   • email_logs.collab_id — already exists; the app currently stored the OLD
--     full post_id here. We re-derive it from posts below so it carries the new
--     collab_id semantics instead of leaving stale -C-suffixed post_ids.
--   • system_errors.key — no rows currently hold a -C-suffixed post_id; leaving
--     as-is. (If any are ever added, they are harmless free-text error keys.)
-- ============================================================================

begin;

-- ── 1. posts.collab_id ──────────────────────────────────────────────────────
alter table public.posts
  add column if not exists collab_id text;

-- ── 2. Backfill posts.collab_id = inf_id || '-C' || collab_number ────────────
update public.posts
   set collab_id = inf_id || '-C' || collab_number
 where inf_id is not null
   and collab_number is not null
   and (collab_id is null
        or collab_id is distinct from (inf_id || '-C' || collab_number));

-- ── 4. payments: add + backfill collab_id (BEFORE the PK reformat) ───────────
alter table public.payments
  add column if not exists collab_id text;

update public.payments
   set collab_id = inf_id || '-C' || collab_number
 where inf_id is not null
   and collab_number is not null
   and (collab_id is null
        or collab_id is distinct from (inf_id || '-C' || collab_number));

-- ── 4b. Drop the FKs that reference posts.post_id so the PK can be reformatted.
-- posts.post_id is referenced by payments.post_id (payments_post_id_fkey) and
-- payments.deliverable_post_id (payments_deliverable_post_id_fkey, ON DELETE
-- SET NULL). Renaming the parent PK requires dropping these, updating both
-- sides, then re-adding. All inside one transaction → atomic.
alter table public.payments drop constraint if exists payments_post_id_fkey;
alter table public.payments drop constraint if exists payments_deliverable_post_id_fkey;

-- ── 3/5. Reformat posts.post_id + payments refs to the SHORT form ────────────
--   post_id_short already equals the target short id; fall back to stripping
--   the -C suffix defensively. Re-runnable: once stripped, the regexp no-ops.
update public.posts
   set post_id = coalesce(post_id_short, regexp_replace(post_id, '-C\d+$', ''))
 where post_id ~ '-C\d+$';

update public.payments
   set post_id = regexp_replace(post_id, '-C\d+$', '')
 where post_id ~ '-C\d+$';

update public.payments
   set deliverable_post_id = regexp_replace(deliverable_post_id, '-C\d+$', '')
 where deliverable_post_id ~ '-C\d+$';

-- Re-add the FKs (now pointing at the reformatted PKs).
alter table public.payments
  add constraint payments_post_id_fkey
  foreign key (post_id) references public.posts(post_id);
alter table public.payments
  add constraint payments_deliverable_post_id_fkey
  foreign key (deliverable_post_id) references public.posts(post_id) on delete set null;

-- ── 5. Strip -C suffix from loose text refs in audit/log tables ──────────────
update public.email_logs
   set post_id = regexp_replace(post_id, '-C\d+$', '')
 where post_id ~ '-C\d+$';

-- email_logs.collab_id previously held the OLD full post_id. Re-derive the true
-- collab_id from the (now-short) post_id where we can match a posts row; this
-- repoints it to the new collab semantics. Rows with no matching post are left
-- as-is after the -C strip above already aligned them to a short post_id.
update public.email_logs el
   set collab_id = p.collab_id
  from public.posts p
 where el.post_id = p.post_id
   and p.collab_id is not null
   and el.collab_id is distinct from p.collab_id;

-- cell_edits.row_pk holds the Sheet View row primary key. For the `posts` sheet
-- the pk is post_id, so any -C-suffixed value is a stale full post_id. Strip it
-- (scoped to sheet_key='posts' so other sheets' pks are never touched).
update public.cell_edits
   set row_pk = regexp_replace(row_pk, '-C\d+$', '')
 where sheet_key = 'posts'
   and row_pk ~ '-C\d+$';

-- ── 6. Indexes for collab_id grouping ────────────────────────────────────────
create index if not exists idx_posts_collab_id
  on public.posts (collab_id);

create index if not exists idx_payments_collab_id
  on public.payments (collab_id);

comment on column public.posts.collab_id is
  'Collab grouping key = inf_id || ''-C'' || collab_number (e.g. SIF-1-C1). All deliverable rows of one collaboration share this. Replaces parent/child (deliverable_index) grouping.';
comment on column public.payments.collab_id is
  'Collab this payment covers = inf_id || ''-C'' || collab_number. One payment per collab_id (covers the whole collab). post_id stores a representative deliverable.';

commit;
