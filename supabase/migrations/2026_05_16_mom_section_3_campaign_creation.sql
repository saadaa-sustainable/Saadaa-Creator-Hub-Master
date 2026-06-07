-- MOM 12-May-2026 §3 Campaign Creation
-- Run in Supabase SQL editor before/after clasp deploy.
-- All ALTERs are IDEMPOTENT (IF NOT EXISTS). Safe to re-run.

alter table campaigns add column if not exists campaign_num     int;
alter table campaigns add column if not exists name_identifier  text;
alter table campaigns add column if not exists total_budget     numeric;
-- Note: budget_json removed — normalized rows live in `campaign_budget` table
-- (see 2026_05_16_campaign_budget_table.sql + 2026_05_16_flatten_json_columns.sql).

create unique index if not exists campaigns_campaign_num_idx     on campaigns(campaign_num);
create unique index if not exists campaigns_name_identifier_idx  on campaigns(name_identifier);

-- Optional: backfill campaign_num from existing campaign_id rows that already follow
-- a numeric-prefix pattern (e.g. C01 → 1, 12_HOLIBLUSH-012 → 12). Skip if unsure.
-- update campaigns
--   set campaign_num = nullif(regexp_replace(campaign_id, '[^0-9].*', ''), '')::int
--   where campaign_num is null;
