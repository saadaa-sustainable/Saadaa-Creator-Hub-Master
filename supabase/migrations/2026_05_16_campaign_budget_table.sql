-- MOM §3.1 — Campaign Budget storage table
-- One row per budget line. Multiple lines per campaign. Grouped by month_label for monthly views.

create table if not exists public.campaign_budget (
  id                    bigserial primary key,
  campaign_id           text not null references public.campaigns(campaign_id) on delete cascade,
  month_label           text not null,                                       -- 'May 2026'
  tier                  text,                                                 -- 'Nano (1K to 10K)' ...
  collab_type           text,                                                 -- 'Barter' | 'Paid'
  campaign_name         text,                                                 -- segment label (matches form's Campaign Name)
  num_influencers       int  not null default 0,
  avg_comp              numeric(12,2) not null default 0,
  total_cost            numeric(14,2) generated always as (num_influencers * avg_comp) stored,
  min_garments          int  not null default 2,
  max_garments          int  not null default 3,
  est_garment_cost      numeric(12,2) generated always as (max_garments * 900 * 0.6) stored,
  total_with_garments   numeric(14,2) generated always as (
                          (num_influencers * avg_comp) +
                          ((max_garments * 900 * 0.6) * num_influencers)
                        ) stored,
  created_at            timestamptz not null default now()
);

create index if not exists campaign_budget_campaign_idx on public.campaign_budget(campaign_id);
create index if not exists campaign_budget_month_idx    on public.campaign_budget(month_label);

-- Roll-up view: total budget per month
create or replace view public.campaign_budget_monthly as
select
  month_label,
  sum(num_influencers)        as total_creators,
  sum(total_cost)             as total_compensation,
  sum(total_with_garments)    as total_with_garments,
  count(distinct campaign_id) as campaign_count
from public.campaign_budget
group by month_label
order by min(created_at) desc;
