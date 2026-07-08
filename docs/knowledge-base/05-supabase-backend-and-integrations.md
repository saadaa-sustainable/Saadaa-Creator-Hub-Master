# 05 · Supabase Backend & Integrations

> Part of the CreatorHub KB. Last verified 2026-06-07. Documents the two Supabase Edge Functions and the four external integrations. All citations are `file:line` against the live source.

---

## 1. Edge Function — `sync-shopify-orders`

`supabase/functions/sync-shopify-orders/index.ts`

### 1.1 Trigger modes

| Mode | Trigger | Invocation |
|------|---------|------------|
| **BULK** | pg_cron `sync-shopify-orders-3h`, cron `30 */3 * * *` | `net.http_post` → function URL, body `{source:'cron'}` |
| **SINGLE-ORDER (on-demand)** | App-side `fetch` from onboarding | `?order_id=X` query param OR `POST { order_id }` body |

Mode decided in `Deno.serve`: reads `searchParams.get("order_id")`, falls back to JSON body `order_id` on POST → `handleSingleOrder`; otherwise runs bulk.

### 1.2 Secrets (`Deno.env.get`)

| Env var | Default |
|---------|---------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | runtime auto-inject |
| `SHOPIFY_STORE_DOMAIN` | — (503 if missing) |
| `SHOPIFY_ADMIN_API_TOKEN` | — (`read_orders` scope) |
| `SHOPIFY_API_VERSION` | `2024-10` |
| `SHOPIFY_DAYS_BACK` | `14` |
| `SHOPIFY_MAX_PAGES` | `4` |
| `SHOPIFY_ORDER_TAGS` | `inf` (comma-separated OR-match, uppercased) |

### 1.3 External API — Shopify Admin REST

- **Single-order (2026-07-08 fix):** resolves by order **NUMBER**, not internal id. `GET …/orders.json?status=any&name=${clean}&limit=50&fields=${ORDER_FIELDS}` then keeps the exact `order_number === clean` match (internal-id match as fallback). The old `GET /orders/${id}.json` was wrong — the team enters the order NUMBER (e.g. `1444809`, name `#1444809`), but that path expects Shopify's 13-digit internal id (`7143874855158`) and 404'd on every real order, so onboarding always showed "Order not found in Shopify sync" even for tagged influencer orders. `status=any` so paid draft-order conversions resolve too.
- **Bulk:** `GET …/orders.json?status=any&limit=250&updated_at_min=${sinceIso}&fields=${ORDER_FIELDS}`, `sinceIso` = now − `DAYS_BACK`; cursor pagination via `Link` header `rel="next"`.
- **Auth:** `X-Shopify-Access-Token`. **429** → 2s sleep + recursive retry.

### 1.4 Tag validation (the `inf` tag)

`orderHasInfTag` splits `order.tags`, uppercases, checks any of `ORDER_TAGS` (default `["INF"]`).
- Bulk: filters each page before upsert.
- Single-order: **Option B** — if the order does NOT carry the inf tag, it is NOT upserted; returns `{found:true,matched:0,tagged:false,reason:"untagged"}`.

### 1.5 Table write — `shopify_orders` (upsert)

`mapOrder` flattens a Shopify order. `order_id = String(o.id)` is the conflict key. Derives `garments_sent`/`line_skus` from line items, `tracking_id`/`tracking_status`/`delivery_date` from the most-recently-updated fulfillment (delivery only when `shipment_status==="delivered"`), `fulfillment_events.chain` history, refund sums, `synced_at`. Upsert `onConflict:"order_id"`.

### 1.6 Error handling

- Bulk non-OK → `502`; per-page upsert errors collected into `failed[]`; no DB-side retry (next 3-hr tick re-pulls via `updated_at_min`); truncation at `MAX_PAGES` sets `truncated:true`.
- Single: no name match → `{found:false,reason:"not_found"}`; non-OK Shopify → `502`. `lookupShopifyOrder` reads the JSON response and, on `{found:true,tagged:false}`, surfaces a distinct "Order found in Shopify but not tagged 'inf'" message instead of a generic miss.

### 1.7 App invocation of single-order mode (onboarding)

