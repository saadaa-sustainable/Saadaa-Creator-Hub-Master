-- Payment eligibility: honor the recorded approval timestamp.
--
-- The payment gate previously required the CURRENT partnership_status to equal
-- 'approved'. A creator who genuinely accepted (partnership_approved_at stamped)
-- but whose status later went blank/unknown would be wrongly blocked. New rule,
-- matching lib/payment-eligibility.ts `creatorAcceptedPartnership`:
--
--   accepted = NOT (pending | rejected | revoked)  AND
--              ( currently 'approved'  OR  partnership_approved_at IS NOT NULL )
--
-- A since-revoked/rejected/pending creator never counts, even with a stale
-- approval timestamp. Admin override + bare key-presence are still not accepted.
--
-- Patched in place: we read each live function definition, swap ONLY the
-- eligibility predicate, and re-execute. The position() guard aborts (rolling
-- back) if the expected predicate is not found, so this can never silently
-- half-apply. `pg_get_functiondef` preserves SECURITY INVOKER + search_path.

do $mig$
declare
  d text;
  old_pred constant text :=
    'lower(btrim(coalesce(post_row.partnership_status, ''''))) = ''approved''';
  new_pred constant text :=
    'lower(btrim(coalesce(post_row.partnership_status, ''''))) not like ''%pending%'''
    || ' and lower(btrim(coalesce(post_row.partnership_status, ''''))) not like ''%reject%'''
    || ' and lower(btrim(coalesce(post_row.partnership_status, ''''))) not like ''%declin%'''
    || ' and lower(btrim(coalesce(post_row.partnership_status, ''''))) not like ''%cancel%'''
    || ' and lower(btrim(coalesce(post_row.partnership_status, ''''))) not like ''%revok%'''
    || ' and (lower(btrim(coalesce(post_row.partnership_status, ''''))) like ''%approv%'''
    || ' or post_row.partnership_approved_at is not null)';
begin
  -- reconcile_creator_payment_eligibility(text, text)
  d := pg_get_functiondef(
    'public.reconcile_creator_payment_eligibility(text,text)'::regprocedure
  );
  if position(old_pred in d) = 0 then
    raise exception 'reconcile: eligibility predicate not found — aborting';
  end if;
  execute replace(d, old_pred, new_pred);

  -- record_eligible_collab_payment(...)
  d := pg_get_functiondef('public.record_eligible_collab_payment'::regproc);
  if position(old_pred in d) = 0 then
    raise exception 'record: eligibility predicate not found — aborting';
  end if;
  execute replace(d, old_pred, new_pred);
end
$mig$;
