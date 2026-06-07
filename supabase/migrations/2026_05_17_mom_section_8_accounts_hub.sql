-- MOM §8 — Accounts Hub: 3-state payment machine + payable-cycle + advice email tracking.
-- Founder overrides applied:
--   default = 30 days post posting (PAYMENT_DUE_DAYS script prop)
--   separate "Estimated Payable Date" col reflecting org's 15th/30th cycle
--   payment_advice_sent flag prevents double-send
--   deliverable_post_id links payment row to a specific deliverable
--   ad_partnership_valid on posts table gates Done transition for ads_usage_rights=Yes
-- Idempotent.

-- payments table additions ---------------------------------------------------
alter table public.payments
  add column if not exists status                 text default 'Not Due',
  add column if not exists due_date               date,
  add column if not exists estimated_payable_date date,
  add column if not exists payment_advice_sent    boolean default false,
  add column if not exists deliverable_post_id    text;

-- Constrain status to the 3 known states. NULL allowed (legacy rows).
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'payments' and constraint_name = 'payments_status_chk'
  ) then
    alter table public.payments
      add constraint payments_status_chk
      check (status is null or status in ('Not Due','Due','Done'));
  end if;
end$$;

-- FK from deliverable_post_id → posts.post_id (loose ref, no CASCADE).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'payments' and constraint_name = 'payments_deliverable_post_id_fkey'
  ) then
    -- Skip FK if posts.post_id isn't unique (it is, but be defensive)
    if exists (
      select 1 from information_schema.table_constraints
      where table_name = 'posts' and constraint_type = 'PRIMARY KEY'
    ) or exists (
      select 1 from pg_indexes where tablename = 'posts' and indexdef ilike '%unique%post_id%'
    ) then
      alter table public.payments
        add constraint payments_deliverable_post_id_fkey
        foreign key (deliverable_post_id) references public.posts(post_id) on delete set null;
    end if;
  end if;
end$$;

-- Index for the daily state-recompute cron sweep.
create index if not exists payments_status_due_idx
  on public.payments(status, due_date)
  where status <> 'Done';

-- Backfill legacy rows: anything with a UTR → Done; rest → Due.
update public.payments
  set status = case
    when status is not null then status
    when utr is not null and trim(utr) <> '' then 'Done'
    else 'Due'
  end
  where status is null;

-- posts table addition -------------------------------------------------------
alter table public.posts
  add column if not exists ad_partnership_valid boolean default false;

-- Backfill: posts with non-empty partnership_id → ad_partnership_valid = true.
update public.posts
  set ad_partnership_valid = true
  where ad_partnership_valid = false
    and partnership_id is not null
    and trim(partnership_id) <> '';
