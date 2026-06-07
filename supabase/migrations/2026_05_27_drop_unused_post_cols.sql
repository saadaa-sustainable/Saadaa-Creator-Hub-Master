-- ============================================================================
-- 2026-05-27 — Drop unused per-deliverable rate columns + dead text cols
--
-- Rationale: project now uses a single `commercial_amount` per post (with
-- equal-split across child deliverables). Per-type rate columns
-- (reel/post/story) + the never-populated `collab_message` and stale
-- `match_status` columns are dead weight in the schema, the Sheet View, and
-- the Reach Out forms.
--
-- Dropped from `posts`:
--   • commercial_reel_rate
--   • commercial_post_rate
--   • commercial_story_rate
--   • collab_message
--   • match_status
--
-- `submit_reachout` RPC is recreated without the three rate params (existing
-- call sites are being updated in the same change set).
-- ============================================================================

-- 1) Drop the RPC signature that referenced the rate cols (CASCADE so we can
--    re-declare it cleanly with the new arg list below).
drop function if exists public.submit_reachout(
  text, text, text, int, text, text, text,
  text, text, text, text, text,
  int, int, int, text,
  text, numeric, numeric, numeric, numeric,
  text, text
) cascade;

-- 2) Drop dependent view first — recreated below referencing commercial_amount.
drop view if exists public.inbound_reachout_queue;

-- 3) Drop the columns. `if exists` so the migration is idempotent.
alter table public.posts drop column if exists commercial_reel_rate;
alter table public.posts drop column if exists commercial_post_rate;
alter table public.posts drop column if exists commercial_story_rate;
alter table public.posts drop column if exists collab_message;
alter table public.posts drop column if exists match_status;

-- 4) Recreate the inbound queue view without the dropped rate columns. Surface
--    the new single-source `commercial_amount` + `collab_type` instead.
create or replace view public.inbound_reachout_queue as
select
  p.post_id,
  p.inf_id,
  p.username,
  p.campaign_id,
  p.content_type,
  p.reach_out_date,
  p.collab_type,
  p.commercial_amount,
  p.creator_brief_link,
  c.inf_name,
  c.followers
from public.posts p
left join public.creators c on c.inf_id = p.inf_id
where p.reachout_direction = 'inbound'
  and p.workflow_status = 'Reach Out'
order by p.reach_out_date desc nulls last;

-- 3) Recreate `submit_reachout` without the rate params. p_collab_type +
--    p_commercial_amount stay so the Inbound form can pass them through.
create or replace function public.submit_reachout(
  p_username            text,
  p_inf_name            text,
  p_instagram_link      text,
  p_followers           int,
  p_gender              text,
  p_state               text,
  p_email               text,
  p_campaign_id         text,
  p_content_type        text,
  p_content_name        text,
  p_reachout_type       text,
  p_reachout_direction  text,
  p_reels               int,
  p_static_posts        int,
  p_stories             int,
  p_ads_usage_rights    text,
  p_collab_type         text,
  p_commercial_amount   numeric,
  p_raw_dump            text,
  p_logged_by_email     text
)
returns table (
  post_id        text,
  post_id_short  text,
  post_number    int,
  collab_number  int,
  inf_id         text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_username            text := lower(btrim(p_username));
  v_inf_id              text;
  v_max_sif_num         int;
  v_post_number         int;
  v_collab_number       int;
  v_post_id_short       text;
  v_post_id             text;
  v_brief_link          text;
  v_commercial_amount   numeric;
  v_now                 timestamptz := now();
begin
  if v_username is null or v_username = '' then
    raise exception 'submit_reachout: p_username required';
  end if;
  if p_campaign_id is null or p_campaign_id = '' then
    raise exception 'submit_reachout: p_campaign_id required';
  end if;
  if p_reachout_direction not in ('inbound', 'outbound') then
    raise exception 'submit_reachout: p_reachout_direction must be inbound or outbound';
  end if;

  perform pg_advisory_xact_lock(hashtext('reachout-user:' || v_username));

  select creators.inf_id into v_inf_id
    from creators
   where creators.username = v_username
   limit 1;

  if v_inf_id is null then
    select coalesce(max(
      case when creators.inf_id like 'SIF-%'
           then nullif(regexp_replace(creators.inf_id, '^SIF-(\d+).*$', '\1'), '')::int
           else 0
      end
    ), 0) into v_max_sif_num
    from creators;

    v_inf_id := 'SIF-' || (v_max_sif_num + 1);

    insert into creators (inf_id, username, inf_name, instagram_link, followers, gender, state)
    values (v_inf_id, v_username, p_inf_name, p_instagram_link, p_followers, p_gender, p_state);
  else
    update creators set
      inf_name       = coalesce(nullif(p_inf_name, ''),       creators.inf_name),
      instagram_link = coalesce(nullif(p_instagram_link, ''), creators.instagram_link),
      followers      = coalesce(p_followers,                  creators.followers),
      gender         = coalesce(nullif(p_gender, ''),         creators.gender),
      state          = coalesce(nullif(p_state, ''),          creators.state)
    where creators.inf_id = v_inf_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('reachout-inf:' || v_inf_id));

  select coalesce(max(posts.post_number), 0) + 1
    into v_post_number
    from posts;

  select coalesce(max(posts.collab_number), 0) + 1
    into v_collab_number
    from posts
   where posts.inf_id = v_inf_id;

  v_post_id_short := v_inf_id || '-P' || v_post_number;
  v_post_id       := v_post_id_short || '-C' || v_collab_number;

  select campaigns.brief_link into v_brief_link
    from campaigns
   where campaigns.campaign_id = p_campaign_id;

  -- Barter rule: Barter collabs always have 0 cash compensation.
  if p_collab_type = 'Barter' then
    v_commercial_amount := 0;
  else
    v_commercial_amount := coalesce(p_commercial_amount, 0);
  end if;

  insert into posts (
    post_id, post_id_short, post_number, collab_number,
    inf_id, username, campaign_id,
    workflow_status, reach_out_date, reachout_direction,
    content_type,
    reels, static_posts, stories, ads_usage_rights,
    collab_type, commercial_amount,
    creator_brief_link,
    email, raw_dump,
    onboarded_by,
    created_at, updated_at
  ) values (
    v_post_id, v_post_id_short, v_post_number, v_collab_number,
    v_inf_id, v_username, p_campaign_id,
    'Reach Out', current_date, p_reachout_direction,
    p_content_type,
    coalesce(p_reels, 0), coalesce(p_static_posts, 0), coalesce(p_stories, 0), p_ads_usage_rights,
    p_collab_type, v_commercial_amount,
    v_brief_link,
    p_email, p_raw_dump,
    p_logged_by_email,
    v_now, v_now
  );

  return query
  select v_post_id, v_post_id_short, v_post_number, v_collab_number, v_inf_id;
end;
$$;

comment on function public.submit_reachout is
  'Atomic reach-out creation. Upserts creators by username, generates linear post_number per inf_id, derives collab_number from campaign continuity, inserts a Reach Out post. Per-deliverable rate cols removed 2026-05-27 — commercial_amount equal-splits in onboarding.';

grant execute on function public.submit_reachout(
  text, text, text, int, text, text, text,
  text, text, text, text, text,
  int, int, int, text,
  text, numeric,
  text, text
) to service_role;
