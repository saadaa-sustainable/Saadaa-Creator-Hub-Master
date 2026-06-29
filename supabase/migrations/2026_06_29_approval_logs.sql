-- Approvals audit trail. The Approvals page gates NEW campaigns: they land as
-- 'Pending Approval' and an admin approves (→ active) or rejects (→ 'Rejected').
-- Each decision writes a row here, which also feeds the Audit Log. Applied via
-- MCP 2026-06-29.
CREATE TABLE IF NOT EXISTS public.approval_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_type text NOT NULL,           -- 'Campaign' (extensible: Shoot/Edit/…)
  action text NOT NULL,                -- 'Approved' | 'Rejected'
  entity_id text NOT NULL,             -- campaign_id
  version_id text,
  admin_email text,
  admin_name text,
  notes text,
  timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approval_logs_ts_idx ON public.approval_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS approval_logs_entity_idx ON public.approval_logs (entity_id);
ALTER TABLE public.approval_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.approval_logs FROM anon, authenticated;
