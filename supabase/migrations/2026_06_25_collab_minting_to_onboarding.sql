-- ─────────────────────────────────────────────────────────────────────────
-- Move COLLAB minting from REACH-OUT to ONBOARDING.
-- Business rule: a collab (C{n}) = one order. Reach-out posts have NO collab
-- (collab_number/collab_id NULL) until onboarding maps an order. Re-onboarding
-- the same creator with a DIFFERENT order_id mints the next C; the SAME order_id
-- reuses the existing collab. post_number (P{n}) stays per-creator linear.
-- See memory project_collab_deliverable_numbering_rule.
-- Applied to prod via MCP 2026-06-25; this file mirrors it for version control.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. submit_reachout: stop minting collab (write NULL), keep post_number.
create or replace function public.submit_reachout(p_username text, p_inf_name text, p_instagram_link text, p_followers integer, p_gender text, p_state text, p_email text, p_campaign_id text, p_content_type text, p_content_name text, p_reachout_type text, p_reachout_direction text, p_reels integer, p_static_posts integer, p_stories integer, p_ads_usage_rights text, p_collab_type text, p_commercial_amount numeric, p_raw_dump text, p_logged_by_email text)
 RETURNS TABLE(post_id text, post_id_short text, post_number integer, collab_number integer, inf_id text, collab_id text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_username text := lower(btrim(p_username));
  v_inf_id text; v_max_sif_num int; v_new_sif_num int; v_post_number int;
  v_collab_number int := null; v_collab_id text := null;
  v_post_id_short text; v_post_id text; v_brief_link text;
  v_commercial_amount numeric; v_now timestamptz := now();
begin
  if v_username is null or v_username = '' then raise exception 'submit_reachout: p_username required'; end if;
  if p_campaign_id is null or p_campaign_id = '' then raise exception 'submit_reachout: p_campaign_id required'; end if;
  if p_reachout_direction not in ('inbound','outbound') then raise exception 'submit_reachout: p_reachout_direction must be inbound or outbound'; end if;

  perform pg_advisory_xact_lock(hashtext('reachout-user:' || v_username));

  select creators.inf_id into v_inf_id from creators where creators.username = v_username limit 1;

  if v_inf_id is null then
    select coalesce(max(creators.sif_number), 0) into v_max_sif_num from creators;
    v_new_sif_num := v_max_sif_num + 1;
    v_inf_id := 'SIF-' || v_new_sif_num;
    insert into creators (inf_id, sif_number, username, inf_name, instagram_link, followers, gender, state)
    values (v_inf_id, v_new_sif_num, v_username, p_inf_name, p_instagram_link, p_followers, p_gender, p_state);
  else
    update creators set
      inf_name = coalesce(nullif(p_inf_name,''), creators.inf_name),
      instagram_link = coalesce(nullif(p_instagram_link,''), creators.instagram_link),
      followers = coalesce(p_followers, creators.followers),
      gender = coalesce(nullif(p_gender,''), creators.gender),
      state = coalesce(nullif(p_state,''), creators.state)
    where creators.inf_id = v_inf_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('reachout-inf:' || v_inf_id));

  -- PER-CREATOR post_number only. Collab is minted at ONBOARDING, so collab_number
  -- and collab_id are NULL here (column default is 1 — the explicit NULL is required).
  select coalesce(max(posts.post_number), 0) + 1 into v_post_number
    from posts where posts.inf_id = v_inf_id;

  v_post_id_short := v_inf_id || '-P' || v_post_number;
  v_post_id := v_post_id_short;

  select campaigns.brief_link into v_brief_link from campaigns where campaigns.campaign_id = p_campaign_id;

  if p_collab_type = 'Barter' then v_commercial_amount := 0;
  else v_commercial_amount := coalesce(p_commercial_amount, 0); end if;

  insert into posts (
    post_id, post_id_short, post_number, collab_number, collab_id,
    inf_id, username, campaign_id, workflow_status, reach_out_date, reachout_direction,
    content_type, reels, static_posts, stories, ads_usage_rights, collab_type, commercial_amount,
    creator_brief_link, email, raw_dump, onboarded_by, created_at, updated_at
  ) values (
    v_post_id, v_post_id_short, v_post_number, v_collab_number, v_collab_id,
    v_inf_id, v_username, p_campaign_id, 'Reach Out', current_date, p_reachout_direction,
    p_content_type, coalesce(p_reels,0), coalesce(p_static_posts,0), coalesce(p_stories,0), p_ads_usage_rights,
    p_collab_type, v_commercial_amount, v_brief_link, p_email, p_raw_dump, p_logged_by_email, v_now, v_now
  );

  return query select v_post_id, v_post_id_short, v_post_number, v_collab_number, v_inf_id, v_collab_id;
