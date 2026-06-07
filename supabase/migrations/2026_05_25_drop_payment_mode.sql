-- ============================================================================
-- 2026-05-25 — Drop unused payment_mode column from payments
--
-- Field was never populated by the new-stack form (legacy carryover) and
-- adds noise to schema introspection / type generation. Idempotent.
-- ============================================================================

alter table public.payments
  drop column if exists payment_mode;
