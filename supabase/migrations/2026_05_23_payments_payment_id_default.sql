-- Drop legacy GAS payment_id column — not used by new stack.
alter table public.payments drop column if exists payment_id;
