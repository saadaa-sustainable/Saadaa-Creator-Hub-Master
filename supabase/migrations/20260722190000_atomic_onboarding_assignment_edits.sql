-- Apply Reach Out / onboarding edit approvals and their audit row in one
-- transaction. Also enforce the campaign onboarding cap at the database edge
-- so normal onboarding and approved campaign moves cannot race past it.

alter table public.onboarding_edit_requests enable row level security;
revoke all on table public.onboarding_edit_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.onboarding_edit_requests to service_role;
grant usage, select on sequence public.onboarding_edit_requests_id_seq to service_role;

create or replace function public.enforce_campaign_onboarding_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_used integer;
  v_username text := lower(trim(coalesce(new.username, '')));
begin
  if new.campaign_id is null
     or new.workflow_status not in ('On Board', 'Order Sent', 'Posted', 'Delivered') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.campaign_id is not distinct from new.campaign_id
     and old.workflow_status in ('On Board', 'Order Sent', 'Posted', 'Delivered')
     and lower(trim(coalesce(old.username, ''))) = v_username then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('campaign-onboard-cap:' || new.campaign_id));

  select coalesce(sum(coalesce(num_influencers, 0)), 0)::integer
    into v_cap
    from public.campaign_budget
   where campaign_id = new.campaign_id;
  if v_cap <= 0 then return new; end if;

  if exists (
    select 1 from public.posts p
     where p.id <> new.id
       and p.campaign_id = new.campaign_id
       and lower(trim(coalesce(p.username, ''))) = v_username
       and p.workflow_status in ('On Board', 'Order Sent', 'Posted', 'Delivered')
  ) then
    return new;
  end if;

  select count(distinct lower(trim(p.username)))::integer
    into v_used
    from public.posts p
   where p.id <> new.id
     and p.campaign_id = new.campaign_id
     and p.workflow_status in ('On Board', 'Order Sent', 'Posted', 'Delivered')
     and nullif(trim(p.username), '') is not null;

  if v_used >= v_cap then
    raise exception 'Campaign % is at its onboarding cap (%/%). Raise its allocation or free a slot first.',
      new.campaign_id, v_used, v_cap;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_campaign_onboarding_cap on public.posts;
create trigger posts_campaign_onboarding_cap
before insert or update of campaign_id, workflow_status, username on public.posts
for each row execute function public.enforce_campaign_onboarding_cap();

