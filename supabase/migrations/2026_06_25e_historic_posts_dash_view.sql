-- View so the dashboard's POSTS_COLS_EXTENDED select resolves over historic_posts.
-- Aliases the dashboard columns historic_posts lacks (+ ads_status) as typed NULLs.
-- Deliverable counts + ad winners read 0 for the archive by design. Powers the
-- Historic Analytics sidebar tab. Applied via MCP 2026-06-25.
create or replace view public.historic_posts_dash as
select h.*,
  null::int as reels, null::int as static_posts, null::int as stories,
  null::text as partnership_id, null::boolean as ad_partnership_valid, null::text as ads_usage_rights,
  null::timestamptz as collab_email_sent_at, null::boolean as collab_email_skipped, null::text as ads_status
from public.historic_posts h;
