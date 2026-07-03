-- Campaign edit approvals. New campaigns already use campaigns.status =
-- 'Pending Approval'; edits need their own pending payload so live campaign
-- rows are not mutated before admin sign-off.
CREATE TABLE IF NOT EXISTS public.campaign_approval_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_type text NOT NULL DEFAULT 'edit',
  campaign_id text NOT NULL REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Pending Approval',
  requested_by_email text,
  requested_by_name text,
  request_payload jsonb NOT NULL,
  before_payload jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by_email text,
  decided_by_name text,
  decision_notes text,
  CONSTRAINT campaign_approval_requests_type_chk
    CHECK (request_type IN ('edit')),
  CONSTRAINT campaign_approval_requests_status_chk
    CHECK (status IN ('Pending Approval', 'Approved', 'Rejected'))
);

CREATE INDEX IF NOT EXISTS campaign_approval_requests_created_idx
  ON public.campaign_approval_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS campaign_approval_requests_campaign_idx
  ON public.campaign_approval_requests (campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_approval_requests_one_pending_edit_idx
  ON public.campaign_approval_requests (campaign_id, request_type)
  WHERE status = 'Pending Approval';

ALTER TABLE public.campaign_approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_approval_requests FROM anon, authenticated;

