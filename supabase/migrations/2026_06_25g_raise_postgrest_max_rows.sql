-- PostgREST caps every supabase-js fetch at 1000 rows by default (db_max_rows).
-- The analytics aggregate over 7,829 creators + 11,252 historic_posts in JS, so
-- the cap silently truncated them (wrong stages/counts, missing creators).
-- Raise the cap project-wide; reload PostgREST. Applied via MCP 2026-06-25.
alter role authenticator set pgrst.db_max_rows = '100000';
notify pgrst, 'reload config';
