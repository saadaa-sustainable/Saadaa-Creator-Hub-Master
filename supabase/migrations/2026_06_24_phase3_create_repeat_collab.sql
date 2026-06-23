-- ============================================================================
-- 2026-06-24 — Phase 3: create_repeat_collab RPC
--
-- Creates a NEW collab (C2+) for an EXISTING creator at Onboarding time.
-- Reach Out only ever creates C1 (new creators); repeat collabs for an
-- existing creator are started here. Atomic per-creator counters:
--   collab_number = MAX(collab_number where inf_id)+1  (C2, C3, …)
--   post_number   = MAX(post_number   where inf_id)+1  (P linear per creator)
-- Inserts a 'Reach Out' parent post (the caller's submitRepeatCollab then runs
-- the normal onboarding flow on it). Mirrors submit_reachout's insert columns.
-- ============================================================================

create or replace function public.create_repeat_collab(
  p_inf_id       text,
  p_campaign_id  text,
  p_content_type text
)
returns table (
  post_id        text,
  post_id_short  text,
  post_number    integer,
  collab_number  integer,
  inf_id         text,
  collab_id      text
)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_username      text;
  v_post_number   int;
  v_collab_number int;
  v_post_id       text;
  v_collab_id     text;
  v_brief_link    text;
  v_now           timestamptz := now();
begin
  if p_inf_id is null or p_inf_id = '' then
    raise exception 'create_repeat_collab: p_inf_id required';
  end if;
  if p_campaign_id is null or p_campaign_id = '' then
    raise exception 'create_repeat_collab: p_campaign_id required';
  end if;

  select creators.username into v_username from creators where creators.inf_id = p_inf_id;
  if v_username is null then
    raise exception 'create_repeat_collab: creator % not found', p_inf_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('reachout-inf:' || p_inf_id));

  select coalesce(max(posts.post_number), 0) + 1 into v_post_number
    from posts where posts.inf_id = p_inf_id;
  select coalesce(max(posts.collab_number), 0) + 1 into v_collab_number
    from posts where posts.inf_id = p_inf_id;

  v_post_id   := p_inf_id || '-P' || v_post_number;
  v_collab_id := p_inf_id || '-C' || v_collab_number;

  select campaigns.brief_link into v_brief_link
    from campaigns where campaigns.campaign_id = p_campaign_id;

  insert into posts (
    post_id, post_id_short, post_number, collab_number, collab_id,
    inf_id, username, campaign_id,
    workflow_status, reach_out_date, reachout_direction,
    content_type, reels, static_posts, stories,
    collab_type, commercial_amount,
    creator_brief_link,
    created_at, updated_at
  ) values (
    v_post_id, v_post_id, v_post_number, v_collab_number, v_collab_id,
    p_inf_id, v_username, p_campaign_id,
    'Reach Out', current_date, 'outbound',
    p_content_type, 0, 0, 0,
    null, 0,
    v_brief_link,
    v_now, v_now
  );

  return query
  select v_post_id, v_post_id, v_post_number, v_collab_number, p_inf_id, v_collab_id;
end;
$function$;
