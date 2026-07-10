-- Ledger-level defense against overpayment, including writes outside the app
-- RPC. The trigger shares the same per-collab lock as payment submission.
-- Version matches the migration applied to the production Supabase project.

begin;

create or replace function public.enforce_payment_installment_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_collab_key text;
  v_collab_total numeric;
  v_other_paid numeric;
begin
  if nullif(btrim(coalesce(new.utr, '')), '') is null then
    return new;
  end if;

  v_collab_key := nullif(new.collab_id, '');
  if v_collab_key is null then
    select coalesce(
      nullif(post_row.collab_id, ''),
      post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
    )
    into v_collab_key
    from public.posts post_row
    where post_row.post_id = new.post_id;
  end if;
  if v_collab_key is null then
    raise exception using errcode = 'P0001', message = 'Payment requires a real Collab ID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_collab_key, 0)
  );

  select coalesce(sum(post_row.commercial_amount), 0)
  into v_collab_total
  from public.posts post_row
  where coalesce(
    nullif(post_row.collab_id, ''),
    post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
  ) = v_collab_key;

  if v_collab_total <= 0 then
    raise exception using errcode = 'P0001', message = 'Collab has no payable commercial total';
  end if;

  select coalesce(sum(pay.amount), 0)
  into v_other_paid
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
    and nullif(btrim(coalesce(pay.utr, '')), '') is not null
    and pay.id is distinct from new.id;

  if v_other_paid + coalesce(new.amount, 0) > v_collab_total + 0.0001 then
    raise exception using
      errcode = 'P0001',
      message = 'Payment installment exceeds the outstanding collab balance';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_enforce_installment_total
  on public.payments;

create trigger payments_enforce_installment_total
before insert or update of amount, utr, post_id, collab_id
on public.payments
for each row
execute function public.enforce_payment_installment_total();

revoke execute on function public.enforce_payment_installment_total()
  from public, anon, authenticated;
grant execute on function public.enforce_payment_installment_total()
  to service_role;

commit;
