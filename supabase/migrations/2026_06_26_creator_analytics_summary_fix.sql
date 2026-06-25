-- ============================================================================
-- Creator Analytics performance fix — precomputed summary cache.
--
-- PROBLEM: the first cut of creator_analytics_page() aggregated posts ∪
-- historic_posts (11k rows) per request. Its `allposts` CTE is referenced 3×
-- (agg + stage + ctypes), so Postgres materialized it once with NO stats/indexes
-- and, under PostgREST's GENERIC plan (params not folded to constants), chose a
-- catastrophic distinct/join plan → ~85s → PostgREST statement-timeout (500
-- "57014 canceling statement due to statement timeout"). The dashboard "creators"
-- tab showed "Couldn't load the dashboard". (`NOT MATERIALIZED` fixed the direct
-- call to ~90ms but NOT the generic parameterized call, which still timed out.)
--
-- FIX: maintain a per-creator aggregate cache (creator_analytics_summary), kept
-- fresh by INCREMENTAL triggers on posts/historic_posts (recompute only the
-- affected inf_ids — ~8ms for the common single-creator write). The page RPC then
-- becomes a plain creators→summary LEFT JOIN with filter/sort/window/limit over
-- 7.8k rows: plan-stable and <120ms regardless of params.
-- ============================================================================

-- ── cache table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_analytics_summary (
  inf_id text PRIMARY KEY,
  live_collab_count integer NOT NULL DEFAULT 0,
  historic_collab_count integer NOT NULL DEFAULT 0,
  deliverable_count integer NOT NULL DEFAULT 0,
  current_stage text,
  collab_types text,
  last_onboard_date date,
  last_post_date date,
  reach_out_from date,
  reach_out_to date
);

ALTER TABLE public.creator_analytics_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_analytics_summary FROM anon, authenticated;

