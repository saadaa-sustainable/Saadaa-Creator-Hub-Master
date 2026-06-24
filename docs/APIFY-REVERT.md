# Apify rip-out — how to revert (2026-06-24)

Reach Out profile fetching moved from **Apify (3-hr cron)** to **Meta
`business_discovery` live on the Fetch click** (`apps/web/lib/meta-graph.ts` +
`lib/meta-rate-limit.ts`). This doc records exactly what was removed so it can be
restored if Meta ever stops being viable.

## What was REMOVED

1. **pg_cron job** `scrape-apify-every-3h` (jobid 9, schedule `0 */3 * * *`) —
   unscheduled via `select cron.unschedule('scrape-apify-every-3h');`.
2. **Edge function** `supabase/functions/scrape-pending-apify/` — deleted from the
   repo (recover from git history: the commit before this one). The **deployed**
   function may still exist dormant in the Supabase dashboard (Functions →
   scrape-pending-apify) — delete it there if you want it fully gone; it is never
   invoked now that the cron is unscheduled.
3. **Enqueue** in `submitReachOut` (`apps/web/features/reach-out/actions.ts`) — the
   `instagram_cache` `status='pending'` upsert that fed the cron.
4. **Env keys** `APIFY_TOKEN`, `APIFY_ACTOR_ID` — removed from
   `apps/web/lib/env.server.ts` (and can be removed from `.env.local`).

## What was KEPT (do NOT assume gone)

- **`instagram_cache` table** — still READ as an avatar/profile_pic fallback by
  order-status, offboarding, ad-status, posting, onboarding queries + the Sheet
  View tab. It just no longer gets new rows. Dropping it would break those reads.
- **`avatars` storage bucket** + trigger **`trg_sync_creator_avatar`** — untouched.
  Existing avatars persist. NEW creators get their avatar from Meta
  (`profile_picture_url`) at Fetch time. The only thing lost is the 3-hr *refresh*
  of existing avatars/followers.
- **`apify_fail` / `ig_fetch`** handling in the Error Portal — left in place for
  any historical rows. New Reach Out failures log `meta_fetch_failed` /
  `meta_profile_unavailable` instead.

## How to RESTORE Apify

1. Re-add to `.env.local` + the zod schema in `apps/web/lib/env.server.ts`:
   ```
   APIFY_TOKEN     = <apify api token>
   APIFY_ACTOR_ID  = apify/instagram-profile-scraper
   ```
2. Restore the edge function from git and redeploy:
   ```
   git checkout <this-commit>^ -- supabase/functions/scrape-pending-apify/
   supabase functions deploy scrape-pending-apify
   ```
3. Restore the `submitReachOut` enqueue (search the file for the
   "Apify enqueue removed 2026-06-24" marker and reinstate the
   `instagram_cache` pending upsert that was there).
4. Re-schedule the cron (bearer read from vault, like `sync-shopify-orders-3h`):
   ```sql
   select cron.schedule(
     'scrape-apify-every-3h', '0 */3 * * *',
     $$select net.http_post(
        url := 'https://xynyvbagcudjrzklwnqp.supabase.co/functions/v1/scrape-pending-apify',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                         where name='supabase_service_role_key')))$$);
   ```
5. (Optional) Re-add the Apify lookup tiers to `lookupCreator` — but the Meta path
   supersedes them; only do this if reverting Meta entirely.
