-- ============================================================================
-- 2026-05-19 — submit_reachout RPC
--
-- Atomic reach-out creation. Replaces the LockService.waitLock(20000) +
-- bespoke POST_ID generation in legacy InfluencerBackend.js#submitReachOut.
--
-- Concurrency: pg_advisory_xact_lock keyed on inf_id  (or on username hash
-- when no inf_id is known yet, before the creators upsert assigns one).
--
-- POST_ID rules (legacy parity — InfluencerBackend.js#submitReachOut):
--   • post_number  = MAX(posts.post_number)+1  GLOBAL across all posts.
--   • collab_number = MAX(collab_number for this inf_id)+1. Increments per
--     new reach-out for same creator regardless of campaign. First = 1.
--   • post_id_short = `${inf_id}-P${post_number}`
--   • post_id       = `${post_id_short}-C${collab_number}`     (full Collab ID)
--
-- creator_brief_link auto-attaches from campaigns.brief_link if present.
-- Barter rule: if collab_type='Barter' then commercial_amount is forced to 0.
-- ============================================================================

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
  p_commercial_reel_rate numeric,
  p_commercial_post_rate numeric,
  p_commercial_story_rate numeric,
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
  v_latest_campaign     text;
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

  -- Serialise per-username (pre-upsert) AND per-inf_id (post-upsert). Two locks
  -- avoid the race where two reach-outs for the same fresh creator each create
  -- a new creators row.
  perform pg_advisory_xact_lock(hashtext('reachout-user:' || v_username));

  -- Lookup existing creator by username (legacy uses username as soft-unique).
  select creators.inf_id into v_inf_id
    from creators
   where creators.username = v_username
   limit 1;

  if v_inf_id is null then
    -- Generate next SIF-N (legacy parity: scan max numeric suffix on inf_id).
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
    -- Existing creator: merge non-null fields (coalesce keeps existing if new is null/empty).
    update creators set
      inf_name       = coalesce(nullif(p_inf_name, ''),       creators.inf_name),
      instagram_link = coalesce(nullif(p_instagram_link, ''), creators.instagram_link),
      followers      = coalesce(p_followers,                  creators.followers),
      gender         = coalesce(nullif(p_gender, ''),         creators.gender),
      state          = coalesce(nullif(p_state, ''),          creators.state)
    where creators.inf_id = v_inf_id;
  end if;

  -- Per-creator lock for POST_ID assignment.
  perform pg_advisory_xact_lock(hashtext('reachout-inf:' || v_inf_id));

  -- P-number is GLOBAL linear across all posts in DB (legacy parity:
  -- InfluencerBackend.js#submitReachOut line ~2660). Never per-creator.
  select coalesce(max(posts.post_number), 0) + 1
    into v_post_number
    from posts;

  -- C-number: collab episode counter. Increments per new reach-out for same
  -- creator, regardless of campaign. First reach-out = C1.
  select coalesce(max(posts.collab_number), 0) + 1
    into v_collab_number
    from posts
   where posts.inf_id = v_inf_id;

  v_post_id_short := v_inf_id || '-P' || v_post_number;
  v_post_id       := v_post_id_short || '-C' || v_collab_number;

  -- Auto-attach brief link if the campaign has one.
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
    commercial_reel_rate, commercial_post_rate, commercial_story_rate,
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
    p_commercial_reel_rate, p_commercial_post_rate, p_commercial_story_rate,
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
  'Atomic reach-out creation. Upserts creators by username, generates linear post_number per inf_id, derives collab_number from campaign continuity, inserts a Reach Out post. Replaces legacy GAS submitReachOut + LockService.';

-- Service-role bypasses RLS. Grant execute explicitly so we can call from
-- server actions via the standard postgrest /rpc path.
grant execute on function public.submit_reachout(
  text, text, text, int, text, text, text,
  text, text, text, text, text,
  int, int, int, text,
  text, numeric, numeric, numeric, numeric,
  text, text
) to service_role;
