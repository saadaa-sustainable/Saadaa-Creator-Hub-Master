# Historic Data migration scripts

One-off utilities for the `historic_creator_data` archive table (legacy
"Influencer Tracker" sheet → Supabase). Both read the Supabase service key
from `apps/web/.env.local` automatically — no secrets in the scripts.

## `migrate_historic.py`
Downloads the Creator Data tab as CSV, maps the 48 source columns
(A–AV minus AM + "Historic ReachOut"), truncates and bulk-loads
`historic_creator_data`. Re-run any time to refresh (truncate + reload).

```bash
python3 scripts/historic-migration/migrate_historic.py
```

## `resolve_ig_ids.py`
Backfills `historic_creator_data.profile_id` (legacy IG numeric id) using
Instagram's **free** public `web_profile_info` endpoint — no Apify, no cost.
Matches each row's username/ig_handle, resolves the numeric id, writes it to
the DB row-by-row.

IG rate-limits by IP (~85 calls/burst), so it's **throttled + resumable**:
progress lives in the DB (`profile_id IS NULL` drives the work-list) and a
`/tmp/ig_id_cache.json` cache. If IG blocks, it cools down (default 15 min)
and retries; if killed, just re-run — it continues.

```bash
# slow-trickle defaults (pace 25s, 900s cooldown on block)
python3 scripts/historic-migration/resolve_ig_ids.py
# knobs: PACE=25 BLOCK_COOLDOWN=900 BLOCK_RETRIES=6 LIMIT=0
```

> Why free endpoint, not Apify: the Apify free account has a $5/mo cap shared
> with the operational 3-hr scrape cron; a ~7.6k-handle bulk job would blow it
> (~$20) and starve the cron. See changelog 2026-06-15.
