-- Reach-out rows are owned by logged_by. The post-id migration accidentally
-- wrote the acting reach-out member into onboarded_by, which made the owner
-- disappear from the Onboarding queue and polluted onboarding attribution.

update public.posts
set
  logged_by = nullif(btrim(onboarded_by), ''),
  onboarded_by = null
where workflow_status = 'Reach Out'
  and nullif(btrim(logged_by), '') is null
  and nullif(btrim(onboarded_by), '') is not null;

create or replace function public.submit_reachout(
  p_username text,
  p_inf_name text,
  p_instagram_link text,
  p_followers integer,
  p_gender text,
  p_state text,
  p_email text,
  p_campaign_id text,
  p_content_type text,
  p_content_name text,
  p_reachout_type text,
  p_reachout_direction text,
  p_reels integer,
  p_static_posts integer,
  p_stories integer,
  p_ads_usage_rights text,
  p_collab_type text,
  p_commercial_amount numeric,
  p_raw_dump text,
  p_logged_by_email text
)
returns table(id bigint, post_id text, post_id_short text, post_number integer, collab_number integer, inf_id text, collab_id text)
language plpgsql
set search_path to 'public'
as $function$
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
    creator_brief_link, email, raw_dump, logged_by, created_at, updated_at
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
