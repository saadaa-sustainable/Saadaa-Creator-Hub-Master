-- MOM §4 follow-up — flatten JSONB operational columns
-- Replaces commercial_breakup_json (jsonb) with 3 numeric columns.
-- Drops campaigns.budget_json (normalized data lives in campaign_budget table).
-- Idempotent.

-- 1) posts.commercial_breakup_json → flat columns ────────────────────────────
alter table public.posts
  add column if not exists commercial_reel_rate  numeric(12,2),
  add column if not exists commercial_post_rate  numeric(12,2),
  add column if not exists commercial_story_rate numeric(12,2);

-- Backfill from existing jsonb (if column still present)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts'
      and column_name = 'commercial_breakup_json'
  ) then
    update public.posts
    set commercial_reel_rate  = coalesce(commercial_reel_rate,  (commercial_breakup_json->>'reel_rate')::numeric),
        commercial_post_rate  = coalesce(commercial_post_rate,  (commercial_breakup_json->>'post_rate')::numeric),
        commercial_story_rate = coalesce(commercial_story_rate, (commercial_breakup_json->>'story_rate')::numeric)
    where commercial_breakup_json is not null;
  end if;
end$$;

-- Recreate inbound queue view to reference flat columns
drop view if exists public.inbound_reachout_queue;
create or replace view public.inbound_reachout_queue as
select
  p.post_id,
  p.inf_id,
  p.username,
  p.campaign_id,
  p.content_type,
  p.reach_out_date,
  p.commercial_reel_rate,
  p.commercial_post_rate,
  p.commercial_story_rate,
  p.creator_brief_link,
  c.inf_name,
  c.followers
from public.posts p
left join public.creators c on c.inf_id = p.inf_id
where p.reachout_direction = 'inbound'
  and p.workflow_status = 'Reach Out'
order by p.reach_out_date desc nulls last;

-- Now safe to drop the jsonb column
alter table public.posts drop column if exists commercial_breakup_json;

-- 2) campaigns.budget_json → drop ───────────────────────────────────────────
-- Normalized rows live in campaign_budget; keep total_budget summary col.
alter table public.campaigns drop column if exists budget_json;
