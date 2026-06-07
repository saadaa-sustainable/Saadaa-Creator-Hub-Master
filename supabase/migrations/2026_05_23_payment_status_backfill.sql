-- Backfill: posts.payment_status was previously written as 'Pending' on
-- onboarding submit (pre-Accounts-Hub), which sits outside the PaymentStatus
-- enum ('Not Due' | 'Due' | 'Done') used by Accounts Hub KPIs.
-- Posts that never got a payment row should be NULL until they're Posted.

update public.posts
  set payment_status = null
  where payment_status = 'Pending';

-- Posts in Posted/Delivered without a draft payment row are still expected;
-- the next 3hr cron pass will not heal them, only future submitPosting calls
-- will. Optional one-shot draft init for legacy rows (idempotent vs payments):
do $$
declare
  r record;
  due_date_val date;
  est_payable_val date;
begin
  for r in
    select p.post_id, p.commercial_amount, p.post_date, p.deliverable_index
    from public.posts p
    where p.workflow_status in ('Posted','Delivered')
      and (p.deliverable_index is null or p.deliverable_index = 1)
      and not exists (
        select 1 from public.payments pay where pay.post_id = p.post_id
      )
  loop
    due_date_val := coalesce(r.post_date, current_date) + interval '30 days';
    -- Inline next-cycle calc (15th / 30th).
    if extract(day from due_date_val) <= 15 then
      est_payable_val := make_date(extract(year from due_date_val)::int,
                                    extract(month from due_date_val)::int,
                                    15);
    elsif extract(day from due_date_val) <= 30 then
      est_payable_val := least(
        make_date(extract(year from due_date_val)::int,
                   extract(month from due_date_val)::int,
                   30),
        (date_trunc('month', due_date_val) + interval '1 month - 1 day')::date
      );
    else
      est_payable_val := make_date(extract(year from due_date_val + interval '1 month')::int,
                                    extract(month from due_date_val + interval '1 month')::int,
                                    15);
    end if;

    insert into public.payments
      (post_id, deliverable_post_id, amount, status, due_date, estimated_payable_date, payment_advice_sent)
    values
      (r.post_id, r.post_id, coalesce(r.commercial_amount, 0), 'Not Due',
       due_date_val::date, est_payable_val, false);
  end loop;
end$$;

-- Bring posts.payment_status in line with the new payment rows.
update public.posts
  set payment_status = 'Not Due'
  where workflow_status in ('Posted','Delivered')
    and payment_status is null
    and exists (
      select 1 from public.payments pay
      where pay.post_id = posts.post_id and pay.status = 'Not Due'
    );
