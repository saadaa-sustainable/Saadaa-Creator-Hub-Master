-- Transactional payment guards.
-- Version matches the migration applied to the production Supabase project.
--
-- Payment is a collab-level operation. These functions serialize every write
-- for one collab, re-check all deliverables at write time, and keep financial
-- history immutable. They are exposed only to the server-side service role.

begin;

-- Empty drafts carry no money. Remove legacy non-collab drafts and collapse
-- duplicate NULL-UTR drafts before adding the database invariant.
delete from public.payments pay
where nullif(btrim(coalesce(pay.utr, '')), '') is null
  and lower(btrim(coalesce(pay.status, ''))) in ('not due', 'due')
  and not exists (
    select 1
    from public.posts post_row
    where post_row.post_id = pay.post_id
      and (post_row.collab_id is not null or post_row.collab_number is not null)
  );

delete from public.payments pay
using (
  select post_id, max(id) as keep_id
  from public.payments
  where utr is null
    and post_id is not null
  group by post_id
  having count(*) > 1
) duplicates
where pay.post_id = duplicates.post_id
  and pay.utr is null
  and pay.id <> duplicates.keep_id;

create unique index if not exists payments_one_null_utr_row_per_post_idx
  on public.payments (post_id)
  where utr is null and post_id is not null;

comment on index public.payments_one_null_utr_row_per_post_idx is
  'At most one non-financial NULL-UTR draft/rollup row per representative post. UTR-bearing installment history is unaffected.';

