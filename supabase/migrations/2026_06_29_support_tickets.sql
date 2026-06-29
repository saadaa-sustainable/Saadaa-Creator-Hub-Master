-- Issue Desk — support/issue tickets. Anyone authenticated raises one (title,
-- details, category, priority, optional linked CreatorHub entity); admins
-- resolve with status + notes. ticket_no auto-derives from the identity id.
-- Applied via MCP 2026-06-29.
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_no text GENERATED ALWAYS AS ('TKT-' || lpad(id::text, 5, '0')) STORED,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('workflow','access','data','bug','suggestion','other')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  requester_email text,
  requester_name text,
  requester_role text,
  source_path text,
  assigned_admin_email text,
  admin_note text,
  resolution text,
  last_admin_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON public.support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_requester_idx ON public.support_tickets (requester_email);

CREATE OR REPLACE FUNCTION public.touch_support_tickets_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
begin new.updated_at := now(); return new; end;
$fn$;
DROP TRIGGER IF EXISTS trg_support_tickets_touch ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_tickets_updated_at();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_tickets FROM anon, authenticated;