`apps/web/features/onboarding/actions.ts`. Two call sites, identical pattern:
1. **`submitOnboarding`**: reads `shopify_orders` by `order_id`; on miss POSTs `…/functions/v1/sync-shopify-orders?order_id=${orderId}` with `Authorization: Bearer ${SUPABASE_SERVICE_KEY}` + `apikey`, then re-checks. Still not found → onboarding **blocked** + `SHOPIFY_VALIDATION_FAILED` email to the submitting actor.
2. **`lookupShopifyOrder`** (preview): same table-first → on-demand pull → re-check, so preview and submit agree.

---

## 2. Edge Function — `scrape-pending-apify` — ⚠️ REMOVED 2026-06-24

**RIPPED OUT.** Reach Out now fetches LIVE via Meta `business_discovery` on the
Fetch click (`apps/web/lib/meta-graph.ts` + `lib/meta-rate-limit.ts`). Removed: the
edge function (repo dir deleted), the pg_cron `scrape-apify-every-3h`, the
`submitReachOut` `instagram_cache` enqueue, and `APIFY_TOKEN`/`APIFY_ACTOR_ID`.
KEPT: the `instagram_cache` table (still read as an avatar fallback by 5 views — now
static), the `avatars` bucket + `trg_sync_creator_avatar` (existing avatars persist;
new creators get avatars from Meta; the 3-hr *refresh* is gone). Full restore steps:
**`docs/APIFY-REVERT.md`**. The original section below is retained for reference.

`supabase/functions/scrape-pending-apify/index.ts` (deleted — see git history)

### 2.1 Trigger mode

Cron-only: pg_cron `scrape-pending-apify-3h`, `15 */3 * * *`, vault-backed bearer, body `{source:'cron'}`.
> The earlier cron (`2026_05_21_shopify_orders_cron.sql`) shipped a literal `Bearer YOUR_SERVICE_ROLE_KEY_HERE` placeholder; `2026_05_25_fix_cron_service_key.sql` replaced it with a Supabase Vault lookup so both 3-hr jobs authenticate at fire time. (A stray newline in the token once killed the cron for 9 days — keep the token single-line.)

### 2.2 Secrets

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto), `APIFY_TOKEN` (503 if missing), `APIFY_ACTOR_ID` (`apify/instagram-profile-scraper`), `APIFY_MAX_ATTEMPTS` (3), `APIFY_BATCH_SIZE` (20), `META_ADS_SUPABASE_URL`/`_SERVICE_KEY` (optional).

### 2.3 External API — Apify

`callApify`: `POST https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=…` (synchronous run-and-fetch). Input sends both `{usernames}` and `{directUrls}` shapes for actor-version compatibility; results keyed by username/url (lowercased).

### 2.4 Queue + table writes — `instagram_cache`

Reads `status='pending'` rows ordered **`scraped_at` NULLS FIRST** then username (limit BATCH_SIZE, skip `attempts >= MAX_ATTEMPTS`). The NULLS-FIRST order guarantees never-scraped rows (brand-new CSV/lookup-miss enqueues) are always picked before refreshes — without it, alphabetically-late new usernames starved behind front-of-alphabet refresh churn.
- **Stale re-queue (budget-gated):** before draining, count never-scraped backlog (`status='pending' AND scraped_at IS NULL`); compute `requeueBudget = max(0, BATCH_SIZE − backlog)`. Only when `requeueBudget > 0` does it flip stale `status='auto'` rows (>3h old) back to `pending, attempts:0`, capped at `requeueBudget`. **Why the gate:** cron runs every 3h and the stale window is also 3h, so every `auto` row is always "stale"; an ungated re-queue floods the 20-row batch with refreshes and never drains genuine new pending (fixed 2026-06-11, fn v12 — see ch09).
- **On hit:** UPDATE cache (`followers, er, avg_likes, profile_pic(persisted), biography, is_verified, raw_json, status:'auto', attempts:0, scraped_at, updated_at`) + propagate to `creators` (followers, er, avg_likes, profile_pic, verification, category, inf_name) + auto-resolve open `system_errors` (`ig_fetch`/`apify_fail`).
- **On miss:** `attempts++`; flips to `not_found` at the cap; logs `system_errors` type `apify_fail`.

### 2.5 Avatar persistence to Storage

`persistAvatar`: fetches the raw IG signed pic URL, uploads bytes to the public `avatars` bucket at `<username>.<ext>` (`upsert:true`), returns the bucket `publicUrl`; on failure returns null and the caller falls back to the raw IG URL. Rationale: IG signed URLs expire within days and silently break avatars.

### 2.6 post_date backfill from IG shortcodes

