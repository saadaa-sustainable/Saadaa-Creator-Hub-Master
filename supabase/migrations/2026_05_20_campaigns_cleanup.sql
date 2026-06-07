-- 2026-05-20 — Drop unused campaign columns
--
-- These were either:
--   - reinvented during the new-stack rewrite and removed before ship (brand, description)
--   - made redundant by total_budget (budget)
--   - explicitly removed from UI per user request (name_identifier)
--
-- Idempotent. All four are nullable and never populated by current writers.

alter table public.campaigns
  drop column if exists name_identifier,
  drop column if exists brand,
  drop column if exists description,
  drop column if exists budget;
