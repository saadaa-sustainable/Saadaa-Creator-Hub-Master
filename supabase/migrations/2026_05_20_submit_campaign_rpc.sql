-- ============================================================================
-- 2026-05-20 — submit_campaign RPC
--
-- Atomic campaign creation. Replaces LockService + bespoke IFC{NNN} gen in
-- legacy InfluencerBackend.js#submitCampaign + #generateCampaignId_.
--
-- Behavior (legacy parity):
--   1. Generates IFC{NNN} via MAX(campaign_num)+1 under advisory lock.
--   2. Computes total_budget = SUM(num_influencers * avg_comp) across rows.
--   3. INSERTs into `campaigns` + N rows into `campaign_budget`.
--   4. Returns campaign_id + campaign_num + total_budget.
--
-- Caller passes:
--   p_form         jsonb  — campaign_name, key_message, brief_link,
--                           internal_brief_link, no_of_creators, brand,
--                           description, start_date, end_date
--   p_budget_rows  jsonb  — array of { tier, collab_type, campaign_name,
--                           num_influencers, avg_comp, min_garments,
--                           max_garments, est_garment_cost }
--   p_month_label  text   — "May 2026"
-- ============================================================================

create or replace function public.submit_campaign(
  p_form         jsonb,
  p_budget_rows  jsonb,
  p_month_label  text
)
returns table (
  campaign_id   text,
  campaign_num  int,
  total_budget  numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_max_num         int;
  v_campaign_num    int;
  v_campaign_id     text;
  v_campaign_name   text := nullif(btrim(p_form->>'campaign_name'), '');
  v_key_message     text := nullif(btrim(p_form->>'key_message'), '');
  v_start_date      date := nullif(btrim(coalesce(p_form->>'start_date', '')), '')::date;
  v_end_date        date := nullif(btrim(coalesce(p_form->>'end_date', '')), '')::date;
  v_brief_link      text := nullif(btrim(p_form->>'brief_link'), '');
  v_internal_brief  text := nullif(btrim(p_form->>'internal_brief_link'), '');
  v_no_creators     text := nullif(btrim(p_form->>'no_of_creators'), '');
  v_total_budget    numeric := 0;
  v_row             jsonb;
  v_allocated       int := 0;
begin
  -- Validation (legacy parity).
  if v_campaign_name is null then
    raise exception 'submit_campaign: campaign_name required';
  end if;
  if v_key_message is null then
    raise exception 'submit_campaign: key_message required';
  end if;
  if v_brief_link is null then
    raise exception 'submit_campaign: brief_link required';
  end if;
  if v_start_date is not null and v_end_date is not null and v_end_date < v_start_date then
    raise exception 'submit_campaign: end_date must be on or after start_date';
  end if;
  if jsonb_array_length(coalesce(p_budget_rows, '[]'::jsonb)) = 0 then
    raise exception 'submit_campaign: at least one budget row required';
  end if;

  -- Allocated influencers + total_budget = compensation + garment cost.
  -- Garment cost per row = num × max_g × 900 × 0.6 (Tracker formula).
  for v_row in select * from jsonb_array_elements(p_budget_rows) loop
    v_allocated    := v_allocated + coalesce((v_row->>'num_influencers')::int, 0);
    v_total_budget := v_total_budget
      + (coalesce((v_row->>'num_influencers')::int, 0)
         * coalesce((v_row->>'avg_comp')::numeric, 0))
      + (coalesce((v_row->>'num_influencers')::int, 0)
         * coalesce((v_row->>'max_garments')::int, 3) * 900 * 0.6);
  end loop;

  if v_allocated = 0 then
    raise exception 'submit_campaign: allocate at least one influencer across budget lines';
  end if;

  -- Serialise campaign_num generation across concurrent submits.
  perform pg_advisory_xact_lock(hashtext('submit_campaign:counter'));

  select coalesce(max(campaigns.campaign_num), 0) + 1 into v_campaign_num from campaigns;
  v_campaign_id := 'IFC' || lpad(v_campaign_num::text, 3, '0');

  insert into campaigns (
    campaign_id, campaign_num, campaign_name, key_message,
    start_date, end_date,
    brief_link, internal_brief_link, no_of_creators,
    total_budget, status, created_at, updated_at
  ) values (
    v_campaign_id, v_campaign_num, v_campaign_name, v_key_message,
    v_start_date, v_end_date,
    v_brief_link, v_internal_brief, v_no_creators,
    v_total_budget, 'active', now(), now()
  );

  -- Insert budget rows. NOTE: est_garment_cost, total_cost, total_with_garments
  -- are GENERATED columns in the live schema — Postgres rejects explicit values
  -- for them. Only insert raw inputs; let the DB compute derived totals.
  insert into campaign_budget (
    campaign_id, month_label, tier, collab_type, campaign_name,
    num_influencers, avg_comp,
    min_garments, max_garments,
    created_at
  )
  select
    v_campaign_id,
    p_month_label,
    r->>'tier',
    r->>'collab_type',
    r->>'campaign_name',
    coalesce((r->>'num_influencers')::int, 0),
    coalesce((r->>'avg_comp')::numeric, 0),
    coalesce((r->>'min_garments')::int, 2),
    coalesce((r->>'max_garments')::int, 3),
    now()
  from jsonb_array_elements(p_budget_rows) as r;

  return query
  select v_campaign_id, v_campaign_num, v_total_budget;
end;
$$;

comment on function public.submit_campaign is
  'Atomic campaign creation. Generates IFC{NNN}, inserts campaigns + campaign_budget rows. Replaces legacy GAS submitCampaign + generateCampaignId_.';

grant execute on function public.submit_campaign(jsonb, jsonb, text) to service_role;
