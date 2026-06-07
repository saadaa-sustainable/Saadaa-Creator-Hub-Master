-- 2026-05-23 — payments: add collab tracking columns
-- collab_number + deliverable_index mirror the posts table columns so
-- the accounts team can trace which deliverable episode a payment covers,
-- even without joining back to posts.
alter table public.payments
  add column if not exists collab_number    integer,
  add column if not exists deliverable_index integer;
