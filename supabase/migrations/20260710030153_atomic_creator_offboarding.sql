-- Re-check eligibility, capture evidence, blacklist the creator, and fire the
-- audit trigger in one transaction. Locking the creator and qualifying posts
-- closes the race between a posting submit and an offboarding confirmation.

create or replace function public.offboard_creator_if_eligible(
  p_inf_id text,
  p_reason text,
  p_actor_email text
)
returns table (creator_username text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_username text;
  v_evidence jsonb;
  v_blacklisted_at timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
begin
  if nullif(btrim(p_inf_id), '') is null then
    raise exception 'Creator ID is required';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'Offboarding reason must be between 10 and 1000 characters';
  end if;
  if nullif(btrim(p_actor_email), '') is null then
    raise exception 'Actor email is required';
  end if;

  select c.username
    into v_username
  from public.creators c
  where c.inf_id = p_inf_id
    and c.is_blacklisted = false
  for update;

  if not found then
    return;
  end if;

  perform p.id
  from public.posts p
  where p.inf_id = p_inf_id
    and p.workflow_status in ('On Board', 'Order Sent')
    and p.est_delivery < v_today
  for update;

  if not found then
    return;
  end if;

  select jsonb_build_object(
    'rule', 'estimated_delivery_crossed_and_posting_form_not_submitted',
    'capturedAt', v_blacklisted_at,
    'overdueDeliverables', count(*),
    'overdueCollabs', count(distinct coalesce(p.collab_id, p.post_id, p.id::text)),
    'oldestDeadline', min(p.est_delivery),
    'campaigns', coalesce(
      to_jsonb(array_agg(distinct p.campaign_id order by p.campaign_id)
        filter (where nullif(btrim(p.campaign_id), '') is not null)),
      '[]'::jsonb
    ),
    'postIds', coalesce(
      to_jsonb(array_agg(distinct p.post_id order by p.post_id)
        filter (where nullif(btrim(p.post_id), '') is not null)),
      '[]'::jsonb
    ),
    'teamMembers', coalesce(
      to_jsonb(array_agg(
        distinct coalesce(p.onboarded_by, p.logged_by)
        order by coalesce(p.onboarded_by, p.logged_by)
      ) filter (
        where nullif(btrim(coalesce(p.onboarded_by, p.logged_by)), '') is not null
      )),
      '[]'::jsonb
    )
  )
    into v_evidence
  from public.posts p
  where p.inf_id = p_inf_id
    and p.workflow_status in ('On Board', 'Order Sent')
    and p.est_delivery < v_today;

  update public.creators
  set is_blacklisted = true,
      blacklist_reason = btrim(p_reason),
      blacklisted_at = v_blacklisted_at,
      blacklisted_by = btrim(p_actor_email),
      blacklist_evidence = v_evidence
  where inf_id = p_inf_id
    and is_blacklisted = false;

  if not found then
    return;
  end if;

  return query select v_username;
end;
$$;

revoke all on function public.offboard_creator_if_eligible(text, text, text)
  from public, anon, authenticated;
grant execute on function public.offboard_creator_if_eligible(text, text, text)
  to service_role;
