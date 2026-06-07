-- 2026-05-20 — Campaign planning dates
--
-- Adds optional campaign window fields used by the Campaign sheet mirror,
-- campaign creation form, and existing campaign detail overlay.

alter table public.campaigns
  add column if not exists start_date date,
  add column if not exists end_date date;

comment on column public.campaigns.start_date is
  'Optional campaign planning start date, mirrored to the Campaign sheet.';

comment on column public.campaigns.end_date is
  'Optional campaign planning end date, mirrored to the Campaign sheet.';