create or replace function public.decide_onboarding_edit_request(
  p_request_id bigint,
  p_decision text,
  p_admin_email text default null,
  p_admin_name text default null,
  p_note text default null,
  p_derived_before jsonb default '{}'::jsonb,
  p_derived_after jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.onboarding_edit_requests%rowtype;
  v_seed public.posts%rowtype;
  v_ids bigint[];
  v_key text;
  v_kind text;
  v_before jsonb;
  v_after jsonb;
  v_campaign text;
  v_content text;
  v_old_campaign text;
  v_old_content text;
  v_username text;
  v_brief text;
  v_cap integer;
  v_used integer;
  v_count integer;
  v_split numeric;
  v_field text;
  v_live_commercial numeric;
begin
  if lower(trim(p_decision)) not in ('approve', 'reject') then
    raise exception 'Invalid approval decision.';
  end if;

  select * into v_req
    from public.onboarding_edit_requests
   where id = p_request_id
   for update;
  if not found or v_req.status <> 'Pending Approval' then
    raise exception 'Request not found or already decided.';
  end if;

  v_key := v_req.collab_id;
  v_kind := case when v_key like 'reachout:%' then 'reachout' else 'onboarding' end;
  v_before := coalesce(v_req.before, '{}'::jsonb) || coalesce(p_derived_before, '{}'::jsonb);
  v_after := coalesce(v_req.after, '{}'::jsonb) || coalesce(p_derived_after, '{}'::jsonb);

  if lower(trim(p_decision)) = 'reject' then
    update public.onboarding_edit_requests
       set status = 'Rejected', decided_by = p_admin_email,
           decided_by_name = p_admin_name, decided_at = now(),
           before = v_before, after = v_after
     where id = p_request_id;
    insert into public.approval_logs
      (action_type, action, entity_id, version_id, admin_email, admin_name, notes)
    values
      (case when v_kind = 'reachout' then 'reachout_edit' else 'onboarding_edit' end,
       'Rejected', v_key, p_request_id::text, p_admin_email, p_admin_name,
       coalesce(nullif(trim(p_note), ''), v_req.reason));
    return jsonb_build_object('ok', true, 'decision', 'reject');
  end if;

  if v_kind = 'reachout' then
    select * into v_seed from public.posts
     where id = substring(v_key from 10)::bigint for update;
    if not found then raise exception 'The Reach Out row no longer exists.'; end if;
    v_ids := array[v_seed.id];
    if v_seed.workflow_status <> 'Reach Out' then
      raise exception 'This Reach Out has already been onboarded.';
    end if;
  elsif v_key like 'legacy:%' then
    select * into v_seed from public.posts
     where id = substring(v_key from 8)::bigint for update;
    if not found then raise exception 'The onboarding row no longer exists.'; end if;
    if v_seed.inf_id is not null and v_seed.collab_number is not null then
      perform 1 from public.posts
       where collab_id is null and inf_id = v_seed.inf_id
         and collab_number = v_seed.collab_number for update;
      select array_agg(id order by id) into v_ids from public.posts
       where collab_id is null and inf_id = v_seed.inf_id
         and collab_number = v_seed.collab_number;
    else
      v_ids := array[v_seed.id];
    end if;
  else
    perform 1 from public.posts where collab_id = v_key for update;
    select array_agg(id order by id) into v_ids
      from public.posts where collab_id = v_key;
    if v_ids is null then raise exception 'The onboarding collab no longer exists.'; end if;
    select * into v_seed from public.posts where id = v_ids[1];
  end if;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then raise exception 'The edit target no longer exists.'; end if;

  -- Reject stale approvals instead of overwriting a record changed after the
  -- request was submitted. The request snapshots collab-level values, so the
  -- locked representative is authoritative for scalars and siblings are
  -- summed for commercials.
  foreach v_field in array array[
    'campaign_id', 'content_type', 'order_id', 'collab_type',
    'ads_usage_rights', 'est_delivery', 'bank_name', 'bank_number', 'ifsc',
    'email', 'tracking_id', 'garments_sent', 'order_status', 'state', 'city'
  ] loop
    if v_before ? v_field
       and coalesce(to_jsonb(v_seed)->>v_field, '') <> coalesce(v_before->>v_field, '') then
      raise exception 'This record changed after the edit request. Reject it and submit a fresh edit.';
    end if;
  end loop;
  if v_before ? 'commercial_amount' then
    select coalesce(sum(coalesce(commercial_amount, 0)), 0)
      into v_live_commercial from public.posts where id = any(v_ids);
    if abs(v_live_commercial - coalesce(nullif(v_before->>'commercial_amount', '')::numeric, 0)) >= 0.01 then
      raise exception 'This record changed after the edit request. Reject it and submit a fresh edit.';
    end if;
  end if;

  v_username := lower(trim(coalesce(v_seed.username, '')));
  if v_username = '' then raise exception 'Creator identity could not be verified.'; end if;
  perform pg_advisory_xact_lock(hashtext('reachout-user:' || v_username));

  if exists (
    select 1 from public.creators c
     where lower(trim(c.username)) = v_username and c.is_blacklisted = true
  ) then
    raise exception 'This creator is offboarded and cannot be reassigned.';
  end if;

  v_old_campaign := coalesce(nullif(v_before->>'campaign_id', ''), v_seed.campaign_id);
  v_old_content := coalesce(nullif(v_before->>'content_type', ''), v_seed.content_type);
  v_campaign := coalesce(nullif(v_after->>'campaign_id', ''), v_old_campaign);
  v_content := coalesce(nullif(v_after->>'content_type', ''), v_old_content);
  if v_campaign is null then raise exception 'Campaign is required.'; end if;
  if v_content is null then raise exception 'Content type is required.'; end if;
  if v_content is distinct from v_old_content
     and v_content <> all(array['UGC','VRP','OFF','BST','EDU','PRC','TBG','MAR','OST','FOU']) then
    raise exception 'The requested content type is no longer valid.';
  end if;

  if v_campaign is distinct from v_old_campaign then
    select brief_link into v_brief from public.campaigns
     where campaign_id = v_campaign and lower(status) = 'active';
    if not found then
      raise exception 'Campaign % is not an approved active campaign.', v_campaign;
    end if;

    if exists (
      select 1 from public.posts p
       where lower(trim(coalesce(p.username, ''))) = v_username
         and not (p.id = any(v_ids))
         and coalesce(p.workflow_status, '') not in ('Cancelled', 'Offboarded', 'Offboarding')
         and p.campaign_id = v_campaign
    ) then
      raise exception 'This creator is already in campaign %.', v_campaign;
    end if;
    if exists (
      select 1 from public.posts p
       where lower(trim(coalesce(p.username, ''))) = v_username
         and not (p.id = any(v_ids))
         and coalesce(p.workflow_status, '') not in ('Cancelled', 'Offboarded', 'Offboarding')
         and p.reach_out_date >= timezone('Asia/Kolkata', now())::date - 30
    ) then
      raise exception 'This creator was reached out in the last 30 days.';
    end if;

    if v_kind = 'onboarding' then
      select coalesce(sum(coalesce(num_influencers, 0)), 0)::integer
        into v_cap from public.campaign_budget where campaign_id = v_campaign;
      if v_cap > 0 then
        select count(distinct lower(trim(p.username)))::integer
          into v_used from public.posts p
         where p.campaign_id = v_campaign
           and p.workflow_status in ('On Board', 'Order Sent', 'Posted', 'Delivered')
           and not (p.id = any(v_ids))
           and nullif(trim(p.username), '') is not null;
        if v_used >= v_cap then
          raise exception 'Campaign % is at its onboarding cap (%/%). Raise its allocation or free a slot first.',
            v_campaign, v_used, v_cap;
        end if;
      end if;
    end if;
  end if;

  if v_kind = 'reachout' then
    update public.posts set
      campaign_id = v_campaign,
      content_type = v_content,
      creator_brief_link = case when v_campaign is distinct from v_old_campaign then v_brief else creator_brief_link end,
      updated_at = now()
    where id = any(v_ids);
  else
    v_split := coalesce(nullif(v_after->>'commercial_amount', '')::numeric, 0) / v_count;
    update public.posts p set
      campaign_id = v_campaign,
      content_type = v_content,
      creator_brief_link = case when v_campaign is distinct from v_old_campaign then v_brief else p.creator_brief_link end,
      order_id = nullif(v_after->>'order_id', ''),
      collab_type = nullif(v_after->>'collab_type', ''),
      commercial_amount = v_split,
      ads_usage_rights = nullif(v_after->>'ads_usage_rights', ''),
      est_delivery = nullif(v_after->>'est_delivery', '')::date,
      bank_name = nullif(v_after->>'bank_name', ''),
      bank_number = nullif(v_after->>'bank_number', ''),
      ifsc = nullif(v_after->>'ifsc', ''),
      email = case when v_after ? 'email' then nullif(v_after->>'email', '') else p.email end,
      tracking_id = case when v_after ? 'tracking_id' then nullif(v_after->>'tracking_id', '') else p.tracking_id end,
      garments_sent = case when v_after ? 'garments_sent' then nullif(v_after->>'garments_sent', '') else p.garments_sent end,
      order_status = case when v_after ? 'order_status' then nullif(v_after->>'order_status', '') else p.order_status end,
      state = case when v_after ? 'state' then nullif(v_after->>'state', '') else p.state end,
      city = case when v_after ? 'city' then nullif(v_after->>'city', '') else p.city end,
      nomenclature = case
        when v_content is distinct from v_old_content
          and p.post_id is not null and nullif(trim(p.username), '') is not null
        then p.post_id || '-' || trim(p.username) || '-' || v_content || '-' ||
          coalesce(p.reach_out_date, timezone('Asia/Kolkata', now())::date)::text
        else p.nomenclature
      end,
      updated_at = now()
    where p.id = any(v_ids);
  end if;

  update public.onboarding_edit_requests
     set status = 'Approved', decided_by = p_admin_email,
         decided_by_name = p_admin_name, decided_at = now(),
         before = v_before, after = v_after
   where id = p_request_id;
  insert into public.approval_logs
    (action_type, action, entity_id, version_id, admin_email, admin_name, notes)
  values
    (case when v_kind = 'reachout' then 'reachout_edit' else 'onboarding_edit' end,
     'Approved', v_key, p_request_id::text, p_admin_email, p_admin_name,
     coalesce(nullif(trim(p_note), ''), v_req.reason));

  return jsonb_build_object('ok', true, 'decision', 'approve');
end;
$$;

revoke all on function public.decide_onboarding_edit_request(bigint, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.decide_onboarding_edit_request(bigint, text, text, text, text, jsonb, jsonb)
  to service_role;