`backfillPostDates` runs every tick (even on empty batches): selects ≤500 `posts` where `workflow_status IN ('Posted','Delivered')` and `post_date IS NULL`, decodes `post_link` shortcode → IST date via the bitshift formula `tsMs = (id >> 23) + 1314220021721`, fallback chain shortcode → `onboard_date` → today. Direct port of legacy `shortcodeToDate`.

### 2.7 Payment recompute

`recomputePaymentStates` runs every tick (idempotent, 3 passes): (1) flip `Not Due → Due` when `due_date <= today` (mirror to `posts.payment_status`); (2) heal null `estimated_payable_date` via the 15th/30th cycle; (3) clear `posted_but_not_tested` once the ad becomes tested (`ads_results` non-empty OR present in the Meta Ads warehouse covered set). Today is IST.

---

## 3. Integrations map

### 3.1 Shopify

- **Table:** `shopify_orders` (sole source of truth; sheet mirror removed 2026-05-21).
- **Tag:** `inf` (uppercased `INF`), overridable via `SHOPIFY_ORDER_TAGS`.
- **Onboarding validation flow:** table-first read → on-demand inf-tag-gated single-order edge pull → re-check; un-validated order blocks the save and emails the actor.
- Onboarding consumes the synced row to populate email, address (parsed via `parseShopifyAddress`), tracking, garments, SKUs, `garment_qty`.

### 3.2 Apify

- **Queue table:** `instagram_cache`, `status='pending'` rows.
- **Producers (app-side enqueue):** `reach-out/actions.ts` upserts `{username, status:'pending', attempts:0}` on submit and in `lookupCreator`'s QUEUE branch (returns `source:'queued'` for a fresh handle).
- **Consumer:** `scrape-pending-apify` cron drains the queue, scrapes, writes back. Failures → `system_errors` type `apify_fail` (Error Portal).

### 3.3 Meta Ads warehouse (separate Supabase project)

- Secrets `META_ADS_SUPABASE_URL` / `_SERVICE_KEY`. App helper `lib/supabase/meta-ads.ts`; edge port inside `scrape-pending-apify`.
- **`fetchMetaAdsCoveredPostIds`**: paginates `primary_table` (PAGE=1000, ceiling 200k), filters `ad_name ILIKE '%IFAD%'`, extracts `post_id_short` via `/([A-Z]+-\d+-P\d+)/i`, returns an uppercased `Set`. Empty Set when unconfigured (degrades gracefully). Mirrors legacy `mbSelectAll_`.
- **Ad-tested logic** — `lib/ad-tested.ts` (single source of truth shared by Ad Status + Accounts Hub): `isAdEligible` (non-trivial `ads_usage_rights` OR in warehouse), `isAdTested` (`ads_results` non-empty OR in warehouse), `isPostedButNotTested` (eligible AND not tested).
- Consumers: `accounts-hub/actions.ts` (wraps the warehouse fetch in a 5s `Promise.race` timeout so it never blocks a payment submit; stamps `posted_but_not_tested`); `ad-status/queries.ts` (Winner/ITE/Discarded KPI buckets).
- **Ownership:** the Winner/ITE/Discarded classification + reconciliation logic is owned by Anmol's warehouse — don't change ad rules without sign-off.

### 3.4 Instagram shortcode → post_date decode

`lib/instagram-shortcode.ts` (app-side mirror of the edge decoder):
- `shortcodeToDate`: base64url alphabet, `id = id*64 + idx`, `tsMs = (id >> 23n) + 1314220021721n`, rejects years outside 2010–2099. No API call.
- `extractShortcode`: regex `/instagram\.com\/(?:[^/]+\/)?(?:p|reel|tv|reels)\/([^/?#]+)/i`.
- `postDateFromUrl`: URL → IST `yyyy-MM-dd`. IST chosen because operators are in India and IG displays viewer-local dates.

---

## 4. Quick reference — cron jobs

| Job | Cron | Function URL | Auth |
|-----|------|--------------|------|
| `scrape-pending-apify-3h` | `15 */3 * * *` | `…/functions/v1/scrape-pending-apify` | Vault `supabase_service_role_key` bearer |
| `sync-shopify-orders-3h` | `30 */3 * * *` | `…/functions/v1/sync-shopify-orders` | Vault `supabase_service_role_key` bearer |

On-demand single-order Shopify calls from onboarding authenticate with `SUPABASE_SERVICE_KEY` as both `Authorization: Bearer` and `apikey`.
