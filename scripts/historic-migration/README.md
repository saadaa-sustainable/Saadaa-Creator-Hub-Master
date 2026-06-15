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

> Free-endpoint reality: IG hard-throttles a single IP (~85 calls/burst), so the
> free path is slow (days). It's kept for small/zero-cost top-ups.

## `apify_resolve_ids.py` (the method actually used)
Same `profile_id` backfill, but via the Apify `instagram-profile-scraper`,
**rotating across multiple free Apify accounts**. Each free account has ~$5
(~1,920 profiles); the script uses token #1 until that account's credit is
exhausted (Apify returns a quota/payment error), then rotates to the next.
4 accounts ≈ 7,680 profiles → covers the whole historic set fast, no IG throttle.

Tokens live in `apps/web/.env.local` (gitignored) as `APIFY_TOKEN_1..N`
(or a comma-separated `APIFY_TOKENS=`). Resumable: work-list = rows where
`profile_id IS NULL`, so a re-run continues. Misses (left NULL) are mangled
source handles or dead/renamed accounts — neither Apify nor IG can resolve those.

```bash
python3 scripts/historic-migration/apify_resolve_ids.py
# knobs: BATCH=50  ACTOR=apify~instagram-profile-scraper  LIMIT=0
```

> Note: the operational 3-hr scrape cron uses its own separate Apify token
> (Supabase secret) — this bulk job uses the 4 free-account tokens, so it does
> not touch the cron's budget.
