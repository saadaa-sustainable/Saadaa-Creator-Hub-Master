-- ============================================================================
-- 2026-06-06 — Offboarding terminal workflow status (Wave 9, req #7 / D11)
--
-- FINDING: posts.workflow_status is a TEXT column guarded by a CHECK
-- constraint named `posts_workflow_status_check` — it is NOT a Postgres ENUM.
-- Therefore we extend the domain by DROPPING and RE-ADDING the check
-- constraint with 'Offboarding' appended to the allowed set. (If it had been
-- an enum we'd have used `ALTER TYPE ... ADD VALUE 'Offboarding'`, which
-- cannot run inside a transaction block and is irreversible.)
--
-- The constraint is recreated verbatim from the live definition, with the new
-- value added. This is purely ADDITIVE — every previously-allowed value is
-- preserved, so no existing row can violate the new constraint.
--
-- "Offboarding" is a terminal state: a collab parked here is no longer in the
-- active fulfillment pipeline, but it stays visible in Accounts Hub until the
-- creator is fully paid. Transition is manual and gated to the
-- `offboarding_write` permission (admins, incl. Tanvi, hold it).
-- ============================================================================

alter table public.posts
  drop constraint if exists posts_workflow_status_check;

alter table public.posts
  add constraint posts_workflow_status_check
  check (
    workflow_status = any (array[
      'Reach Out'::text,
      'On Board'::text,
      'Posted'::text,
      'Delivered'::text,
      'RTO'::text,
      'Cancelled'::text,
      'Cancelled After RTO'::text,
      'Offboarding'::text,
      'Reached Out'::text,
      'Interested'::text,
      'Negotiating'::text,
      'Onboarded'::text,
      'Order Placed'::text,
      'Rejected'::text,
      'Ghosted'::text,
      'On Hold'::text
    ])
  );
