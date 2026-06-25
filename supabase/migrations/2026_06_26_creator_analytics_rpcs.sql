-- Creator Analytics server-side pagination.
--
-- creator_analytics_page  — per-creator aggregation over posts ∪ historic_posts
--   (live/historic collab counts, current stage, deliverables, collab-type
--   breakdown, reach/post date ranges), filtered + ordered followers desc +
--   paginated 60/page with a window count(*) total_count. Replaces the old
--   fetch-7829-creators-into-JS approach that made the tab laggy.
-- creator_collab_history  — on-demand per-creator collab list for the row modal.
--
-- See apps/web/features/creator-analytics/. Applied via MCP 2026-06-26.

CREATE OR REPLACE FUNCTION public.creator_analytics_page(
  p_search text DEFAULT NULL::text,
  p_tier text DEFAULT NULL::text,
  p_region text DEFAULT NULL::text,
  p_creator_type text DEFAULT NULL::text,
  p_stage text DEFAULT NULL::text,
  p_reach_from date DEFAULT NULL::date,
  p_reach_to date DEFAULT NULL::date,
  p_posted_from date DEFAULT NULL::date,
  p_posted_to date DEFAULT NULL::date,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  inf_id text, username text, inf_name text, followers bigint, category text,
  profile_pic text, creator_type text, state text, instagram_link text,
  current_stage text, live_collab_count integer, historic_collab_count integer,
  total_collab_count integer, deliverable_count integer, last_onboard_date date,
  last_post_date date, reach_out_from date, reach_out_to date, collab_types text,
  total_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with allposts as (
    select p.inf_id, p.collab_id, p.collab_number, p.workflow_status, p.collab_type,
           coalesce(p.reels,0)+coalesce(p.static_posts,0)+coalesce(p.stories,0) as deliv,
           p.reach_out_date, p.onboard_date, p.post_date, 1 as is_live
    from posts p
    union all
    select h.inf_id, h.collab_id, h.collab_number, h.workflow_status, h.collab_type,
           0, h.reach_out_date, h.onboard_date, h.post_date, 0
    from historic_posts h
  ),
  agg as (
    select a.inf_id,
      count(distinct coalesce(a.collab_id, a.inf_id||'-C'||a.collab_number))
        filter (where a.is_live=1 and (a.collab_id is not null or a.collab_number is not null)) as live_cc,
      count(distinct coalesce(a.collab_id, a.inf_id||'-C'||a.collab_number))
        filter (where a.is_live=0 and (a.collab_id is not null or a.collab_number is not null)) as hist_cc,
      coalesce(sum(a.deliv),0) as deliverables,
      max(a.onboard_date) as last_onboard, max(a.post_date) as last_post,
      min(a.reach_out_date) as ro_from, max(a.reach_out_date) as ro_to
    from allposts a group by a.inf_id
  ),
  stage as (
    select distinct on (a.inf_id) a.inf_id, a.workflow_status
    from allposts a
    order by a.inf_id, coalesce(a.post_date, a.onboard_date, a.reach_out_date, date '1900-01-01') desc, a.is_live desc
  ),
  ctypes as (
    select s.inf_id, string_agg(s.collab_type||': '||s.cnt, ' · ' order by s.collab_type) ct
    from (select inf_id, collab_type, count(*) cnt from allposts where coalesce(collab_type,'')<>'' group by inf_id, collab_type) s
    group by s.inf_id
  ),
  base as (
    select c.inf_id, c.username, c.inf_name, c.followers, c.category, c.profile_pic,
           c.creator_type, c.state, c.instagram_link,
           st.workflow_status as current_stage,
           coalesce(ag.live_cc,0)::int live_cc, coalesce(ag.hist_cc,0)::int hist_cc,
           coalesce(ag.deliverables,0)::int deliverables,
           ag.last_onboard, ag.last_post, ag.ro_from, ag.ro_to, ct.ct
    from creators c
    left join agg ag on ag.inf_id=c.inf_id
    left join stage st on st.inf_id=c.inf_id
    left join ctypes ct on ct.inf_id=c.inf_id
    where (p_search is null or p_search='' or c.username ilike '%'||p_search||'%' or coalesce(c.inf_name,'') ilike '%'||p_search||'%' or c.inf_id ilike '%'||p_search||'%')
      and (p_tier is null or p_tier='' or c.category=p_tier)
      and (p_region is null or p_region='' or c.state=p_region)
      and (p_creator_type is null or p_creator_type='' or c.creator_type=p_creator_type)
      and (p_stage is null or p_stage='' or st.workflow_status=p_stage)
      and (p_reach_from is null or (ag.ro_to is not null and ag.ro_to >= p_reach_from))
      and (p_reach_to is null or (ag.ro_from is not null and ag.ro_from <= p_reach_to))
      and (p_posted_from is null or (ag.last_post is not null and ag.last_post >= p_posted_from))
      and (p_posted_to is null or (ag.last_post is not null and ag.last_post <= p_posted_to))
  )
  select inf_id, username, inf_name, followers, category, profile_pic, creator_type, state, instagram_link,
         current_stage, live_cc, hist_cc, (live_cc+hist_cc) as total_collab_count, deliverables,
         last_onboard, last_post, ro_from, ro_to, ct,
         count(*) over () as total_count
  from base
  order by followers desc nulls last, inf_id
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$function$;

CREATE OR REPLACE FUNCTION public.creator_collab_history(p_inf_id text)
RETURNS TABLE(
  collab_id text, content_type text, post_date date, payment_status text,
  post_link text, source text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(p.collab_id, p.inf_id||'-C'||p.collab_number) as collab_id, p.content_type,
         coalesce(p.post_date, p.onboard_date, p.reach_out_date) as post_date, p.payment_status, p.post_link, 'live' as source
  from posts p where p.inf_id = p_inf_id and (p.collab_id is not null or p.collab_number is not null)
  union all
  select coalesce(h.collab_id, h.inf_id||'-C'||h.collab_number), h.content_type,
         coalesce(h.post_date, h.onboard_date, h.reach_out_date), h.payment_status, h.post_link, 'historic'
  from historic_posts h where h.inf_id = p_inf_id and (h.collab_id is not null or h.collab_number is not null)
  order by 3 desc nulls last;
$function$;
