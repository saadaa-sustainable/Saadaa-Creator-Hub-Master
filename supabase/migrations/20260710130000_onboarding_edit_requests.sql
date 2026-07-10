-- Onboarding edit requests — an edit to a submitted onboarding is HELD for admin
-- approval instead of applied directly. While a request is pending, posting for
-- the whole collab is blocked. On approval the `after` snapshot is applied to
-- every deliverable of the collab; on rejection it is discarded.

create table if not exists public.onboarding_edit_requests (
  id            bigint generated always as identity primary key,
  collab_id     text not null,
  post_id       text,
  inf_id        text,
  requested_by       text,
  requested_by_name  text,
  reason        text,
  before        jsonb not null default '{}'::jsonb,
  after         jsonb not null default '{}'::jsonb,
  status        text not null default 'Pending Approval'
                  check (status in ('Pending Approval', 'Approved', 'Rejected')),
  decided_by       text,
  decided_by_name  text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- At most one pending edit per collab (keeps the posting gate + approvals simple).
create unique index if not exists onboarding_edit_requests_one_pending_idx
  on public.onboarding_edit_requests (collab_id)
  where status = 'Pending Approval';

create index if not exists onboarding_edit_requests_status_idx
  on public.onboarding_edit_requests (status, created_at desc);

comment on table public.onboarding_edit_requests is
  'Held onboarding edits awaiting Global-Admin approval. Pending blocks posting for the collab; approval applies `after` to every deliverable.';
