-- Creator deactivation — `creators.is_active` + surfacing it everywhere.
--
-- Deactivated = dead/mangled IG handle (null profile_id) or Meta "Invalid user id".
-- A deactivated creator stays in the table (history preserved) but shows a
-- "Deactivated" badge on every creator surface (analytics card+row, historic
-- reach-out picker, onboarding/posting/accounts cells, journey card).
--
-- Applied via MCP 2026-06-30. The one-time backfill
--   UPDATE creators SET is_active=false, deactivated_reason='no_profile_id', deactivated_at=now()
--   WHERE (profile_id IS NULL OR trim(profile_id)='') AND is_active=true;
-- was run separately (NOT in this file, so re-applying the migration never
-- re-deactivates creators that were manually reactivated). 280 rows deactivated.

-- ── column ──────────────────────────────────────────────────────────────────
alter table public.creators
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_reason text,
  add column if not exists deactivated_at timestamptz;

comment on column public.creators.is_active is
  'false = deactivated (excluded from active creator views/pickers). Set false for dead/mangled IG handles (null profile_id) and Meta Invalid-user-id handles.';

-- ── creator_analytics_page: add is_active to the projection ─────────────────
DROP FUNCTION IF EXISTS public.creator_analytics_page(text,text,text,text,text,date,date,date,date,integer,integer);

CREATE OR REPLACE FUNCTION public.creator_analytics_page(
  p_search text DEFAULT NULL::text, p_tier text DEFAULT NULL::text,
  p_region text DEFAULT NULL::text, p_creator_type text DEFAULT NULL::text,
  p_stage text DEFAULT NULL::text, p_reach_from date DEFAULT NULL::date,
  p_reach_to date DEFAULT NULL::date, p_posted_from date DEFAULT NULL::date,
  p_posted_to date DEFAULT NULL::date, p_limit integer DEFAULT 60, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  inf_id text, username text, inf_name text, followers bigint, category text,
  profile_pic text, creator_type text, state text, instagram_link text,
  current_stage text, live_collab_count integer, historic_collab_count integer,
  total_collab_count integer, deliverable_count integer, last_onboard_date date,
  last_post_date date, reach_out_from date, reach_out_to date, collab_types text,
  is_active boolean, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with base as (
    select c.inf_id, c.username, c.inf_name, c.followers, c.category, c.profile_pic,
           c.creator_type, c.state, c.instagram_link, s.current_stage,
           coalesce(s.live_collab_count,0) as live_cc, coalesce(s.historic_collab_count,0) as hist_cc,
           coalesce(s.deliverable_count,0) as deliverables,
           s.last_onboard_date, s.last_post_date, s.reach_out_from, s.reach_out_to,
           s.collab_types, c.is_active
    from creators c
    left join creator_analytics_summary s on s.inf_id = c.inf_id
    where (p_search is null or p_search='' or c.username ilike '%'||p_search||'%' or coalesce(c.inf_name,'') ilike '%'||p_search||'%' or c.inf_id ilike '%'||p_search||'%')
      and (p_tier is null or p_tier='' or c.category=p_tier)
      and (p_region is null or p_region='' or c.state=p_region)
      and (p_creator_type is null or p_creator_type='' or c.creator_type=p_creator_type)
      and (p_stage is null or p_stage='' or s.current_stage=p_stage)
      and (p_reach_from is null or (s.reach_out_to is not null and s.reach_out_to >= p_reach_from))
      and (p_reach_to is null or (s.reach_out_from is not null and s.reach_out_from <= p_reach_to))
      and (p_posted_from is null or (s.last_post_date is not null and s.last_post_date >= p_posted_from))
      and (p_posted_to is null or (s.last_post_date is not null and s.last_post_date <= p_posted_to))
  )
  select inf_id, username, inf_name, followers, category, profile_pic, creator_type, state, instagram_link,
         current_stage, live_cc, hist_cc, (live_cc+hist_cc) as total_collab_count, deliverables,
         last_onboard_date, last_post_date, reach_out_from, reach_out_to, collab_types,
         is_active, count(*) over () as total_count
  from base
  order by followers desc nulls last, inf_id
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$function$;

-- ── list_historic_creators: add is_active to the projection ─────────────────
DROP FUNCTION IF EXISTS public.list_historic_creators(text,text,text,text,text,integer,integer);

create or replace function public.list_historic_creators(
  p_search text default null, p_content_type text default null, p_tier text default null,
  p_campaign text default null, p_team text default null, p_limit integer default 60, p_offset integer default 0)
 returns table(inf_id text, username text, inf_name text, followers bigint, category text, profile_pic text, creator_type text, is_active boolean, total_count bigint)
 language sql stable security definer set search_path to 'public'
as $function$
  with filtered as (
    select c.inf_id, c.username, c.inf_name, c.followers, c.category, c.profile_pic, c.creator_type, c.is_active
    from creators c
    where (p_search is null or p_search = '' or c.username ilike '%'||p_search||'%' or coalesce(c.inf_name,'') ilike '%'||p_search||'%' or c.inf_id ilike '%'||p_search||'%')
      and (p_tier is null or p_tier = '' or c.category = p_tier)
      and (p_content_type is null or p_content_type = '' or exists (select 1 from posts p where p.inf_id = c.inf_id and p.content_type = p_content_type) or exists (select 1 from cleaned_data cd where cd.sif_id = c.inf_id and cd.content_type = p_content_type))
      and (p_campaign is null or p_campaign = '' or exists (select 1 from posts p where p.inf_id = c.inf_id and p.campaign_id = p_campaign) or exists (select 1 from cleaned_data cd where cd.sif_id = c.inf_id and cd.campaign_id = p_campaign))
      and (p_team is null or p_team = '' or exists (select 1 from posts p where p.inf_id = c.inf_id and p.onboarded_by = p_team) or exists (select 1 from historic_posts h where h.inf_id = c.inf_id and h.onboarded_by = p_team))
  )
  select inf_id, username, inf_name, followers, category, profile_pic, creator_type, is_active, count(*) over () as total_count
  from filtered order by followers desc nulls last, inf_id
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$function$;
