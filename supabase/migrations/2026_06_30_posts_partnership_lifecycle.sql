-- Partnership (branded-content ad permission) lifecycle on the post.
-- Applied via MCP 2026-06-30. Pairs with the toState() fix in
-- lib/meta-partnership.ts: "Pending Approval" maps to PENDING, not approved
-- (the substring "approv" inside "Approval" was matching first).
alter table public.posts
  add column if not exists partnership_status text,             -- pending | approved | rejected | revoked | none
  add column if not exists partnership_sent_at timestamptz,      -- request sent
  add column if not exists partnership_approved_at timestamptz,  -- request approved
  add column if not exists partnership_declined_at timestamptz;  -- request declined / rejected / revoked

comment on column public.posts.partnership_status is 'Normalized Meta branded-content permission state (pending/approved/rejected/revoked/none). "Pending Approval" is PENDING, not approved.';
comment on column public.posts.partnership_sent_at is 'When the partnership-ad invite was sent to the creator.';
comment on column public.posts.partnership_approved_at is 'When the creator approved the partnership-ad permission.';
comment on column public.posts.partnership_declined_at is 'When the creator declined/rejected (or it was revoked).';
