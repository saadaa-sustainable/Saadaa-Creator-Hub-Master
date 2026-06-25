-- Historic Creators team filter also matches the HISTORIC callout person
-- (historic_posts.onboarded_by = legacy callout_by). Applied via MCP 2026-06-25.
create or replace function public.list_historic_creators(p_search text default null, p_content_type text default null, p_tier text default null, p_campaign text default null, p_team text default null, p_limit integer default 60, p_offset integer default 0)
 returns table(inf_id text, username text, inf_name text, followers bigint, category text, profile_pic text, creator_type text, total_count bigint)
 language sql stable security definer set search_path to 'public'
as $function$
  with filtered as (
    select c.inf_id, c.username, c.inf_name, c.followers, c.category, c.profile_pic, c.creator_type
    from creators c
    where (p_search is null or p_search = '' or c.username ilike '%'||p_search||'%' or coalesce(c.inf_name,'') ilike '%'||p_search||'%' or c.inf_id ilike '%'||p_search||'%')
      and (p_tier is null or p_tier = '' or c.category = p_tier)
      and (p_content_type is null or p_content_type = '' or exists (select 1 from posts p where p.inf_id = c.inf_id and p.content_type = p_content_type) or exists (select 1 from cleaned_data cd where cd.sif_id = c.inf_id and cd.content_type = p_content_type))
      and (p_campaign is null or p_campaign = '' or exists (select 1 from posts p where p.inf_id = c.inf_id and p.campaign_id = p_campaign) or exists (select 1 from cleaned_data cd where cd.sif_id = c.inf_id and cd.campaign_id = p_campaign))
      and (p_team is null or p_team = '' or exists (select 1 from posts p where p.inf_id = c.inf_id and p.onboarded_by = p_team) or exists (select 1 from historic_posts h where h.inf_id = c.inf_id and h.onboarded_by = p_team))
  )
  select inf_id, username, inf_name, followers, category, profile_pic, creator_type, count(*) over () as total_count
  from filtered order by followers desc nulls last, inf_id
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$function$;
