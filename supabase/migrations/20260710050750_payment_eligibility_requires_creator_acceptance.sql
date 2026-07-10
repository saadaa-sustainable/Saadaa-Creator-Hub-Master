-- Payment Pending is a collab-level state, never a posting-stage default.
-- Version matches the migration applied to the production Supabase project.
-- A collab becomes payable only after every deliverable has a completed
-- posting form and the creator has accepted the partnership. Admin overrides
-- intentionally do not satisfy this payment rule.

begin;

create temporary table payment_eligibility_cleanup on commit drop as
select
  coalesce(
    nullif(p.collab_id, ''),
    p.inf_id || '-C' || coalesce(p.collab_number, 1)::text
  ) as collab_key,
  bool_and(
    p.workflow_status in ('Posted', 'Delivered')
    and p.post_id is not null
    and coalesce(btrim(p.post_link), '') <> ''
    and p.post_date is not null
    and lower(btrim(coalesce(p.partnership_status, ''))) = 'approved'
  ) as is_payment_eligible
from public.posts p
where p.collab_id is not null or p.collab_number is not null
group by 1;

-- Remove only empty draft rows. Installments/settled rows with a UTR remain
-- immutable financial history even if the partnership is later revoked.
delete from public.payments pay
using payment_eligibility_cleanup eligibility
where eligibility.is_payment_eligible = false
  and eligibility.collab_key = coalesce(
    nullif(pay.collab_id, ''),
    (
      select coalesce(
        nullif(post_row.collab_id, ''),
        post_row.inf_id || '-C' || coalesce(post_row.collab_number, 1)::text
      )
      from public.posts post_row
      where post_row.post_id = pay.post_id
      limit 1
    )
  )
  and lower(btrim(coalesce(pay.status, ''))) in ('not due', 'due')
  and coalesce(btrim(pay.utr), '') = '';

-- Clear stale mirrors on ineligible collabs.
update public.posts p
set payment_status = null
from payment_eligibility_cleanup eligibility
where eligibility.is_payment_eligible = false
  and eligibility.collab_key = coalesce(
    nullif(p.collab_id, ''),
    p.inf_id || '-C' || coalesce(p.collab_number, 1)::text
  )
  and lower(btrim(coalesce(p.payment_status, ''))) in ('not due', 'due');

-- Also remove legacy pending values from rows that are not collabs at all.
-- This repairs the Reach Out row that produced the false dashboard count.
update public.posts
set payment_status = null
where lower(btrim(coalesce(payment_status, ''))) in ('not due', 'due')
  and (
    post_id is null
    or workflow_status not in ('Posted', 'Delivered')
    or (collab_id is null and collab_number is null)
  );

commit;
