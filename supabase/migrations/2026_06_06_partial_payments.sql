-- ============================================================================
-- 2026-06-06 — payments: PARTIAL PAYMENTS (installments per collab)
--
-- Feature: a collab whose agreed total is e.g. ₹10,000 can be paid in
-- installments. Accounts logs ₹2,000 now → ₹8,000 stays outstanding and the
-- collab reads as "Partial" until the installments sum up to the total, at
-- which point it flips to "Done". Accounts Hub surfaces the outstanding
-- balance with a banner + KPI + a "Partial" pill.
--
-- This migration makes two schema changes + documents the null-UTR draft
-- handling. It is INTENTIONALLY NOT applied here — the parent reviews and
-- applies it.
--
-- 1. payments_status_chk — allow 'Partial' in addition to the existing states.
--      old: status IS NULL OR status IN ('Not Due','Due','Done')
--      new: status IS NULL OR status IN ('Not Due','Due','Partial','Done')
--
-- 2. payments_post_id_unique → payments_post_utr_unique
--      old: UNIQUE (post_id)            -- one payment row per post (collab)
--      new: UNIQUE (post_id, utr)       -- many installment rows per collab,
--                                          each carrying a DISTINCT utr.
--
--    NULL-UTR draft handling (READ BEFORE APPLYING):
--    Postgres treats NULLs as DISTINCT in a UNIQUE index, so UNIQUE(post_id,
--    utr) does NOT prevent two NULL-utr rows for the same post_id. That's
--    fine for real installments (they always carry a UTR), but it means the
--    auto-initialised DRAFT row (status 'Not Due'/'Due', utr NULL) is NOT
--    DB-guarded against duplication. The app guards this instead:
--      - the page-load backfill upserts the draft with
--        onConflict:'post_id' ... wait — that conflict target no longer has a
--        unique. So the app is being changed to MATCH the existing draft row
--        (select the lone null-utr row for the collab, update in place) and
--        only INSERT a draft when none exists. submitPayments never writes a
--        second null-utr draft: a partial/full installment always has a UTR
--        and is inserted as a NEW row; the draft is updated in place (status
--        Partial/Done), never duplicated.
--      - There must be AT MOST ONE null-utr draft per post_id. The cleanup in
--        step 0 collapses any pre-existing duplicates before the new unique
--        is added (the old UNIQUE(post_id) already guaranteed this on live
--        data — verified zero duplicates at authoring time — but the cleanup
--        is kept as a belt-and-braces idempotent guard).
--
-- posts.payment_status: there is NO CHECK constraint on posts.payment_status
-- (it is plain nullable text — verified against live schema), so writing the
-- new value 'Partial' to it needs no DDL change. Documented here for the
-- reviewer; no ALTER is emitted for posts.
-- ============================================================================

begin;

-- 0. Belt-and-braces: collapse any duplicate NULL-utr drafts per post_id
--    (keep newest). No-op on current live data (old UNIQUE(post_id) held).
delete from public.payments p
using (
  select post_id, max(id) as keep_id
  from public.payments
  where utr is null
  group by post_id
  having count(*) > 1
) d
where p.post_id = d.post_id
  and p.utr is null
  and p.id <> d.keep_id;

-- 1. Extend the status check to allow 'Partial'.
alter table public.payments
  drop constraint if exists payments_status_chk;

alter table public.payments
  add constraint payments_status_chk
  check (
    status is null
    or status = any (array['Not Due'::text, 'Due'::text, 'Partial'::text, 'Done'::text])
  );

-- 2. Swap the post_id unique for a (post_id, utr) unique so a collab can carry
--    multiple installment rows (each a distinct UTR). Matches the app dedup
--    key (post_id, lower(utr)). See the NULL-UTR note in the header.
alter table public.payments
  drop constraint if exists payments_post_id_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_post_utr_unique'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_post_utr_unique unique (post_id, utr);
  end if;
end$$;

comment on constraint payments_post_utr_unique on public.payments is
  'Allows multiple payment installments per post_id/collab, each with a distinct UTR. NULL-utr draft rows are NOT DB-deduped (Postgres treats NULLs as distinct) — the app guarantees at most one null-utr draft per post_id by matching/updating the existing draft instead of inserting a new one.';

commit;