-- Reconcile all collabs for one creator whenever posting or partnership state
-- changes. Approval can create a draft; pending/rejected/revoked removes only
-- empty open drafts and mirrors. Partial/Done and all UTR-bearing rows remain.
create or replace function public.reconcile_creator_payment_eligibility(
  p_inf_id text,
  p_username text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_collab_key text;
  v_representative_post_id text;
  v_eligible boolean;
  v_total numeric;
  v_latest_post_date date;
  v_due_date date;
  v_estimated_payable_date date;
  v_inf_id text;
  v_username text;
  v_collab_number integer;
  v_deliverable_index integer;
  v_bank_name text;
  v_bank_number text;
  v_ifsc text;
  v_has_financial_history boolean;
  v_created integer := 0;
begin
  if nullif(btrim(coalesce(p_inf_id, '')), '') is null
     and nullif(btrim(coalesce(p_username, '')), '') is null then
    return 0;
  end if;

  for v_collab_key in
    select distinct coalesce(
      nullif(post_row.collab_id, ''),
      post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
    )
    from public.posts post_row
    where (
      (nullif(btrim(coalesce(p_inf_id, '')), '') is not null and post_row.inf_id = p_inf_id)
      or (
        nullif(btrim(coalesce(p_inf_id, '')), '') is null
        and lower(btrim(coalesce(post_row.username, ''))) = lower(btrim(p_username))
      )
    )
      and (post_row.collab_id is not null or post_row.collab_number is not null)
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_collab_key, 0)
    );

    select
      min(post_row.post_id),
      bool_and(
        post_row.workflow_status in ('Posted', 'Delivered')
        and coalesce(btrim(post_row.post_link), '') <> ''
        and post_row.post_date is not null
        and lower(btrim(coalesce(post_row.partnership_status, ''))) = 'approved'
      ),
      coalesce(sum(post_row.commercial_amount), 0),
      max(post_row.post_date)
    into
      v_representative_post_id,
      v_eligible,
      v_total,
      v_latest_post_date
    from public.posts post_row
    where coalesce(
      nullif(post_row.collab_id, ''),
      post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
    ) = v_collab_key;

    if v_representative_post_id is null then
      continue;
    end if;

    select
      post_row.inf_id,
      post_row.username,
      post_row.collab_number,
      post_row.deliverable_index,
      post_row.bank_name,
      post_row.bank_number,
      post_row.ifsc
    into
      v_inf_id,
      v_username,
      v_collab_number,
      v_deliverable_index,
      v_bank_name,
      v_bank_number,
      v_ifsc
    from public.posts post_row
    where post_row.post_id = v_representative_post_id;

    select exists (
      select 1
      from public.payments pay
      where (
        pay.collab_id = v_collab_key
        or pay.post_id in (
          select post_row.post_id
          from public.posts post_row
          where coalesce(
            nullif(post_row.collab_id, ''),
            post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
          ) = v_collab_key
        )
      )
        and (
          nullif(btrim(coalesce(pay.utr, '')), '') is not null
          or lower(btrim(coalesce(pay.status, ''))) in ('partial', 'done', 'paid')
        )
    ) into v_has_financial_history;

    if coalesce(v_eligible, false) then
      if not exists (
        select 1
        from public.payments pay
        where pay.collab_id = v_collab_key
           or pay.post_id in (
             select post_row.post_id
             from public.posts post_row
             where coalesce(
               nullif(post_row.collab_id, ''),
               post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
             ) = v_collab_key
           )
      ) then
        v_due_date := v_latest_post_date + 30;
        v_estimated_payable_date := case
          when extract(day from v_due_date) <= 15
            then (date_trunc('month', v_due_date)::date + 14)
          when extract(day from v_due_date) <= 30
            then least(
              date_trunc('month', v_due_date)::date + 29,
              (date_trunc('month', v_due_date) + interval '1 month - 1 day')::date
            )
          else
            (date_trunc('month', v_due_date) + interval '1 month + 14 days')::date
        end;

        begin
          insert into public.payments (
            post_id,
            deliverable_post_id,
            collab_id,
            inf_id,
            username,
            collab_number,
            deliverable_index,
            amount,
            bank_name,
            bank_number,
            ifsc,
            status,
            due_date,
            estimated_payable_date,
            payment_advice_sent
          ) values (
            v_representative_post_id,
            v_representative_post_id,
            v_collab_key,
            v_inf_id,
            v_username,
            v_collab_number,
            v_deliverable_index,
            v_total,
            v_bank_name,
            v_bank_number,
            v_ifsc,
            'Not Due',
            v_due_date,
            v_estimated_payable_date,
            false
          );
          v_created := v_created + 1;
        exception
          when unique_violation then
            null;
        end;

        update public.posts post_row
        set payment_status = 'Not Due'
        where coalesce(
          nullif(post_row.collab_id, ''),
          post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
        ) = v_collab_key;
      end if;
    elsif not v_has_financial_history then
      delete from public.payments pay
      where (
        pay.collab_id = v_collab_key
        or pay.post_id in (
          select post_row.post_id
          from public.posts post_row
          where coalesce(
            nullif(post_row.collab_id, ''),
            post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
          ) = v_collab_key
        )
      )
        and nullif(btrim(coalesce(pay.utr, '')), '') is null
        and lower(btrim(coalesce(pay.status, ''))) in ('not due', 'due');

      update public.posts post_row
      set
        payment_status = null,
        utr = null,
        payment_date = null
      where coalesce(
        nullif(post_row.collab_id, ''),
        post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
      ) = v_collab_key
        and lower(btrim(coalesce(post_row.payment_status, ''))) in ('not due', 'due');
    end if;
  end loop;

  return v_created;
end;
$$;