end;
$function$;

-- 2. create_repeat_collab: a repeat-collab post is a fresh reach-out with NO collab
--    until onboarded (collab minted at onboarding by mint_collab_for_order).
create or replace function public.create_repeat_collab(p_inf_id text, p_campaign_id text, p_content_type text)
 RETURNS TABLE(post_id text, post_id_short text, post_number integer, collab_number integer, inf_id text, collab_id text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_username text; v_post_number int;
  v_post_id text; v_brief_link text; v_now timestamptz := now();
begin
  if p_inf_id is null or p_inf_id = '' then raise exception 'create_repeat_collab: p_inf_id required'; end if;
  if p_campaign_id is null or p_campaign_id = '' then raise exception 'create_repeat_collab: p_campaign_id required'; end if;
  select creators.username into v_username from creators where creators.inf_id = p_inf_id;
  if v_username is null then raise exception 'create_repeat_collab: creator % not found', p_inf_id; end if;

  perform pg_advisory_xact_lock(hashtext('reachout-inf:' || p_inf_id));

  select coalesce(max(posts.post_number), 0) + 1 into v_post_number from posts where posts.inf_id = p_inf_id;
  v_post_id := p_inf_id || '-P' || v_post_number;
  select campaigns.brief_link into v_brief_link from campaigns where campaigns.campaign_id = p_campaign_id;

  insert into posts (
    post_id, post_id_short, post_number, collab_number, collab_id,
    inf_id, username, campaign_id, workflow_status, reach_out_date, reachout_direction,
    content_type, reels, static_posts, stories, collab_type, commercial_amount,
    creator_brief_link, created_at, updated_at
  ) values (
    v_post_id, v_post_id, v_post_number, null, null,
    p_inf_id, v_username, p_campaign_id, 'Reach Out', current_date, 'outbound',
    p_content_type, 0, 0, 0, null, 0, v_brief_link, v_now, v_now
  );

  return query select v_post_id, v_post_id, v_post_number, null::int, p_inf_id, null::text;
end;
$function$;

-- 3. mint_collab_for_order: concurrency-safe collab mint at onboarding.
--    Reuse the collab already mapped to this exact order_id (idempotent / same order),
--    else next C = max(collab_number over creator)+1. order_id normalized to match
--    the app's normalizeOrderId (strip leading '#', trim, lowercase).
create or replace function public.mint_collab_for_order(p_inf_id text, p_order_id text)
 RETURNS TABLE(collab_number integer, collab_id text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_oid text := lower(btrim(regexp_replace(coalesce(p_order_id,''), '^#+', '')));
  v_cn int;
begin
  if p_inf_id is null or p_inf_id = '' then raise exception 'mint_collab_for_order: p_inf_id required'; end if;

  perform pg_advisory_xact_lock(hashtext('reachout-inf:' || p_inf_id));

  if v_oid <> '' then
    select p.collab_number into v_cn
    from posts p
    where p.inf_id = p_inf_id
      and p.collab_number is not null
      and lower(btrim(regexp_replace(coalesce(p.order_id,''), '^#+', ''))) = v_oid
    order by p.collab_number asc
    limit 1;
  end if;

  if v_cn is null then
    select coalesce(max(p.collab_number), 0) + 1 into v_cn
    from posts p where p.inf_id = p_inf_id and p.collab_number is not null;
  end if;

  collab_number := v_cn;
  collab_id := p_inf_id || '-C' || v_cn;
  return next;
end;
$function$;

-- 4. Backfill: the existing live reach-out rows were minted under the OLD rule
--    (fake C1). Reset to NULL collab. Onboarded rows are untouched.
update public.posts
set collab_number = null, collab_id = null
where workflow_status = 'Reach Out';