-- ── full rebuild (manual / initial / post-bulk-ingest) ──────────────────────
-- Parameterless → NOT MATERIALIZED inlines (index scans) → ~190ms over all rows.
CREATE OR REPLACE FUNCTION public.refresh_creator_analytics_summary()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  with allposts as not materialized (
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
  computed as (
    select ag.inf_id, coalesce(ag.live_cc,0)::int live_cc, coalesce(ag.hist_cc,0)::int hist_cc,
           coalesce(ag.deliverables,0)::int deliverables, st.workflow_status current_stage,
           ct.ct collab_types, ag.last_onboard, ag.last_post, ag.ro_from, ag.ro_to
    from agg ag left join stage st on st.inf_id=ag.inf_id left join ctypes ct on ct.inf_id=ag.inf_id
  )
  merge into creator_analytics_summary t using computed c on t.inf_id=c.inf_id
  when matched then update set
    live_collab_count=c.live_cc, historic_collab_count=c.hist_cc, deliverable_count=c.deliverables,
    current_stage=c.current_stage, collab_types=c.collab_types, last_onboard_date=c.last_onboard,
    last_post_date=c.last_post, reach_out_from=c.ro_from, reach_out_to=c.ro_to
  when not matched then insert
    (inf_id, live_collab_count, historic_collab_count, deliverable_count, current_stage,
     collab_types, last_onboard_date, last_post_date, reach_out_from, reach_out_to)
    values (c.inf_id, c.live_cc, c.hist_cc, c.deliverables, c.current_stage, c.collab_types,
            c.last_onboard, c.last_post, c.ro_from, c.ro_to);
  delete from creator_analytics_summary t
  where not exists (select 1 from posts p where p.inf_id=t.inf_id)
    and not exists (select 1 from historic_posts h where h.inf_id=t.inf_id);
end;
$function$;

-- ── incremental rebuild for a set of inf_ids (the trigger path) ─────────────
CREATE OR REPLACE FUNCTION public.refresh_creator_analytics_summary_for(p_ids text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  with allposts as not materialized (
    select p.inf_id, p.collab_id, p.collab_number, p.workflow_status, p.collab_type,
           coalesce(p.reels,0)+coalesce(p.static_posts,0)+coalesce(p.stories,0) as deliv,
           p.reach_out_date, p.onboard_date, p.post_date, 1 as is_live
    from posts p where p.inf_id = any(p_ids)
    union all
    select h.inf_id, h.collab_id, h.collab_number, h.workflow_status, h.collab_type,
           0, h.reach_out_date, h.onboard_date, h.post_date, 0
    from historic_posts h where h.inf_id = any(p_ids)
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
  computed as (
    select ag.inf_id, coalesce(ag.live_cc,0)::int live_cc, coalesce(ag.hist_cc,0)::int hist_cc,
           coalesce(ag.deliverables,0)::int deliverables, st.workflow_status current_stage,
           ct.ct collab_types, ag.last_onboard, ag.last_post, ag.ro_from, ag.ro_to
    from agg ag left join stage st on st.inf_id=ag.inf_id left join ctypes ct on ct.inf_id=ag.inf_id
  )
  merge into creator_analytics_summary t using computed c on t.inf_id=c.inf_id
  when matched then update set
    live_collab_count=c.live_cc, historic_collab_count=c.hist_cc, deliverable_count=c.deliverables,
    current_stage=c.current_stage, collab_types=c.collab_types, last_onboard_date=c.last_onboard,
    last_post_date=c.last_post, reach_out_from=c.ro_from, reach_out_to=c.ro_to
  when not matched then insert
    (inf_id, live_collab_count, historic_collab_count, deliverable_count, current_stage,
     collab_types, last_onboard_date, last_post_date, reach_out_from, reach_out_to)
    values (c.inf_id, c.live_cc, c.hist_cc, c.deliverables, c.current_stage, c.collab_types,
            c.last_onboard, c.last_post, c.ro_from, c.ro_to);
  delete from creator_analytics_summary t
  where t.inf_id = any(p_ids)
    and not exists (select 1 from posts p where p.inf_id=t.inf_id)
    and not exists (select 1 from historic_posts h where h.inf_id=t.inf_id);
end;
$function$;

-- ── triggers: INSERT/DELETE share one fn; UPDATE needs both transition tables ─
CREATE OR REPLACE FUNCTION public.trg_cas_ins_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v text[];
begin
  select array_agg(distinct inf_id) into v from d_chg where inf_id is not null;
  perform refresh_creator_analytics_summary_for(v);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_cas_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v text[];
begin
  select array_agg(distinct inf_id) into v
  from (select inf_id from d_new union select inf_id from d_old) u where inf_id is not null;
  perform refresh_creator_analytics_summary_for(v);
  return null;
end;
$function$;

DROP TRIGGER IF EXISTS cas_posts_ins ON public.posts;
DROP TRIGGER IF EXISTS cas_posts_del ON public.posts;
DROP TRIGGER IF EXISTS cas_posts_upd ON public.posts;
CREATE TRIGGER cas_posts_ins AFTER INSERT ON public.posts
  REFERENCING NEW TABLE AS d_chg FOR EACH STATEMENT EXECUTE FUNCTION trg_cas_ins_del();
CREATE TRIGGER cas_posts_del AFTER DELETE ON public.posts
  REFERENCING OLD TABLE AS d_chg FOR EACH STATEMENT EXECUTE FUNCTION trg_cas_ins_del();
CREATE TRIGGER cas_posts_upd AFTER UPDATE ON public.posts
  REFERENCING NEW TABLE AS d_new OLD TABLE AS d_old FOR EACH STATEMENT EXECUTE FUNCTION trg_cas_upd();

DROP TRIGGER IF EXISTS cas_hist_ins ON public.historic_posts;
DROP TRIGGER IF EXISTS cas_hist_del ON public.historic_posts;
DROP TRIGGER IF EXISTS cas_hist_upd ON public.historic_posts;
CREATE TRIGGER cas_hist_ins AFTER INSERT ON public.historic_posts
  REFERENCING NEW TABLE AS d_chg FOR EACH STATEMENT EXECUTE FUNCTION trg_cas_ins_del();
CREATE TRIGGER cas_hist_del AFTER DELETE ON public.historic_posts
  REFERENCING OLD TABLE AS d_chg FOR EACH STATEMENT EXECUTE FUNCTION trg_cas_ins_del();
CREATE TRIGGER cas_hist_upd AFTER UPDATE ON public.historic_posts
  REFERENCING NEW TABLE AS d_new OLD TABLE AS d_old FOR EACH STATEMENT EXECUTE FUNCTION trg_cas_upd();

REVOKE EXECUTE ON FUNCTION public.refresh_creator_analytics_summary() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_creator_analytics_summary_for(text[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_cas_ins_del() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_cas_upd() FROM public, anon, authenticated;

-- ── page RPC now reads the cache (same signature + return shape as before) ──
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with base as (
    select c.inf_id, c.username, c.inf_name, c.followers, c.category, c.profile_pic,
           c.creator_type, c.state, c.instagram_link,
           s.current_stage,
           coalesce(s.live_collab_count,0) as live_cc,
           coalesce(s.historic_collab_count,0) as hist_cc,
           coalesce(s.deliverable_count,0) as deliverables,
           s.last_onboard_date, s.last_post_date, s.reach_out_from, s.reach_out_to,
           s.collab_types
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
         count(*) over () as total_count
  from base
  order by followers desc nulls last, inf_id
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$function$;

-- initial populate
SELECT public.refresh_creator_analytics_summary();
