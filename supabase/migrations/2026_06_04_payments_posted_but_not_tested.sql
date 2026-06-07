-- 2026_06_04_payments_posted_but_not_tested.sql
-- Feature: payment "posted but not tested" flag.
--
-- Marks a payment whose paid post is an ad-eligible deliverable that had NOT
-- yet been tested as an ad at the moment the payment was logged. Mirrors the
-- Ad Status view's tested/untested classification:
--   tested      = ads_results non-empty OR post_id_short in the Meta Ads warehouse
--   ad-eligible = ads_usage_rights non-trivial OR in the warehouse
--
-- Stamped at payment-submit (features/accounts-hub/actions.ts#submitPayments).
-- Auto-cleared by recomputePaymentStates once the ad becomes tested. Payment
-- is never blocked by this flag — it is an annotation only.

alter table public.payments
  add column if not exists posted_but_not_tested boolean not null default false;

comment on column public.payments.posted_but_not_tested is
  'True when the paid post is an ad-eligible deliverable (ads_usage_rights set or present in the Meta Ads warehouse) that was NOT yet tested as an ad at payment time. Annotation only — never blocks payment. Cleared by recomputePaymentStates when the ad becomes tested.';
