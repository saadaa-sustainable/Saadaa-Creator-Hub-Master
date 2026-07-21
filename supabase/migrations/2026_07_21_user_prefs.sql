-- ============================================================================
-- 2026-07-21 — Per-user preference store (first use: reach-out sticky pins)
--
-- Generic (email, key) → jsonb store for small per-user UI preferences that
-- must follow the user across devices (localStorage is per-browser). First
-- consumer: the outbound reach-out "pin" toggles — key 'reachout_pins',
-- value {"campaignId": "IFC003", "gender": "Male", "contentType": "UGC"}
-- (presence of a field = pin ON). Written only via server actions with the
-- service role; RLS enabled with no policies (anon/authenticated locked out),
-- matching the email_logs pattern.
-- ============================================================================

create table if not exists public.user_prefs (
  email text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (email, key)
);

alter table public.user_prefs enable row level security;
revoke all on public.user_prefs from anon, authenticated;

comment on table public.user_prefs is
  'Per-user UI preferences (service-role only). key=reachout_pins holds the outbound reach-out sticky pre-selection pins.';
