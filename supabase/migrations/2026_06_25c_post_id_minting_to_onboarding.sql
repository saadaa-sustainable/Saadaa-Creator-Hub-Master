-- ─────────────────────────────────────────────────────────────────────────
-- Move POST_ID (P) generation from REACH-OUT to ONBOARDING (subsumes the
-- collab-only move in 2026_06_25_collab_minting_to_onboarding.sql).
-- Reach-out rows now carry NULL post_id/post_number/collab, identified by the
-- bigserial id. Onboarding mints the contiguous P-block + C, continuing maxP
-- AND maxC over posts ∪ historic_posts. See memory
-- project_collab_deliverable_numbering_rule (v2).
-- Applied to prod via MCP 2026-06-25; this file mirrors it for version control.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. post_id nullable. The plain UNIQUE on post_id already permits MULTIPLE NULLs
--    (NULLs are distinct in Postgres), so reach-out rows can share NULL while
--    non-null post_ids stay unique. FKs (payments.post_id) unaffected.
--    posts.id (bigserial) is the real PK.
alter table public.posts alter column post_id drop not null;
alter table public.posts alter column post_id_short drop not null;

-- 2. Reset the existing live Reach Out rows (phantom P1 under the old rule).
update public.posts
set post_id = null, post_id_short = null, post_number = null, nomenclature = null
where workflow_status = 'Reach Out';

-- 3. submit_reachout / create_repeat_collab — RETURN-type changes require DROP.
drop function if exists public.submit_reachout(text,text,text,integer,text,text,text,text,text,text,text,text,integer,integer,integer,text,text,numeric,text,text);
drop function if exists public.create_repeat_collab(text,text,text);

-- Reach-out: create the row with NULL post_id/post_number/collab; return bigserial id.
create or replace function public.submit_reachout(p_username text, p_inf_name text, p_instagram_link text, p_followers integer, p_gender text, p_state text, p_email text, p_campaign_id text, p_content_type text, p_content_name text, p_reachout_type text, p_reachout_direction text, p_reels integer, p_static_posts integer, p_stories integer, p_ads_usage_rights text, p_collab_type text, p_commercial_amount numeric, p_raw_dump text, p_logged_by_email text)
 RETURNS TABLE(id bigint, post_id text, post_id_short text, post_number integer, collab_number integer, inf_id text, collab_id text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_username text := lower(btrim(p_username));
  v_inf_id text; v_max_sif_num int; v_new_sif_num int;
  v_brief_link text; v_commercial_amount numeric; v_now timestamptz := now();
  v_id bigint;
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

  select campaigns.brief_link into v_brief_link from campaigns where campaigns.campaign_id = p_campaign_id;
  if p_collab_type = 'Barter' then v_commercial_amount := 0;
  else v_commercial_amount := coalesce(p_commercial_amount, 0); end if;

  insert into posts (
    post_id, post_id_short, post_number, collab_number, collab_id,
    inf_id, username, campaign_id, workflow_status, reach_out_date, reachout_direction,
    content_type, reels, static_posts, stories, ads_usage_rights, collab_type, commercial_amount,
    creator_brief_link, email, raw_dump, onboarded_by, created_at, updated_at
  ) values (
    null, null, null, null, null,
    v_inf_id, v_username, p_campaign_id, 'Reach Out', current_date, p_reachout_direction,
    p_content_type, coalesce(p_reels,0), coalesce(p_static_posts,0), coalesce(p_stories,0), p_ads_usage_rights,
    p_collab_type, v_commercial_amount, v_brief_link, p_email, p_raw_dump, p_logged_by_email, v_now, v_now
  )
  returning posts.id into v_id;

  return query select v_id, null::text, null::text, null::int, null::int, v_inf_id, null::text;
end;
$function$;

create or replace function public.create_repeat_collab(p_inf_id text, p_campaign_id text, p_content_type text)
 RETURNS TABLE(id bigint, post_id text, post_id_short text, post_number integer, collab_number integer, inf_id text, collab_id text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_username text; v_brief_link text; v_now timestamptz := now(); v_id bigint;
begin
  if p_inf_id is null or p_inf_id = '' then raise exception 'create_repeat_collab: p_inf_id required'; end if;
  if p_campaign_id is null or p_campaign_id = '' then raise exception 'create_repeat_collab: p_campaign_id required'; end if;
  select creators.username into v_username from creators where creators.inf_id = p_inf_id;
  if v_username is null then raise exception 'create_repeat_collab: creator % not found', p_inf_id; end if;

  select campaigns.brief_link into v_brief_link from campaigns where campaigns.campaign_id = p_campaign_id;
  insert into posts (
    post_id, post_id_short, post_number, collab_number, collab_id,
    inf_id, username, campaign_id, workflow_status, reach_out_date, reachout_direction,
    content_type, reels, static_posts, stories, collab_type, commercial_amount,
    creator_brief_link, created_at, updated_at
  ) values (
    null, null, null, null, null,
    p_inf_id, v_username, p_campaign_id, 'Reach Out', current_date, 'outbound',
    p_content_type, 0, 0, 0, null, 0, v_brief_link, v_now, v_now
  )
  returning posts.id into v_id;

  return query select v_id, null::text, null::text, null::int, null::int, p_inf_id, null::text;
end;
$function$;

-- 4. mint_onboarding_block: mints C + reserves the contiguous P-block in ONE
--    advisory-locked call. maxP AND maxC over posts ∪ historic_posts (continuation).
--    Union columns are table-aliased to avoid collision with the OUT params.
create or replace function public.mint_onboarding_block(p_inf_id text, p_order_id text, p_deliverable_count integer)
 RETURNS TABLE(collab_number integer, collab_id text, start_post_number integer, post_id_base text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_oid text := lower(btrim(regexp_replace(coalesce(p_order_id,''), '^#+', '')));
  v_cn int; v_maxp int;
begin
  if p_inf_id is null or p_inf_id = '' then raise exception 'mint_onboarding_block: p_inf_id required'; end if;

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
    select coalesce(max(u.cn), 0) + 1 into v_cn
    from (
      select p.collab_number cn from posts p          where p.inf_id = p_inf_id and p.collab_number is not null
      union all
      select h.collab_number cn from historic_posts h where h.inf_id = p_inf_id and h.collab_number is not null
    ) u;
  end if;

  select coalesce(max(u.pn), 0) into v_maxp
  from (
    select p.post_number pn from posts p          where p.inf_id = p_inf_id
    union all
    select h.post_number pn from historic_posts h where h.inf_id = p_inf_id
  ) u;

  collab_number     := v_cn;
  collab_id         := p_inf_id || '-C' || v_cn;
  start_post_number := v_maxp + 1;
  post_id_base      := p_inf_id || '-P' || (v_maxp + 1);
  return next;
end;
$function$;
