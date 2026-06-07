-- ============================================================================
-- 2026-06-06 — submit_reachout RPC: Collab ID model
--
-- Rewrites submit_reachout for the Collab ID restructure. Changes vs the live
-- function are MINIMAL and surgical (signature + body otherwise IDENTICAL to
-- the deployed version — same 20 params, same insert columns):
--   1. post_id is now the SHORT id (no -C suffix): v_post_id := v_post_id_short;
--   2. compute v_collab_id := v_inf_id || '-C' || v_collab_number;
--   3. INSERT now stamps posts.collab_id.
--   4. RETURNS TABLE + final RETURN QUERY now include collab_id.
-- Everything else (advisory locks, global post_number, per-inf_id collab_number,
-- brief-link auto-attach, Barter=0 rule, creators upsert) is IDENTICAL.
--
-- The signature MUST stay the exact 20 params the app calls with — a different
-- arg list would create a second overload and leave the old one in place.
--
-- DO NOT apply standalone — run AFTER 2026_06_06_collab_id_restructure.sql so
-- posts.collab_id exists.
-- ============================================================================

create or replace function public.submit_reachout(
  p_username            text,
  p_inf_name            text,
  p_instagram_link      text,
  p_followers           integer,
  p_gender              text,
  p_state               text,
  p_email               text,
  p_campaign_id         text,
  p_content_type        text,
  p_content_name        text,
  p_reachout_type       text,
  p_reachout_direction  text,
  p_reels               integer,
  p_static_posts        integer,
  p_stories             integer,
  p_ads_usage_rights    text,
  p_collab_type         text,
  p_commercial_amount   numeric,
  p_raw_dump            text,
  p_logged_by_email     text
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
  v_username            text := lower(btrim(p_username));
  v_inf_id              text;
  v_max_sif_num         int;
  v_post_number         int;
  v_collab_number       int;
  v_post_id_short       text;
  v_post_id             text;
  v_collab_id           text;
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

  -- Collab ID model: post_id IS the short deliverable id (no -C suffix); the
  -- -C{k} now lives on collab_id = inf_id || '-C' || collab_number.
  v_post_id_short := v_inf_id || '-P' || v_post_number;
  v_post_id       := v_post_id_short;
  v_collab_id     := v_inf_id || '-C' || v_collab_number;

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
    post_id, post_id_short, post_number, collab_number, collab_id,
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
    v_post_id, v_post_id_short, v_post_number, v_collab_number, v_collab_id,
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
  select v_post_id, v_post_id_short, v_post_number, v_collab_number, v_inf_id, v_collab_id;
end;
$function$;