-- Atomically record a draft or installment. A submitted child Post ID is
-- resolved to the representative (lowest Post ID), then every deliverable is
-- revalidated inside the same locked transaction before any payment write.
create or replace function public.record_eligible_collab_payment(
  p_post_id text,
  p_utr text,
  p_amount numeric,
  p_payment_date date,
  p_due_date date,
  p_estimated_payable_date date,
  p_bank_name text,
  p_bank_number text,
  p_ifsc text,
  p_posted_but_not_tested boolean
)
returns table (
  payment_id bigint,
  representative_post_id text,
  collab_status text,
  paid_total numeric,
  collab_total numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target record;
  v_collab_key text;
  v_representative_post_id text;
  v_eligible boolean;
  v_collab_total numeric;
  v_paid_total numeric;
  v_new_paid_total numeric;
  v_status text;
  v_payment_id bigint;
  v_existing_draft_id bigint;
  v_utr text;
  v_rep record;
begin
  select
    post_row.post_id,
    post_row.inf_id,
    post_row.collab_id,
    post_row.collab_number
  into v_target
  from public.posts post_row
  where post_row.post_id = p_post_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Payment post was not found';
  end if;
  if v_target.collab_id is null and v_target.collab_number is null then
    raise exception using errcode = 'P0001', message = 'Payment requires a real Collab ID';
  end if;

  v_collab_key := coalesce(
    nullif(v_target.collab_id, ''),
    v_target.inf_id || '-C' || coalesce(v_target.collab_number, 1)::text
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_collab_key, 0)
  );

  select
    min(post_row.post_id),
    bool_and(
      post_row.workflow_status in ('Posted', 'Delivered')
      and coalesce(btrim(post_row.post_link), '') <> ''
      and post_row.post_date is not null
      and lower(btrim(coalesce(post_row.partnership_status, ''))) = 'approved'
    ),
    coalesce(sum(post_row.commercial_amount), 0)
  into
    v_representative_post_id,
    v_eligible,
    v_collab_total
  from public.posts post_row
  where coalesce(
    nullif(post_row.collab_id, ''),
    post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
  ) = v_collab_key;

  if v_representative_post_id is null or not coalesce(v_eligible, false) then
    raise exception using errcode = 'P0001', message = 'Collab is not payment eligible';
  end if;

  select
    post_row.inf_id,
    post_row.username,
    post_row.collab_number,
    post_row.deliverable_index,
    post_row.bank_name,
    post_row.bank_number,
    post_row.ifsc
  into v_rep
  from public.posts post_row
  where post_row.post_id = v_representative_post_id;

  v_utr := nullif(btrim(coalesce(p_utr, '')), '');

  select coalesce(sum(pay.amount), 0)
  into v_paid_total
  from public.payments pay
  where (
    pay.collab_id = v_collab_key
    or pay.post_id in (
      select post_row.post_id
      from public.posts post_row
      where coalesce(
        nullif(post_row.collab_id, ''),
        post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
      ) = v_collab_key
    )
  )
    and nullif(btrim(coalesce(pay.utr, '')), '') is not null;

  if v_utr is not null then
    if p_amount is null or p_amount <= 0 then
      raise exception using errcode = 'P0001', message = 'Installment amount must be greater than zero';
    end if;
    if exists (
      select 1
      from public.payments pay
      where (
        pay.collab_id = v_collab_key
        or pay.post_id in (
          select post_row.post_id
          from public.posts post_row
          where coalesce(
            nullif(post_row.collab_id, ''),
            post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
          ) = v_collab_key
        )
      )
        and lower(btrim(coalesce(pay.utr, ''))) = lower(v_utr)
    ) then
      raise exception using errcode = '23505', message = 'Duplicate payment UTR for this collab';
    end if;
    if v_collab_total > 0 and v_paid_total + 0.0001 >= v_collab_total then
      raise exception using errcode = 'P0001', message = 'Collab is already fully paid';
    end if;

    v_new_paid_total := v_paid_total + p_amount;
    v_status := case
      when v_collab_total > 0 and v_new_paid_total + 0.0001 >= v_collab_total then 'Done'
      else 'Partial'
    end;

    insert into public.payments (
      post_id,
      deliverable_post_id,
      inf_id,
      username,
      utr,
      amount,
      payment_date,
      status,
      due_date,
      estimated_payable_date,
      payment_advice_sent,
      bank_name,
      bank_number,
      ifsc,
      collab_id,
      collab_number,
      deliverable_index,
      posted_but_not_tested
    ) values (
      v_representative_post_id,
      v_representative_post_id,
      v_rep.inf_id,
      v_rep.username,
      v_utr,
      p_amount,
      p_payment_date,
      v_status,
      p_due_date,
      p_estimated_payable_date,
      false,
      coalesce(nullif(btrim(coalesce(p_bank_name, '')), ''), v_rep.bank_name),
      coalesce(nullif(btrim(coalesce(p_bank_number, '')), ''), v_rep.bank_number),
      coalesce(nullif(btrim(coalesce(p_ifsc, '')), ''), v_rep.ifsc),
      v_collab_key,
      v_rep.collab_number,
      v_rep.deliverable_index,
      coalesce(p_posted_but_not_tested, false)
    )
    returning id into v_payment_id;

    update public.payments pay
    set status = v_status
    where (
      pay.collab_id = v_collab_key
      or pay.post_id in (
        select post_row.post_id
        from public.posts post_row
        where coalesce(
          nullif(post_row.collab_id, ''),
          post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
        ) = v_collab_key
      )
    )
      and nullif(btrim(coalesce(pay.utr, '')), '') is null;

    update public.posts post_row
    set
      payment_status = v_status,
      utr = v_utr,
      payment_date = p_payment_date
    where coalesce(
      nullif(post_row.collab_id, ''),
      post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
    ) = v_collab_key;
  else
    if v_paid_total > 0 then
      raise exception using errcode = 'P0001', message = 'A payment draft cannot replace installment history';
    end if;

    select pay.id
    into v_existing_draft_id
    from public.payments pay
    where (
      pay.collab_id = v_collab_key
      or pay.post_id in (
        select post_row.post_id
        from public.posts post_row
        where coalesce(
          nullif(post_row.collab_id, ''),
          post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
        ) = v_collab_key
      )
    )
      and nullif(btrim(coalesce(pay.utr, '')), '') is null
    order by (pay.post_id = v_representative_post_id) desc, pay.id desc
    limit 1
    for update;

    if v_existing_draft_id is null then
      insert into public.payments (
        post_id,
        deliverable_post_id,
        inf_id,
        username,
        utr,
        amount,
        payment_date,
        status,
        due_date,
        estimated_payable_date,
        payment_advice_sent,
        bank_name,
        bank_number,
        ifsc,
        collab_id,
        collab_number,
        deliverable_index,
        posted_but_not_tested
      ) values (
        v_representative_post_id,
        v_representative_post_id,
        v_rep.inf_id,
        v_rep.username,
        null,
        p_amount,
        p_payment_date,
        'Due',
        p_due_date,
        p_estimated_payable_date,
        false,
        coalesce(nullif(btrim(coalesce(p_bank_name, '')), ''), v_rep.bank_name),
        coalesce(nullif(btrim(coalesce(p_bank_number, '')), ''), v_rep.bank_number),
        coalesce(nullif(btrim(coalesce(p_ifsc, '')), ''), v_rep.ifsc),
        v_collab_key,
        v_rep.collab_number,
        v_rep.deliverable_index,
        coalesce(p_posted_but_not_tested, false)
      )
      returning id into v_payment_id;
    else
      delete from public.payments pay
      where (
        pay.collab_id = v_collab_key
        or pay.post_id in (
          select post_row.post_id
          from public.posts post_row
          where coalesce(
            nullif(post_row.collab_id, ''),
            post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
          ) = v_collab_key
        )
      )
        and nullif(btrim(coalesce(pay.utr, '')), '') is null
        and pay.id <> v_existing_draft_id;

      update public.payments pay
      set
        post_id = v_representative_post_id,
        deliverable_post_id = v_representative_post_id,
        inf_id = v_rep.inf_id,
        username = v_rep.username,
        amount = p_amount,
        payment_date = p_payment_date,
        status = 'Due',
        due_date = p_due_date,
        estimated_payable_date = p_estimated_payable_date,
        payment_advice_sent = false,
        bank_name = coalesce(nullif(btrim(coalesce(p_bank_name, '')), ''), v_rep.bank_name),
        bank_number = coalesce(nullif(btrim(coalesce(p_bank_number, '')), ''), v_rep.bank_number),
        ifsc = coalesce(nullif(btrim(coalesce(p_ifsc, '')), ''), v_rep.ifsc),
        collab_id = v_collab_key,
        collab_number = v_rep.collab_number,
        deliverable_index = v_rep.deliverable_index,
        posted_but_not_tested = coalesce(p_posted_but_not_tested, false)
      where pay.id = v_existing_draft_id;
      v_payment_id := v_existing_draft_id;
    end if;

    v_status := 'Due';
    v_new_paid_total := 0;
    update public.posts post_row
    set payment_status = 'Due'
    where coalesce(
      nullif(post_row.collab_id, ''),
      post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
    ) = v_collab_key;
  end if;

  return query
  select
    v_payment_id,
    v_representative_post_id,
    v_status,
    v_new_paid_total,
    v_collab_total;
end;
$$;

revoke execute on function public.reconcile_creator_payment_eligibility(text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_creator_payment_eligibility(text, text)
  to service_role;

revoke execute on function public.record_eligible_collab_payment(
  text, text, numeric, date, date, date, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.record_eligible_collab_payment(
  text, text, numeric, date, date, date, text, text, text, boolean
) to service_role;

commit;
