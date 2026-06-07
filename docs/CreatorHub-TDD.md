# CreatorHub — Technical Design Document

_Influencer Management Platform · Next.js 15 + Supabase + Vercel · Saadaa Sustainable Designs & Technologies_


> Supersedes the legacy Google Apps Script TDD. Reconciled against the current codebase (`apps/web`) and live Supabase schema.


## Contents

1. System Architecture, Stack & Deployment
2. Supabase Schema
3. RBAC & Authentication
4. ID Generation, Workflow Stages & Pipeline
5. Forms, Validation & Error Handling
6. Campaigns — Creation, Ownership & Lifecycle
7. Accounts Hub — Payments
8. Email Notifications
9. Integrations — Shopify, Apify, Meta Ads
10. UI System & Design


---


# 1. System Architecture, Stack & Deployment

CreatorHub is a server-rendered web application built on **Next.js 15 (App Router)** with **React 19**, deployed to **Vercel**, backed by a single **Supabase** project (Postgres + Auth + Storage + Edge Functions) at `https://xynyvbagcudjrzklwnqp.supabase.co`. Supabase is the **sole source of truth** — the legacy Google Apps Script app (Index.html / InfluencerBackend.js / Code.js) and all Google-Sheets dual-writes were retired on **2026-05-21**. No application path writes to Google Sheets anymore.

### Stack at a glance

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js `^15.1.0` (App Router), React `^19.0.0` | `reactStrictMode`, `typedRoutes`, `optimizePackageImports: ["lucide-react"]` (`apps/web/next.config.ts`) |
| Language | TypeScript `^5.6.3` | Generated DB types in `apps/web/lib/supabase/types.gen.ts` (`npm run db:types`) |
| Hosting | Vercel | Serverless functions + Vercel Cron (`apps/web/vercel.json`) |
| Database / Auth / Storage | Supabase (Postgres, GoTrue, Storage, Edge Functions) | RLS-aware reads via cookie session; privileged writes via service role |
| Styling / UI | Tailwind CSS `^4.0.0`, Radix UI primitives, lucide-react, sonner, recharts | — |
| Data layer | `@supabase/ssr` `^0.5.1`, `@supabase/supabase-js` `^2.45.4`, TanStack Query/Table | — |
| Email | Nodemailer `^8.0.7` over Gmail SMTP | `apps/web/lib/email.ts`, `apps/web/lib/notifications.ts` |
| Validation | Zod `^3.23.8`, react-hook-form | Env + input boundary validation |

### Monorepo layout

```
New Influencer Project/
├── apps/web/                     # the Next.js 15 app (deployed to Vercel)
│   ├── app/                      # App Router: routes, server actions, layouts
│   │   └── api/                  # Route Handlers (cron, exports, internal JSON)
│   ├── lib/
│   │   ├── supabase/             # the three Supabase clients + generated types
│   │   ├── env.ts / env.server.ts# Zod-validated env (public vs server-only)
│   │   ├── auth.ts, rbac.ts, rbac.server.ts  # actor + permission gating
│   │   └── notifications.ts, email.ts        # SMTP notification pipeline
│   ├── middleware.ts             # refreshes the Supabase session per request
│   ├── next.config.ts
│   └── vercel.json               # Vercel Cron schedule
└── supabase/
    └── functions/                # Deno Edge Functions (deployed to Supabase)
        └── sync-shopify-orders/index.ts
```

> Note: only `sync-shopify-orders` is committed under `supabase/functions/` in the repo. The second function, `scrape-pending-apify`, is **deployed and ACTIVE** on Supabase (slug `scrape-pending-apify`, entrypoint `supabase/functions/scrape-pending-apify/index.ts`) but its source is not currently mirrored into this repo tree.

### The three Supabase clients (`apps/web/lib/supabase/`)

All Supabase access goes through exactly three factory functions so that auth context and privilege are never ambiguous:

| Client | File / Export | Auth context | Where it runs | Use |
|--------|---------------|--------------|---------------|-----|
| Browser | `client.ts` → `createClient()` | Anon key + browser cookie session | Client Components | RLS-scoped reads from the browser (`createBrowserClient`) |
| Server (cookie) | `server.ts` → `createClient()` (async) | Anon key + the signed-in user's cookie session | RSCs, Route Handlers | RLS-scoped, user-scoped reads (`createServerClient`, `cookies()`) |
| Service role | `server.ts` → `createServiceClient()` | `SUPABASE_SERVICE_KEY` (bypasses RLS) | Server only | Privileged writes / cross-row reads, **only after `assertPermission()`** |

The service client is constructed with `auth: { persistSession: false, autoRefreshToken: false }` and throws if `SUPABASE_SERVICE_KEY` is unset. It must never reach the browser bundle.

### How reads and writes work (service-role server actions)

- **Session refresh:** `middleware.ts` runs on every non-static request, rebuilds a `createServerClient` from the request cookies, and calls `supabase.auth.getUser()` to refresh the session so Server Components see a live user.
- **Authentication:** Google OAuth **only**. `app/(auth)/login` initiates Google sign-in; `app/auth/callback/route.ts` exchanges the `?code=` for a session cookie and redirects to `/dashboard`. There is no password store and no invite-token table.
- **Authorization:** `lib/auth.ts` `getActor()` (React-`cache`d per request) resolves the signed-in email against the `user_access` table and hydrates permission scopes from `access_roles` / `access_role_permissions`, failing **closed**. Server actions and protected Route Handlers gate on `assertPermission(key)` (`lib/rbac.server.ts`, `server-only`).
- **Reads:** user-facing reads use the cookie-scoped server/browser clients so Postgres RLS applies. All `getX`/`loadX` data functions read Supabase first (Sheets is no longer a fallback).
- **Writes:** mutations run as Next.js **server actions** (or Route Handlers). The pattern is: `assertPermission()` → `createServiceClient()` → validated `insert/update/upsert` against Supabase. Atomic ID generation, audit fields, and state-machine transitions all live in Postgres / server actions (no client-side privilege).
- **Images:** Instagram avatars/thumbnails are proxied through `images.weserv.nl` and `*.cdninstagram.com`, whitelisted in `next.config.ts` `images.remotePatterns`.

### Background jobs

Two execution surfaces run scheduled/background work. **Both write only to Supabase.**

#### Supabase Edge Functions (Deno)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `sync-shopify-orders` | `pg_cron` every 3 hours (bulk); also callable on-demand with `?order_id=` / `POST {order_id}` | Pulls Shopify Admin REST orders tagged `inf` within a rolling `SHOPIFY_DAYS_BACK` (default 14-day) window, paginates via the `Link` header, and upserts mapped rows into `shopify_orders` (`onConflict: order_id`). Single-order mode validates a freshly-placed order during onboarding and upserts it **only if** it carries the `inf` tag. |
| `scrape-pending-apify` | `pg_cron` every 3 hours | Picks up `instagram_cache` rows with `status='pending'` (UPSERTed by `lookupCreator` when a fresh handle is seen), calls the Apify Instagram scraper, and writes results back. Apify failures are logged to `system_errors` (`type='apify_fail'`) for the Error Portal. |

Both Edge Functions have `verify_jwt: true` and read their Supabase credentials from runtime-injected `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

#### Vercel Cron (Route Handler)

| Route | Schedule (`vercel.json`) | Purpose |
|-------|--------------------------|---------|
| `GET /api/cron/notifications` (`app/api/cron/notifications/route.ts`) | `0 4 * * *` (daily 04:00 UTC) | Runs six idempotent, fire-once email checks (pending onboarding, posting pending, content-submission reminder, payment-eligible, payment SLA breach, campaign-ending-soon) plus auto-closes campaigns past `end_date`. Each check queries rows that just crossed a threshold and have not yet been stamped, sends via `sendNotification()`, then stamps the row's sent-flag column so later runs never re-fire. `dynamic = "force-dynamic"`, `maxDuration = 60`. |

The cron route is auth-guarded: it accepts the request only if it carries Vercel's `x-vercel-cron` header **or** `Authorization: Bearer ${CRON_SECRET}`; anything else returns `401`.

---

## Deployment & Configuration

- **Web app:** `apps/web` deploys to Vercel. Pushing to `main` triggers an automatic production deploy (Vercel `main` → prod). Build = `next build`; dev = `next dev --turbo`.
- **Edge Functions:** `sync-shopify-orders` and `scrape-pending-apify` deploy to the Supabase project and are invoked on a 3-hour `pg_cron` schedule. The cron auth token used to invoke them **must be a single line** — a stray newline silently broke the scrape cron for 9 days previously.
- **Vercel Cron:** declared in `apps/web/vercel.json` (`/api/cron/notifications`, `0 4 * * *`).

### Environment variables

Env is parsed and validated with Zod, split by trust boundary: **public** (`lib/env.ts`, safe for the browser bundle) and **server-only** (`lib/env.server.ts`, guarded by `import "server-only"`). Empty-string values are stripped so `KEY=` falls through to `optional()`.

| Variable | Scope | Required | Purpose |
|----------|-------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | Supabase project URL (all three clients) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes | Anon key for browser/server cookie clients |
| `SUPABASE_SERVICE_KEY` | Server | Yes (for writes) | Service-role key for `createServiceClient()` privileged writes |
| `EMAIL_USER` | Server | For email | Gmail SMTP sending address (e.g. `emailmarketing@saadaa.in`) |
| `EMAIL_PASS` | Server | For email | Gmail app password |
| `EMAIL_FROM_NAME` | Server | Optional | Display name (defaults to "Saadaa") |
| `CRON_SECRET` | Server (Vercel) | Recommended | Bearer secret accepted by `/api/cron/notifications` |
| `META_ADS_SUPABASE_URL` / `META_ADS_SUPABASE_SERVICE_KEY` | Server | Optional | External Meta Ads warehouse (Anmol's DB) read by `lib/supabase/meta-ads.ts` for ad coverage |

Supabase **Edge Function secrets** (set on Supabase, not Vercel):

| Variable | Used by | Notes |
|----------|---------|-------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | both functions | Auto-injected by the Edge runtime |
| `SHOPIFY_STORE_DOMAIN` | `sync-shopify-orders` | e.g. `saadaa.myshopify.com` (no protocol) |
| `SHOPIFY_ADMIN_API_TOKEN` | `sync-shopify-orders` | Admin API token (`read_orders`) |
| `SHOPIFY_API_VERSION` | `sync-shopify-orders` | Optional, default `2024-10` |
| `SHOPIFY_DAYS_BACK`, `SHOPIFY_MAX_PAGES`, `SHOPIFY_ORDER_TAGS` | `sync-shopify-orders` | Optional tuning (defaults `14`, `4`, `inf`) |
| `APIFY_TOKEN`, `APIFY_ACTOR_ID` | `scrape-pending-apify` | Apify API token + actor (e.g. `apify/instagram-profile-scraper`) |

> Legacy / dormant env keys still defined in `env.server.ts` but **not exercised** in the current architecture: `GAS_MIRROR_ENDPOINT`, `GAS_MIRROR_SECRET`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`, `SPREADSHEET_ID`, `SHOPIFY_WEBHOOK_SECRET`. These are the residue of the retired Sheet-mirror path (`lib/sheet-mirror.ts`) kept for reference only; they are never invoked since the 2026-05-21 Supabase-only cutover.

### Supabase configuration (dashboard)

- **Auth → URL Configuration:** Site URL + Additional Redirect URLs must include `<origin>/auth/callback` for every environment (localhost + prod). Google is the only enabled OAuth provider.
- **Auth gate:** access is granted only to emails present and `active` in `user_access`; permissions resolve from `access_roles` / `access_role_permissions`, failing closed for unknown roles.


---


# 2. Supabase Schema

Supabase Postgres is the **sole source of truth** for CreatorHub. The retired Google Apps Script app ran a dual-database model (Supabase + Google Sheets mirror with `_findSheetRowByPostId_` drift healing and `sbUpsertWithSchemaFallback_` schema-cache retries); none of that survives in the Next.js 15 rebuild. The web app at `New Influencer Project/apps/web` reads and writes only Postgres — via the server Supabase client (`apps/web/src/lib/supabase/server.ts`) using the service-role key for server actions and Route Handlers, and the browser client for read-only RLS-gated queries. RLS is enabled on every table. Background ingestion (Shopify orders, Apify Instagram cache) runs as Vercel Cron routes and Supabase Edge Functions writing directly into these tables.

The public schema holds **15 base tables**, **3 views**, and **11 identity sequences** (one per `bigint` PK; `email_logs` and `access_roles` use `uuid`/`gen_random_uuid()` instead, and `cell_edits` uses a `GENERATED ALWAYS AS IDENTITY` column).

### 2.1 Core Workflow Tables

#### `posts` — master collab ledger (one row per deliverable)
The central table; replaces the legacy 58-column Creator Data sheet. PK `id` (bigint seq). Business key `post_id` (text, **unique**). FKs: `inf_id → creators.inf_id`, `campaign_id → campaigns.campaign_id`. Referenced by `payments.post_id` and `payments.deliverable_post_id`.

| Column | Type | Notes |
|--------|------|-------|
| `post_id` | text | **unique** business key |
| `inf_id` | text | FK → `creators.inf_id` |
| `username`, `email` | text | |
| `campaign_id` | text | FK → `campaigns.campaign_id` |
| `workflow_status` | text | default `'Reach Out'`; **CHECK** restricts to `Reach Out, On Board, Posted, Delivered, RTO, Cancelled, Cancelled After RTO, Offboarding` (+ legacy values `Reached Out, Interested, Negotiating, Onboarded, Order Placed, Rejected, Ghosted, On Hold`) |
| `content_type` | text | |
| `reels`, `static_posts`, `stories` | int4 | default `0` |
| `ads_usage_rights` | text | default `'false'` |
| `barter_amount`, `commercial_amount` | numeric | barter = 0 compensation rule enforced |
| `collab_type` | text | Barter / Barter + Paid |
| `order_id`, `tracking_id`, `order_status`, `garment_qty`, `garments_sent` | text | order linkage |
| `post_date`, `post_link`, `download_link` | date/text | posting stage |
| `payment_status` | text | default `'Pending'` |
| `utr`, `payment_date` | text/date | |
| `reach_out_date`, `onboard_date`, `est_delivery`, `posting_dispatch_date` | date | stage timestamps |
| `reachout_direction` | text | default `'outbound'`; **CHECK** `inbound`/`outbound` |
| `post_id_short`, `collab_number`, `post_number` | text/int4 | nomenclature; `collab_number` default `1`, **CHECK** `>= 1` |
| `nomenclature`, `collab_id`, `partnership_id` | text | |
| `deliverable_type` | text | **CHECK** `reel`/`post` |
| `deliverable_index`, `deliverable_role`, `parent_post_id` | int4/text | parent/child expansion; `deliverable_role` **CHECK** `parent`/`child`/`single` |
| `ad_partnership_valid` | bool | default `false` |
| `bank_name`, `bank_number`, `ifsc` | text | per-post bank snapshot |
| `state`, `city`, `pincode`, `country`, `street_address` | text | shipping address |
| `collab_email_sent_at`, `collab_email_skipped` | timestamptz/bool | collab email idempotency (`skipped` default `false`) |
| `content_reminder_sent_at`, `posting_pending_sent_at`, `onboarding_pending_sent_at` | timestamptz | cron idempotency stamps (NULL = not sent) |
| `creator_brief_link`, `onboarded_by`, `agency_name`, `notes`, `raw_dump` | text | |
| `created_at`, `updated_at` | timestamptz | default `now()` |

#### `creators` — influencer master / profile
PK `id` (bigint seq). **Unique** on both `inf_id` (`SIF-N` pattern) and `username`. Parent of `posts.inf_id` and `payments.inf_id`.

| Column | Type | Notes |
|--------|------|-------|
| `inf_id` | text | **unique** |
| `username` | text | **unique** |
| `inf_name`, `instagram_link` | text | |
| `followers` | int8 | |
| `gender`, `verification`, `category`, `language`, `state`, `agency_name` | text | |
| `er` | numeric | engagement rate |
| `avg_likes` | int4 | |
| `profile_pic` | text | avatar URL (persisted from `avatars` storage bucket) |
| `bank_name`, `bank_number`, `ifsc` | text | |
| `created_at`, `updated_at` | timestamptz | default `now()` |

#### `campaigns`
PK `id` (bigint seq). **Unique** `campaign_id` (`IFC{NNN}` nomenclature, e.g. `IFC001`). `campaign_num` drives the padded auto-increment. Parent of `posts.campaign_id` and `campaign_budget.campaign_id`.

| Column | Type | Notes |
|--------|------|-------|
| `campaign_id` | text | **unique**, `IFC{NNN}` |
| `campaign_num` | int4 | drives ID generation |
| `campaign_name` | text | NOT NULL |
| `start_date`, `end_date` | date | optional planning window |
| `status` | text | **recent addition**; default `'Active'` (Active / Closed) |
| `created_by` | text | **recent addition**; actor email of campaign creator |
| `auto_closed_at` | timestamptz | **recent addition**; set when auto-close cron closes a past-end-date campaign |
| `ending_alert_sent` | bool | default `false`; campaign-ending alert idempotency |
| `total_budget` | numeric | |
| `key_message`, `no_of_creators`, `brief_link`, `internal_brief_link` | text | |
| `created_at`, `updated_at` | timestamptz | default `now()` |

#### `campaign_budget` — per-month, per-tier budget grid
PK `id` (bigint seq). FK `campaign_id → campaigns.campaign_id`. Notable for **three GENERATED (stored) columns**:

| Column | Type | Notes |
|--------|------|-------|
| `campaign_id` | text | FK → `campaigns.campaign_id`, NOT NULL |
| `month_label` | text | NOT NULL |
| `tier`, `collab_type`, `campaign_name` | text | |
| `num_influencers` | int4 | default `0` |
| `avg_comp` | numeric | default `0` |
| `total_cost` | numeric | **GENERATED** = `num_influencers * avg_comp` |
| `min_garments`, `max_garments` | int4 | defaults `2` / `3` |
| `est_garment_cost` | numeric | **GENERATED** = `(max_garments * 900) * 0.6` |
| `total_with_garments` | numeric | **GENERATED** = `(num_influencers * avg_comp) + (est_garment_cost * num_influencers)` |
| `created_at` | timestamptz | default `now()` |

#### `payments` — payment ledger
PK `id` (bigint seq). FKs: `post_id → posts.post_id`, `deliverable_post_id → posts.post_id`, `inf_id → creators.inf_id`.

| Column | Type | Notes |
|--------|------|-------|
| `post_id`, `deliverable_post_id`, `collab_id` | text | FKs to `posts.post_id` |
| `inf_id` | text | FK → `creators.inf_id` |
| `username`, `amount`, `utr` | text/numeric | |
| `status` | text | default `'Not Due'`; **CHECK** `Not Due, Due, Partial, Done` |
| `payment_date`, `due_date`, `estimated_payable_date` | date | payable cycle = 15th & 30th |
| `bank_name`, `bank_number`, `ifsc` | text | |
| `collab_number`, `deliverable_index` | int4 | |
| `payment_advice_sent`, `eligibility_email_sent`, `sla_breach_alert_sent` | bool | default `false`; email idempotency |
| `posted_but_not_tested` | bool | default `false`; ad-eligibility annotation, never blocks payment; cleared by `recomputePaymentStates` |
| `created_at` | timestamptz | default `now()` |

### 2.2 Integration / Ingestion Tables

#### `shopify_orders` — synced order warehouse (1,279 rows)
PK `id` (bigint seq). **Unique** `order_id`. Populated by the Shopify sync (Vercel Cron / Edge Function pulling `tag:IFAD` orders); the legacy 11-column shape is fully expanded to **29 columns**.

| Column | Type | Notes |
|--------|------|-------|
| `order_id` | text | **unique** |
| `customer_name`, `email`, `phone`, `address` | text | |
| `garments_sent`, `line_skus` | text | |
| `order_date`, `order_placed_date`, `delivery_date` | date | |
| `fulfillment`, `tracking_id`, `tracking_status` | text | |
| `subtotal_price`, `total_price`, `discount_total`, `refund_amount` | numeric | |
| `discount_codes`, `tags`, `note`, `financial_status` | text | |
| `customer_order_count` | int4 | |
| `cancelled_at`, `cancel_reason`, `refund_reason`, `refunded_at` | timestamptz/text | |
| `fulfillment_events` | **jsonb** | fulfillment event chain |
| `synced_at` | timestamptz | default `now()` |

#### `instagram_cache` — Apify profile cache (per-username)
PK `id` (bigint seq). **Unique** `username`. Refreshed on the 3-hour scrape cron; CDN profile-pic URLs are proxied (weserv) at render time.

| Column | Type | Notes |
|--------|------|-------|
| `username` | text | **unique** |
| `followers` | int8 | |
| `er`, `avg_likes`, `avg_views` | numeric/int4 | |
| `profile_pic`, `biography` | text | |
| `is_verified` | bool | |
| `raw_json` | **jsonb** | full Apify payload |
| `status` | text | default `'auto'` |
| `attempts` | int4 | default `0`; Apify retry counter, reset on success |
| `scraped_at` | timestamptz | default `now()`; first scrape |
| `updated_at` | timestamptz | most recent successful refresh |

### 2.3 RBAC & Audit Tables

#### `user_access` — user roster
PK `id` (bigint seq). **Unique** `email`. Referenced by `cell_comments.author_email` and `cell_comments.resolved_by`.

| Column | Type | Notes |
|--------|------|-------|
| `email` | text | **unique** |
| `role` | text | default `'viewer'` |
| `active` | bool | default `true` |
| `name`, `employee_id`, `department`, `notes` | text | |
| `invited_by`, `invited_at` | text/timestamptz | `invited_at` default `now()` |
| `last_login_at`, `last_active_at` | timestamptz | |
| `created_at` | timestamptz | default `now()` |

#### `access_roles` — DB-driven RBAC roles (**recent addition**)
PK `id` (**uuid**, `gen_random_uuid()`). **Unique** `name`. Parent of `access_role_permissions.role_id`. Replaces the legacy hardcoded `ADMIN_EMAILS` array + `normalizeAccessRole_()` string normalization.

| Column | Type | Notes |
|--------|------|-------|
| `name` | text | **unique** |
| `description`, `color` | text | |
| `is_system` | bool | default `false`; protects built-in roles |
| `created_by` | text | |
| `created_at`, `updated_at` | timestamptz | default `now()` |

#### `access_role_permissions` — per-role scope grants (**recent addition**)
**Composite PK `(role_id, scope)`** — no surrogate id. FK `role_id → access_roles.id`. 46 rows across the 5 seeded roles.

| Column | Type | Notes |
|--------|------|-------|
| `role_id` | uuid | FK → `access_roles.id` (PK part) |
| `scope` | text | permission scope key (PK part) |
| `granted` | bool | default `true` |

#### `user_audit_log` — RBAC mutation trail
PK `id` (bigint seq).

| Column | Type | Notes |
|--------|------|-------|
| `actor_email`, `target_email` | text | NOT NULL |
| `action` | text | **CHECK** `invite, edit, role_change, activate, deactivate, delete, login, csv_invite_batch` |
| `before_json`, `after_json` | **jsonb** | snapshot diff |
| `notes` | text | |
| `created_at` | timestamptz | default `now()` |

### 2.4 Operational Tables

#### `email_logs` — outbound email audit
PK `id` (**uuid**, `gen_random_uuid()`).

| Column | Type | Notes |
|--------|------|-------|
| `post_id`, `collab_id`, `sent_to`, `subject` | text | |
| `email_type` | text | default `'collab'` |
| `status` | text | default `'sent'` |
| `error` | text | |
| `created_at` | timestamptz | default `now()` |

#### `system_errors` — error portal sink
PK `id` (bigint seq). Generic error log (legacy `System Error Log` sheet successor).

| Column | Type | Notes |
|--------|------|-------|
| `type`, `message` | text | NOT NULL |
| `key`, `source`, `resolved_by` | text | |
| `resolved` | bool | default `false` |
| `resolved_at` | timestamptz | |
| `created_at` | timestamptz | default `now()` |

#### `cell_comments` — sheet-view cell discussions
PK `id` (bigint seq). FKs `author_email` and `resolved_by → user_access.email`.

| Column | Type | Notes |
|--------|------|-------|
| `table_id`, `row_pk`, `column_key`, `body` | text | NOT NULL |
| `mentions` | text[] | default `'{}'` |
| `author_email` | text | FK → `user_access.email` |
| `resolved`, `resolved_by`, `resolved_at` | bool/text/timestamptz | `resolved` default `false` |
| `created_at`, `updated_at` | timestamptz | default `now()` |

#### `cell_edits` — sheet-view edit history
PK `id` (bigint, **GENERATED ALWAYS AS IDENTITY** — the only identity-column table).

| Column | Type | Notes |
|--------|------|-------|
| `sheet_key`, `table_name`, `row_pk`, `column_key` | text | |
| `old_value`, `new_value`, `edited_by` | text | |
| `edited_at` | timestamptz | default `now()` |

### 2.5 Views

| View | Purpose |
|------|---------|
| `access_role_summary` | Per-role rollup of `access_roles` + grant counts from `access_role_permissions` (RBAC admin UI). |
| `campaign_budget_monthly` | Monthly aggregation over `campaign_budget` (sums of generated `total_cost` / `total_with_garments`). |
| `inbound_reachout_queue` | `posts` filtered to `reachout_direction = 'inbound'` for the Inbound Reach Out queue. |

### 2.6 Sequences

Eleven `bigint` identity sequences back the surrogate PKs: `campaign_budget_id_seq`, `campaigns_id_seq`, `cell_comments_id_seq`, `creators_id_seq`, `instagram_cache_id_seq`, `payments_id_seq`, `posts_id_seq`, `shopify_orders_id_seq`, `system_errors_id_seq`, `user_access_id_seq`, `user_audit_log_id_seq`. `access_roles` and `email_logs` use `uuid` PKs (no sequence); `cell_edits` uses a `GENERATED ALWAYS AS IDENTITY` column (no standalone sequence object).

> **Removed vs. legacy:** No Google Sheets mirror, no `name_identifier` write path, no `sbUpsertWithSchemaFallback_`/`sbUpdateWithSchemaFallback_` schema-cache fallback (the Next.js server actions target the live schema directly), and no `_findSheetRowByPostId_` drift healing — `post_id` uniqueness in Postgres is now the single canonical key.


---


# 3. RBAC & Authentication

CreatorHub authentication is **Google OAuth-only** (passwordless SSO via Supabase Auth) layered over a **DB-hydrated, scope-based RBAC** model. There are no passwords, no magic links, and no anonymous access — every request is tied to a Google Workspace identity that must also exist as an *active* row in the `user_access` table. Authorization is expressed as a vocabulary of named permission *scopes* resolved per-request from `access_roles` / `access_role_permissions`, with a static in-code grant map as a fail-closed fallback.

> This entirely replaces the retired GAS model (`checkInfluencerUserAccess()` reading an `Accounts Hub` sheet). There is no Google Sheets involvement in auth — Supabase is the sole source of truth.

### 3.1 Sign-in flow (Google OAuth)

| Step | Location | Behavior |
|------|----------|----------|
| Login page | `app/(auth)/login/page.tsx` | Server component; renders brand panel + live `creators`/`campaigns`/`posts` counts (service-client COUNTs) and the `<GoogleSignIn>` client component. Prompts for an `@saadaa.in` Google account. |
| Initiate OAuth | `app/(auth)/login/google-sign-in.tsx` | Client component calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: \`${origin}/auth/callback\`, queryParams: { access_type: "offline", prompt: "select_account" } } })`. Surfaces a `?reason=revoked` warning banner and any `?error=` message. |
| OAuth callback | `app/auth/callback/route.ts` (`GET`) | Exchanges `?code` for a session cookie via `exchangeCodeForSession`. **Access gate:** re-reads the authenticated user, then queries `user_access` (service client, bypassing RLS) for `active` where `email = lower(user.email)`. If the row is missing or `active = false`, it calls `auth.signOut()` and redirects to `/login?reason=revoked`. On success redirects to `next` (default `/dashboard`). |
| Session refresh | `middleware.ts` | Runs `supabase.auth.getUser()` on every matched request to refresh the session cookie for Server Components. The matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and common image extensions. Middleware refreshes the session but does **not** itself enforce the `user_access` gate — that lives in the app shell. |
| App shell gate | `app/(app)/layout.tsx` | Server component calls `getActor()`. If `null`, it distinguishes a never-signed-in visitor (`redirect("/login")`) from a signed-in-but-revoked user (`redirect("/login?reason=revoked")`). |

Required Supabase dashboard config (per `route.ts` header): Google provider enabled, Site URL set, and `…/auth/callback` registered under **Additional Redirect URLs** for both localhost and the prod domain.

### 3.2 The actor — `getActor` / `requireActor` (`lib/auth.ts`)

`getActor()` is the single resolution point for "who is making this request and what may they do." It is wrapped in React `cache()` so it dedupes within one request (safe to call from layouts, pages, server actions, and API routes).

1. Reads the Supabase auth user; returns `null` if there is no email.
2. Loads the `user_access` row by `email = user.email.toLowerCase()` via `maybeSingle()`. Returns `null` if the row is missing **or** `row.active` is falsy (this is the live revocation gate — deactivating a user instantly locks them out of every page).
3. **Permission hydration:** using the service client, looks up `access_roles` by `name = row.role`, then reads `access_role_permissions (scope, granted)` for that `role_id`, keeping only rows where `granted = true`. The resulting `string[]` is attached as `actor.permissions`.
4. **Side effect (best-effort, non-blocking):** `touchUserActivity()` bumps `last_active_at` (debounced to once per 5 min) and `last_login_at` (on first login, which also writes a `login` row to `user_audit_log`). Failures are swallowed so they never block auth.

Hydration is **fail-loud, fail-closed**: every Supabase error path (`access_roles` lookup failure, `access_role_permissions` failure, role-name drift with no matching `access_roles` row) is logged with `console.error` and falls through with empty/partial `permissions`, so `hasPermission` then relies on the static map — and an unknown custom role denies all.

`requireActor()` wraps `getActor()` and throws `"Not authenticated or access revoked"` when it returns `null`. It is the mandatory entry point for server actions and protected API routes.

The actor type is `ActorPermissions = UserAccessRow & { permissions?: string[] }` (`lib/rbac.ts`).

### 3.3 Permission resolution — `hasPermission` (`lib/rbac.ts`)

`hasPermission(actor, key)` is a pure function (client-safe, no server-only imports) used for both UI gating (sidebar, conditional render) and as the basis for server-side enforcement.

- **DB path (normal):** if `actor.permissions` is non-empty, grant iff the scope is present **OR** the actor holds `admin` and the requested key is not `admin` itself. This is the **admin-implies-all** rule.
- **Static fallback path:** if `permissions` was never hydrated (unit tests, transient migration states), it normalizes `actor.role` to one of the four system roles and consults `STATIC_GRANTS`. An unrecognized/custom role returns `false` (**deny-all**).

The server-only helper `assertPermission(key)` (`lib/rbac.server.ts`) composes `requireActor()` + `hasPermission()` and throws `Missing permission: <key>` on failure; it returns the actor on success. Every mutating server action gates on it — e.g. `assertPermission("admin")` in `features/user-panel/actions.ts` and `roles-actions.ts`, `assertPermission("campaign_create")` in campaigns, `assertPermission("accounts_write")` in accounts-hub, `assertPermission("offboarding_write")` in offboarding.

### 3.4 Scope vocabulary (`PermissionKey`)

The complete scope set is defined in `lib/rbac.ts` (`PERMISSION_DESCRIPTIONS` / `PERMISSION_KEYS`):

| Scope | Meaning |
|-------|---------|
| `admin` | Full administrative access; implies every other scope at check time. Gates `/admin/users` in the sidebar. |
| `campaign_create` | Create campaigns. |
| `campaign_edit` | Edit, close, and reopen campaigns. |
| `reachout_outbound` | Submit the Outbound Reach Out form. |
| `reachout_inbound` | Submit the Inbound Reach Out batch + CSV. |
| `onboarding_write` | Submit onboarding form + create Shopify order. |
| `posting_submit` | Mark a collab as Posted. |
| `accounts_write` | Log payments + edit Accounts Hub records. |
| `performance_view` | Read Cost Analytics, Compliance, Funnel, Internal Dashboard. |
| `order_status_view` | Read the Order Status fulfillment ledger. |
| `sheet_view` | Read the Sheet View tabs. |
| `offboarding_write` | Move a collab to the terminal Offboarding stage. |
| `system_config` | Edit system configuration (admin only). |
| `role_mgmt` | Create + edit access roles and assign permissions (admin only). |

`campaign_create` / `campaign_edit` were narrowed on 2026-06-07 so that campaign authoring is restricted to **Campaign Owner** and **Global Admin** only (removed from the default `User` role).

### 3.5 System roles & their scopes

Four roles are seeded as system roles (`access_roles.is_system = true`); their names are immutable and they cannot be deleted, but their scope sets remain editable from the role builder. The seeded grants in the database match the `STATIC_GRANTS` fallback map in `lib/rbac.ts`:

| Role | Color | Granted scopes |
|------|-------|----------------|
| **Global Admin** | `#F0C61E` | All 14 scopes (`admin`, `campaign_create`, `campaign_edit`, `reachout_outbound`, `reachout_inbound`, `onboarding_write`, `posting_submit`, `accounts_write`, `performance_view`, `order_status_view`, `sheet_view`, `offboarding_write`, `system_config`, `role_mgmt`). |
| **User** (default) | `#4F7C4D` | `reachout_outbound`, `reachout_inbound`, `onboarding_write`, `posting_submit`, `performance_view`, `order_status_view`, `sheet_view`. No admin, no billing, no campaign authoring. |
| **Accounts Team** | `#0F766E` | `accounts_write`, `performance_view`, `order_status_view`, `sheet_view`. |
| **Campaign Owner** | `#3B6FD4` | `campaign_create`, `campaign_edit`, `performance_view`, `order_status_view`, `sheet_view`. |

> Note: although `Global Admin` enumerates all scopes explicitly, the `admin` scope alone already implies every non-`admin` key via `hasPermission`. The enumeration exists so the static fallback is exhaustive.

Custom (non-system) roles are also supported and persisted in the same tables — e.g. an **Offboarding Manager** role (`#B57514`, scopes `offboarding_write` + `performance_view`) currently exists as a non-system role.

### 3.6 Data model

| Table / view | Key columns | Role |
|--------------|-------------|------|
| `user_access` | `id` (bigint seq), `email` (text, NOT NULL), `name`, `role` (text, default `'viewer'`), `active` (default `true`), `invited_by`, `invited_at`, `last_login_at`, `last_active_at`, `notes`, `employee_id`, `department` | One row per authorized person. The `role` value is matched by name against `access_roles.name`. `active = false` is a hard lockout enforced in both the callback gate and `getActor`. |
| `access_roles` | `id` (uuid), `name` (unique), `description`, `is_system`, `color`, `created_by`, `created_at`, `updated_at` | Role registry — both system and custom roles. |
| `access_role_permissions` | `role_id` (uuid FK), `scope` (text), `granted` (bool, default `true`) | Per-role scope grants. `getActor` reads only `granted = true` rows. |
| `access_role_summary` (view) | role fields + `granted_count`, `user_count` | Backs the User Panel role list (`listRoles`). |
| `user_audit_log` | `actor_email`, `target_email`, `action`, `before_json`, `after_json`, `notes`, `created_at` | Immutable audit trail for invites, role changes, activation toggles, deletes, logins, and CSV batches. |

### 3.7 User Panel — role assignment & custom role builder

The admin User Panel lives at `app/(app)/admin/users` (+ detail at `…/[email]`), gated in the sidebar by `hasPermission(actor, "admin")`. Its server actions all begin with `await assertPermission("admin")`.

**Assigning roles to users** (`features/user-panel/actions.ts`):

- `saveUser()` upserts into `user_access` keyed on `email` (lowercased). The `role` is validated against the allow-set `{ Global Admin, User, Accounts Team, Campaign Owner }`, defaulting to `User`. New rows stamp `invited_by` / `invited_at` and, when active, trigger a branded Google-sign-in invite email (`sendUserInviteEmail` → `sendNotification`, type `USER_INVITATION`). Because the app is passwordless, the invite contains no accept token — the user becomes active simply by signing in with the matching Google account. Changes are diffed and written to `user_audit_log` with a precise action (`role_change` / `activate` / `deactivate` / `edit`).
- `toggleUserActive()` flips `active` (the revocation switch) and audits it.
- `deleteUser()` removes the row and audits the prior state.
- `bulkInviteUsers()` (CSV) upserts in a loop with role-alias normalization (`CSV_ROLE_ALIASES`, e.g. `admin`/`owner` → Global Admin, `finance` → Accounts Team), sends invite emails in parallel (`Promise.allSettled`), and writes a `csv_invite_batch` audit summary.

**Custom role builder** (`features/user-panel/roles-actions.ts` + `role-editor-modal.tsx`):

- `listRoles()` reads `access_role_summary` and joins granted scopes from `access_role_permissions`.
- `createRole()` / `updateRole()` / `deleteRole()` manage custom roles. Server-side guards: scopes are validated against `PERMISSION_KEYS` (`normalizeScopes`); the names `Global Admin` / `User` / `Accounts Team` are reserved (cannot be created or renamed to); system roles cannot be renamed or deleted but **can** have their scopes re-tuned; updates replace the full scope set (delete-then-insert) and propagate a role rename into `user_access.role`; deletion is blocked while any user is still assigned; every scope change writes per-affected-user `user_audit_log` entries so the change surfaces in each user's detail feed.
- The `RoleEditorModal` is the visual builder: name, description, badge color (from a suggested palette), and a checkbox grid over all `PERMISSION_KEYS` with descriptions, a "Power" badge on the `admin` scope, and select-all / clear controls. For system roles the name field is locked.

**Files:** `lib/auth.ts`, `lib/rbac.ts`, `lib/rbac.server.ts`, `app/(auth)/login/{page.tsx,google-sign-in.tsx}`, `app/auth/callback/route.ts`, `middleware.ts`, `app/(app)/layout.tsx`, `components/nav/sidebar.tsx`, `features/user-panel/{actions.ts,roles-actions.ts,role-editor-modal.tsx,types.ts,page-client.tsx,user-detail-client.tsx,csv-invite-modal.tsx}`.


---


# 4. ID Generation, Workflow Stages & Pipeline

All identifiers are minted server-side against Supabase (sole source of truth — no Google Sheets writes). The two ID-minting paths are Postgres RPCs that serialize concurrent callers with `pg_advisory_xact_lock` (replacing the legacy GAS `LockService.waitLock`). Reach-out IDs are generated by `submit_reachout`; campaign IDs by `submit_campaign`. Both are invoked from Next.js Server Actions (`features/reach-out/actions.ts → submitReachOut`, `features/campaigns/actions.ts → submitCampaign`).

### 4.1 Identifier Model

| ID | Pattern | Example | Scope | Source of truth |
|----|---------|---------|-------|-----------------|
| `inf_id` | `SIF-{N}` | `SIF-1466` | Per creator (permanent licence plate, shared across all of that creator's posts) | `creators.inf_id` |
| `post_id_short` | `SIF-{N}-P{global}` | `SIF-1466-P1247` | Per deliverable row; `P` is a **globally linear** post counter across all posts, never resets | `posts.post_id_short` |
| `post_id` | `SIF-{N}-P{global}` (identical to short) | `SIF-1466-P1247` | Primary key on `posts`; one row per deliverable | `posts.post_id` |
| `collab_id` | `SIF-{N}-C{k}` | `SIF-1466-C2` | Groups all deliverable rows belonging to one collaboration episode | `posts.collab_id` |
| `collab_number` | integer `k` | `2` | Per-creator sequential collab counter (drives the `-C{k}` suffix) | `posts.collab_number` |
| `campaign_id` | `IFC{NNN}` | `IFC012` | Per campaign | `campaigns.campaign_id` |
| `nomenclature` | `{post_id}-{username}-{contentType}-{date}` | `SIF-1466-P1247-creator-UGC-2026-06-07` | Legacy human-readable label, rebuilt on edit | `posts.nomenclature` |

**Key correction vs. the retired GAS doc:** `post_id` is **no longer** `SIF-N-P{n}-C{n}`. The `-C{k}` collab suffix has been hoisted out of `post_id` and onto a **separate `collab_id` column**. `post_id` (= `post_id_short`) is now `SIF-{N}-P{global}` only. Grouping a collab's deliverables is done by `collab_id` (or the `(inf_id, collab_number)` pair), **not** by parsing the ID string. Child deliverable rows reuse the same model — each child gets its own `SIF-{N}-P{nextGlobal}` `post_id` and shares the parent's `collab_id`; the legacy `-D{n}` child suffix is gone.

### 4.2 `submit_reachout` RPC — POST_ID / INF_ID minting

Defined as `public.submit_reachout(...)` returning `TABLE(post_id, post_id_short, post_number, collab_number, inf_id, collab_id)`. Logic, in order:

1. Lowercase/trim the username; take `pg_advisory_xact_lock(hashtext('reachout-user:'||username))`.
2. Look up `creators.inf_id` by username. If absent, compute `SIF-{MAX(numeric suffix)+1}` over existing `creators.inf_id` and **insert a new `creators` row**; otherwise `coalesce`-update creator metadata.
3. Take a second advisory lock keyed on `inf_id`.
4. `post_number := MAX(posts.post_number)+1` (global); `collab_number := MAX(posts.collab_number)+1 WHERE inf_id = …` (per-creator).
5. Compose `post_id_short = inf_id || '-P' || post_number`, `post_id = post_id_short`, `collab_id = inf_id || '-C' || collab_number`.
6. Barter rule: `commercial_amount` forced to `0` when `collab_type = 'Barter'`.
7. Insert the `posts` row with `workflow_status = 'Reach Out'`, `reach_out_date = current_date`, `reachout_direction` (`inbound`/`outbound`).

The Server Action wraps the RPC with: RBAC gate (`reachout_inbound`/`reachout_outbound`), Zod validation (`ReachOutSchema`), a per-campaign duplicate-creator guard, a per-campaign creator-cap check (Σ `campaign_budget.num_influencers`), a closed-campaign guard, a post-insert `nomenclature` stamp, creator-enrichment fields written directly to `creators`, and an `instagram_cache` `pending` enqueue for the 3-hour Apify scrape Edge Function.

### 4.3 `submit_campaign` RPC — IFC{NNN} minting

Defined as `public.submit_campaign(p_form jsonb, p_budget_rows jsonb, p_month_label text)` returning `TABLE(campaign_id, campaign_num, total_budget)`. It atomically derives `campaign_num = MAX(campaigns.campaign_num)+1`, formats `campaign_id = 'IFC' || lpad(campaign_num,3,'0')`, writes the `campaigns` row plus its `campaign_budget` tier lines, and returns the total. The legacy "Name Identifier" input is retired — no identifier is collected from the form. The Server Action then stamps `campaigns.created_by = actor.email` for ownership (edit/close/reopen + Campaign-Ending alert targeting).

### 4.4 Deliverable Row Expansion (on Onboarding)

A single reach-out is one `posts` row. Onboarding (`features/onboarding/actions.ts → submitOrderCreation`) expands a multi-deliverable collab into one row **per deliverable**, all sharing the same `collab_id`:

- `total = reels + posts`. The **first** deliverable type is `reel` if any reels exist, else `post`.
- The **parent** row (the original reach-out `post_id`) is updated in place: `workflow_status = 'On Board'`, `reels`/`static_posts` reduced to the single first deliverable (1/0), `deliverable_index = 1`, `deliverable_role = 'parent'` (or `'single'` when `total ≤ 1`), `collab_id` stamped, plus order/bank/address fields from the validated Shopify order.
- For each remaining deliverable, a **child** row is inserted with a fresh global `post_id = inf_id || '-P' || nextPostNumber`, `deliverable_role = 'child'`, `deliverable_index = 2,3,…`, `deliverable_type = reel|post`, same `collab_id` and `collab_number`.
- **Equal-split commercials:** `commercial_amount = round(agreedTotal / total, 2)` on every row (parent + children), so `SUM(commercial_amount)` over the collab equals the originally agreed amount. Barter collabs are `0` throughout.

The action returns `{ postId, childrenSpawned }`. Order-Status and Accounts-Hub queries collapse children back to the collab via `collab_id` / `(inf_id, collab_number)` and a sibling-sum map for correct per-collab totals.

---

## 5. Workflow Stages & Pipeline

### 5.1 `workflow_status` Enum (`posts.workflow_status`)

The canonical pipeline status lives on each `posts` row. Observed/referenced members across the codebase:

```
Reach Out → On Board → Order Sent → Posted → Delivered
                                          ↘ RTO / Cancelled (terminal, order-driven)
                              Offboarding (manual terminal stage)
```

| Status | Set by | Meaning |
|--------|--------|---------|
| `Reach Out` | `submit_reachout` RPC | Creator contacted (inbound or outbound); not yet onboarded |
| `On Board` | `submitOrderCreation` (onboarding) | Collab confirmed, Shopify order linked, deliverable rows expanded |
| `Order Sent` | order dispatch path | Garment order dispatched (between onboarding and posting) |
| `Posted` | `features/posting/actions.ts` (posting submit) | Valid Instagram URL captured; flips status to `Posted` and seeds a Not-Due payment row |
| `Delivered` | order lifecycle | Garment delivered |
| `RTO`, `Cancelled` (and variants `RTO - Reverse Picked`, `RTO - Delivered`) | order lifecycle / order status | Terminal return/cancel outcomes |
| `Offboarding` | `features/offboarding/actions.ts → moveToOffboarding` | Manual terminal stage; moves the whole collab (`inf_id`, `collab_number`) together; deliberately does not touch `payment_status` so the collab stays in Accounts Hub until fully paid |

### 5.2 User-Facing Stages vs. Internal Status

The sidebar exposes fewer **stages** than there are internal statuses — several statuses collapse into one stage. The mapping (defined by the per-feature `workflow_status` filter sets) is:

| User-facing stage (route) | Internal `workflow_status` set | RBAC permission |
|---------------------------|-------------------------------|-----------------|
| Reach Out — Outbound (`/reach-out/outbound`) | `Reach Out` (direction = outbound) | `reachout_outbound` |
| Reach Out — Inbound (`/reach-out/inbound`) | `Reach Out` (direction = inbound) | `reachout_inbound` |
| Creator Onboarding (`/onboarding`) | work queue = `Reach Out`; onboarded = `On Board, Order Sent, Posted, Delivered` | `onboarding_write` |
| Order Status (`/order-status`) | rows with an `order_id` (any status); effective shipping lifecycle below | (read) |
| **Posting Data** (`/posting`) | work queue = **`On Board, Order Sent`**; submitted = `Posted` | `posting_submit` |
| Offboarding (`/offboarding`) | sets terminal `Offboarding` | `offboarding_write` |
| Accounts Hub (`/accounts-hub`) | payable subset = `Posted, Delivered` | `accounts_write` |

**Note the collapse:** `On Board` and `Order Sent` are both part of the **Posting** work queue — i.e. the user-facing "Posting" stage covers everything between onboarding completion and the post going live. Onboarding's "completed" view, conversely, treats `On Board / Order Sent / Posted / Delivered` as already-onboarded.

### 5.3 System & Dashboard Pages

The legacy standalone analytics pages were consolidated into **tabs inside the main Dashboard** (`features/dashboard/tab-config.ts`); their routes still exist and are directly reachable, but the sidebar entries were removed.

| Page | Route | Notes |
|------|-------|-------|
| Dashboard (tabbed command centre) | `/dashboard` | Tabs via `?tab=`: `overview`, `journey`, `tat`, `ad-status`, `compliance`, `cost`, `funnel`, `internal` — each tab reuses the corresponding feature's full page component |
| My Dashboard | `/my-dashboard` | Per-actor workload board |
| New Campaign | `/campaigns/new` | `campaign_create` |
| Sheet View | `/sheets` | RBAC-gated read of the legacy sheet shape (Supabase-backed) |
| User Panel | `/admin/users` | `admin` — RBAC, roles, campaign assignment |
| Error Portal | `/errors` | Surfaces `system_errors` (e.g. missing collab email, Apify scrape failures from the 3-hr Edge Function) |

### 5.4 Order-Status Effective-Status Lifecycle

Order Status (`features/order-status/queries.ts` + `types.ts → bucketStatus`) joins each order-bearing `posts` row to its `shopify_orders` row (live tracking, synced by the Supabase Edge Function on a 3-hr `pg_cron`) and computes an **effective status**:

```
effective = lower( shopify_orders.tracking_status || posts.order_status )
            // live Shopify tracking wins; manual order_status is the fallback
```

`bucketStatus(effective)` collapses the effective string into six KPI buckets:

| Bucket | Effective values |
|--------|-----------------|
| `pending` | empty, `unfulfilled`, `pending dispatch`, `processing`, `on hold`, `scheduled` (default fallback) |
| `transit` | `in transit`, `fulfilled`, `partially fulfilled`, `shipped`, `confirmed` |
| `delivered` | `delivered` |
| `rto` | `rto`, `restocked` |
| `cancelled` | any value containing `cancelled` |

The special value `order cancelled after rto` is counted into a dedicated `cancelledRto` KPI. A row is **overdue** when `est_delivery < today` and the effective status is not in `{delivered, rto, order cancelled, order cancelled after rto}`. Revenue/refund/repeat-customer KPIs accumulate from the joined `shopify_orders` commerce-intel columns (with a graceful PostgREST `42703` fallback to base columns when the expanded-columns migration is absent).


---


# 5. Forms, Validation & Error Handling

I now have a complete, code-accurate picture. Producing the section.


Every workflow stage submits through a **React Server Action** (`features/<stage>/actions.ts`, marked `"use server"`). The server action is the **single authoritative validation boundary** — the client form runs the same Zod schema for instant UX feedback, but the server **never trusts the client** and re-parses on every call. Each action follows an identical contract: `assertPermission(<rbacKey>)` → `Schema.safeParse(input)` → business-rule guards → Supabase write via service-role client (RLS bypass, already gated by the permission check) → `revalidateTag` / `revalidatePath`.

### 6.1 Zod Schemas (client + server, server-authoritative)

Schemas live in `features/<stage>/schema.ts` and are imported by both the client form and the server action, so there is one definition of truth.

| Stage | Schema | File | Notable rules |
|-------|--------|------|---------------|
| Reach-Out (inbound + outbound) | `ReachOutSchema` | `features/reach-out/schema.ts` | `campaignId` required (`min(1)`); `instagramLink` must match `IG_PROFILE_RE`; `influencerName`, `contentType` required; enum-validated `gender` / `verification` / `language`. |
| Campaign Create / Edit | `CampaignCreateSchema` | `features/campaigns/schema.ts` | `superRefine`: allocated creators (Σ `numInfluencers`) must be ≥ 1; if `numCreators` cap set, allocated may not exceed it; `endDate ≥ startDate`. Per-row `BudgetRowSchema` enforces tiers + collab type. |
| Onboarding / Order Creation | `OnboardingSchema` | `features/onboarding/schema.ts` | `postId`, `orderId`, `estDelivery` required; enum `orderStatus`; `superRefine`: `bankName` / `bankNumber` / `ifsc` required **only when** `collabType = "Barter + Paid"`. `applyBarterLock()` forces `commercials = 0` for pure Barter. |
| Posting | `PostingSchema` | `features/posting/schema.ts` | `postLink` required URL; `downloadLink` mandatory when ads usage rights granted; `partnershipId` required (and must be numeric Meta code) when ad rights granted. |
| Accounts Hub (payments) | `PaymentSubmitSchema` / `PaymentBatchSchema` | `features/accounts-hub/schema.ts` | `postId`, `utr`, `paymentDate` (`yyyy-MM-dd`) required; `amount > 0`; batch capped at `max(10)` rows. |

**Server-side parse + error shape.** On a parse failure the action returns a discriminated-union failure object — never a thrown exception:

```ts
const parsed = ReachOutSchema.safeParse(input);
if (!parsed.success) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }
  return { ok: false, error: "Validation failed", fieldErrors };
}
```

Every action result is `{ ok: true, ... } | { ok: false, error: string, fieldErrors?: Record<string,string> }`, so the client can route field-level messages back onto the form and a top-level message into a toast.

### 6.2 `MissingFieldsAlert` pattern

`components/ui/missing-fields-alert.tsx` is a shared red required-fields banner rendered directly above the submit button on **every** stage form (Reach-Out, Campaigns, Onboarding, Posting, Accounts payment form). It is mounted unconditionally and renders `null` when its `fields` array is empty — visibility is data-driven only.

- The form runs the **same Zod schema** (`Schema.safeParse(allValues)`) against current form values to derive a deduped list of **friendly column labels** (e.g. `"Campaign ID"`, `"Reach Out Date"`), not raw field keys.
- Server `fieldErrors` returned from a rejected action are merged back in, so a server-only rule (e.g. duplicate-creator, closed campaign) also surfaces in the banner.
- Copy auto-pluralizes: `Kindly fill the "Campaign ID" and "Content Type" columns to submit the form.` It carries `role="alert"` + `aria-live="assertive"` for accessibility.

### 6.3 Error-Handling Matrix (as implemented)

All guards run **server-side** in the relevant action, after Zod parse and permission check. Supabase is the sole source of truth — there are no Google Sheets writes and no `LockService`; atomic ID generation is delegated to Postgres RPCs (`submit_reachout`, `submit_campaign`).

| # | Error case | Where enforced | Behaviour |
|---|-----------|----------------|-----------|
| 1 | **Missing Campaign ID** | `ReachOutSchema.campaignId.min(1)` + `submitReachOut` (`features/reach-out/actions.ts`) | Reach-out blocked at parse; `fieldErrors.campaignId` → MissingFieldsAlert. A reach-out cannot exist without a campaign. |
| 2 | **Invalid / unfound Shopify Order** | `submitOnboarding` (`features/onboarding/actions.ts`) | Looks up `shopify_orders` by `order_id`; on miss, fires a **live on-demand pull** to the `sync-shopify-orders` Edge Function (`POST .../functions/v1/sync-shopify-orders?order_id=…`), which upserts only if the order carries the influencer (`INF`) tag, then re-checks. Still not found → returns `{ ok:false, fieldErrors:{ orderId: "Order not found / not tagged" } }` **and** emails the **assigned user** (the onboarding actor) a `SHOPIFY_VALIDATION_FAILED` alert via `after()` (logged to `email_logs`). Onboarding is blocked. |
| 3 | **Duplicate Creator** | `submitReachOut` | Before the RPC, queries `posts` by `ilike(username)` + `campaign_id`; if any prior collab in the **same campaign** is non-`Cancelled`, blocks with `"This creator is already in this campaign."` (`fieldErrors.instagramLink`). Per-campaign — a `Cancelled` prior does not block. |
| 4 | **Missing Partnership Key** (ads usage rights granted) | `submitPayments` / `submitSinglePayment` (`features/accounts-hub/actions.ts`), §8.2 gate | **Collab-wide block.** For a Done attempt (UTR present), if the post **or any sibling deliverable** sharing the `collab_id` has `ads_usage_rights = Yes` but neither `ad_partnership_valid = true` nor a non-empty `partnership_id`, the payment is rejected into `blockedByAdPartnership`, with `blockedDetails[].partnershipMissingSiblings` naming the offending `post_id_short`(s). Draft writes (no UTR) still pass. Saadaa pays per-collab, so one deficient sibling blocks the whole collab. |
| 5 | **Missing Mandatory Fields** | Every `*Schema` + its action | Prevented at parse; `fieldErrors` map → MissingFieldsAlert lists all missing columns. Conditional requireds enforced via `superRefine` (e.g. bank details for `Barter + Paid`; `downloadLink` / `partnershipId` when ad rights granted). |
| 6 | **Campaign Creator Cap** (decision 2026-06-07) | `submitReachOut` | After the duplicate guard, sums the campaign's allocation `cap = Σ campaign_budget.num_influencers`, then counts **distinct active creators** already on the campaign (non-`Cancelled` `posts.username`). The new creator would push the count to size+1, so when `activeCreators.size >= cap` the reach-out is hard-blocked: `"Campaign <id> is at its creator cap (n/cap). Increase the campaign's budget allocation…"` (`fieldErrors.campaignId`). The cap is shared across **inbound + outbound** (both directions hit the same `posts`/`campaign_budget` count). `cap = 0` (no budget rows) ⇒ no cap. |
| 7 | **Closed-campaign reach-out block** | `submitReachOut` | Reads `campaigns.status`; if `"closed"` (case-insensitive — includes campaigns auto-closed past `end_date` by the daily cron in `app/api/cron/notifications/route.ts`), blocks new creators: `"Campaign <id> is closed. Reopen it (Campaign Owner / Global Admin) to add creators."` (`fieldErrors.campaignId`). Reopen via `reopenCampaign()` (Campaign Owner / Global Admin). |

### 6.4 Additional payment gates (Accounts Hub)

`submitPayments` runs a multi-gate pipeline before any `payments` write; each rejected row is bucketed so the UI can show an exact toast:

| Gate | Bucket | Rule |
|------|--------|------|
| Stage gate | `blockedByStage` | Post must be in `Posted` or `Delivered`. |
| §7.2 Posting-completeness (reel rule) | `blockedByReelRule` | **Collab-wide** — any sibling missing `post_link` or `post_date` locks every payment in the collab; `blockedDetails[].unpostedSiblings` names them. |
| §8.2 Ad-partnership | `blockedByAdPartnership` | See matrix row 4. |
| Dedup / fully-paid | `duplicates` | Same `(post_id, lower(utr))` already recorded, or the collab is already fully paid (paid-so-far ≥ collab agreed total). Partial-payment installments are allowed until the total is met. |

Validation failures here are **non-fatal at the batch level**: accepted rows still write, and the action returns counts (`saved`, `paid`, `partial`, `due`, `skipped`) plus the per-bucket arrays and `blockedDetails`, rather than failing the whole submission.

### 6.5 Edit-time guards

- **Reach-out edit** (`editReachOut`, Decision D7): only `contentType` / `contentName` are editable. Once `workflow_status` leaves `"Reach Out"`, creator metadata (`username`, `followers`, `verification`, name) is **frozen** — an inbound value differing from the stored snapshot is rejected with the list of locked fields.
- **Campaign edit** (`editCampaign`, Decision D8): allowed even when reach-outs are tied to the campaign, but it does **not** retroactively rewrite existing `posts.commercial_amount`; the result carries a `warning` with the tied-reach-out count.


---


# 6. Campaigns — Creation, Ownership & Lifecycle

I now have everything I need. I note one important nuance: the RPC inserts `status = 'active'` (lowercase) while the table default is `'Active'` — and the auto-close cron filters `not status ilike 'closed'`, so case doesn't break the logic. I have all the facts needed. Let me write the section.


Campaigns group reach-outs under a single brief, budget plan, and creator cap, and seed the campaign filters used downstream in Reach Out and Onboarding. The feature lives entirely in the Next.js app — `features/campaigns/*` plus the cron route — with Supabase as the sole source of truth. The legacy Google Apps Script `submitCampaign` / Google-Sheet dual-write described in the old document no longer exists; the only persistence path is the `submit_campaign` Postgres RPC and direct service-role writes to the `campaigns` / `campaign_budget` tables.

### 7.1 Source files

| Path | Role |
|------|------|
| `app/(app)/campaigns/page.tsx` | Campaigns list page; gates create/manage UI via RBAC |
| `app/(app)/campaigns/new/page.tsx` | New-campaign route |
| `features/campaigns/schema.ts` | Zod `CampaignCreateSchema`, tiers, collab types, budget-math constants/helpers |
| `features/campaigns/actions.ts` | Server actions: `submitCampaign`, `editCampaign`, `fetchCampaignForEdit`, `closeCampaign`, `reopenCampaign` |
| `features/campaigns/queries.ts` | `fetchCampaigns` (cached read + budget rows + creators-used rollup) |
| `features/campaigns/create-form.tsx` | Create/edit form (budget table, live totals) |
| `features/campaigns/create-switcher.tsx` | Create / Existing tab switcher |
| `features/campaigns/existing-campaigns.tsx` | Card grid, detail modal, edit modal, close/reopen buttons |
| `app/api/cron/notifications/route.ts` | Daily cron: Campaign Ending Soon alert + end-date auto-close |
| `lib/rbac.ts` | `campaign_create` / `campaign_edit` permission keys + Campaign Owner role grants |

### 7.2 Data model

Two tables back the feature. Derived money columns on `campaign_budget` are **GENERATED ALWAYS** — application code never writes them.

**`campaigns`**

| Column | Type | Notes |
|--------|------|-------|
| `campaign_id` | text | `IFC{NNN}` (e.g. `IFC001`), minted by the RPC |
| `campaign_num` | integer | Monotonic counter; `max+1` under an advisory lock |
| `campaign_name`, `key_message` | text | Required |
| `start_date`, `end_date` | date | Optional campaign window |
| `total_budget` | numeric | Compensation + garment cost (see 7.4) |
| `no_of_creators` | text | Optional target/cap input |
| `brief_link`, `internal_brief_link` | text | Creator brief (required) + internal brief (optional) |
| `status` | text | Default `'Active'`; `'Closed'` when closed |
| `created_by` | text | Owner email, stamped post-insert |
| `auto_closed_at` | timestamptz | One-shot guard for end-date auto-close / reopen |
| `ending_alert_sent` | boolean | Default `false`; fire-once flag for the ending-soon alert |
| `created_at`, `updated_at` | timestamptz | |

**`campaign_budget`** (one row per tier/collab line)

| Column | Type | Notes |
|--------|------|-------|
| `campaign_id` | text | FK back to `campaigns` |
| `month_label` | text | e.g. `"Jun 2026"`; preserved across edits |
| `tier`, `collab_type`, `campaign_name` | text | Tier label, `Barter`/`Paid`, segment |
| `num_influencers` | integer | Default 0 |
| `avg_comp` | numeric | Per-creator compensation (0 for Barter) |
| `min_garments` | integer | Fixed 2 |
| `max_garments` | integer | Default 3 |
| `total_cost` | numeric | **GENERATED**: `num_influencers * avg_comp` |
| `est_garment_cost` | numeric | **GENERATED**: `max_garments * 900 * 0.6` |
| `total_with_garments` | numeric | **GENERATED**: `total_cost + (est_garment_cost * num_influencers)` |

### 7.3 Access control — Campaign Owner role

Campaign create/edit/close/reopen is restricted to two permission scopes, both defined in `lib/rbac.ts`:

| Permission key | Description |
|----------------|-------------|
| `campaign_create` | Create campaigns |
| `campaign_edit` | Edit, close + reopen campaigns |

As of 2026-06-07 these scopes were **removed from the `User` role** and are now held only by:

- **Global Admin** — holds every scope, including both campaign scopes.
- **Campaign Owner** — a dedicated role granting `campaign_create`, `campaign_edit`, plus base reads (`performance_view`, `order_status_view`, `sheet_view`).

`normalizeRole` maps the DB role string `"campaign owner"` to the `Campaign Owner` grant set. Permissions resolve dynamically from `access_roles` / `access_role_permissions` at request time; `STATIC_GRANTS` in `lib/rbac.ts` is the fallback when an actor hasn't been hydrated. Every action calls `assertPermission(...)` server-side, and the page (`app/(app)/campaigns/page.tsx`) computes `canManage = hasPermission(actor, "campaign_create") || hasPermission(actor, "campaign_edit")` to hide the New Campaign button, Edit, and Close/Reopen controls from users without rights. The list page itself is gated on `reachout_outbound`, so any user who can reach out can view campaigns but not manage them.

### 7.4 Creation flow (`submitCampaign` → `submit_campaign` RPC)

1. `assertPermission("campaign_create")` resolves the actor.
2. Input is validated with `CampaignCreateSchema` (`features/campaigns/schema.ts`): name, key message, brief URL required; end-date ≥ start-date; at least one budget line with ≥1 allocated influencer; and **allocated ≤ `numCreators` cap** when that cap is set.
3. The action calls the `submit_campaign(p_form, p_budget_rows, p_month_label)` RPC, which:
   - Re-validates server-side (legacy parity).
   - Takes `pg_advisory_xact_lock(hashtext('submit_campaign:counter'))` to serialize ID minting under concurrency.
   - Computes `campaign_num = max(campaign_num)+1` and `campaign_id = 'IFC' || lpad(num,3,'0')`.
   - Computes `total_budget = Σ (num_influencers × avg_comp) + Σ (num_influencers × max_garments × 900 × 0.6)`.
   - Inserts the `campaigns` row and the `campaign_budget` lines (raw inputs only — GENERATED columns are left for Postgres).
   - Returns `{ campaign_id, campaign_num, total_budget }`.
4. **Ownership stamping:** the RPC signature is fixed, so the action issues a follow-up service-role `UPDATE campaigns SET created_by = actor.email`. A failed stamp leaves `created_by` NULL (owner "unknown") and is logged, never fatal.
5. Cache invalidation: `revalidateTag("campaigns")` + `revalidatePath` for `/campaigns`, `/reach-out/outbound`, `/onboarding`.

Budget math constants (Tracker-derived, in `schema.ts`): `GARMENT_UNIT_COST = 900`, `GARMENT_COST_FACTOR = 0.6`, `MIN_GARMENTS_FIXED = 2`. Tiers are `Nano (1K to 10K)` → `Mega (1M+)`; collab type is `Barter` (avg comp locked to 0) or `Paid`.

### 7.5 Edit flow (`editCampaign`)

`editCampaign(campaignId, input)` is gated on `campaign_edit`. There is no RPC (the ID is already minted, so there is no counter to serialize):

- Validates with the same `CampaignCreateSchema`; confirms the campaign exists.
- `UPDATE`s the `campaigns` row and recomputes `total_budget` = compensation + garment cost (`totalAll`).
- **Replaces** budget rows: delete-then-insert of the new `campaign_budget` set, preserving the original `month_label` so monthly roll-ups stay stable.
- **Decision D8:** editing `avg_comp` / `num_influencers` does **not** retroactively rewrite existing posts' `commercial_amount`. If reach-outs are already tied to the campaign, the edit still succeeds but returns a `warning` carrying the tied count.

`fetchCampaignForEdit(campaignId)` (also `campaign_edit`-gated) loads the campaign + budget rows shaped as `CampaignCreateInput` to prefill the edit modal.

### 7.6 Lifecycle — status, auto-close, manual close/reopen

A campaign is `Active` or `Closed`. Three mechanisms move it between states:

| Trigger | Mechanism | Effect |
|---------|-----------|--------|
| End date passes | Cron check 7 in `app/api/cron/notifications/route.ts` | `status='Closed'`, stamps `auto_closed_at` (one-shot) |
| Manual close | `closeCampaign(id)` (`campaign_edit`) | `status='Closed'` |
| Manual reopen | `reopenCampaign(id)` (`campaign_edit`) | `status='Active'`, stamps `auto_closed_at = now()` |

The auto-close cron updates campaigns where `end_date < today AND auto_closed_at IS NULL AND status NOT ILIKE 'closed'`. Because reopen stamps `auto_closed_at`, a deliberately reopened campaign is never re-closed by the cron. Manual close/reopen are surfaced as the Close / Reopen button on each card (and Edit in the detail modal), visible only when `canManage` is true.

### 7.7 Creator cap (used / cap)

Each campaign carries an implicit creator cap equal to the sum of its budget lines' `num_influencers`. `fetchCampaigns` (`features/campaigns/queries.ts`) computes the **used** side as the count of distinct, non-`Cancelled` creators (by lowercased `username`) on `posts` for that campaign, exposed as `creators_used`. The card and detail modal render `creators_used / creatorCap` (e.g. `4 / 10`), falling back to `no_of_creators` when no budget lines define a cap. At submit/edit time, `CampaignCreateSchema` enforces `allocated ≤ numCreators` when the optional `numCreators` target is provided.

### 7.8 Notifications

| Event | Type | Recipient |
|-------|------|-----------|
| Campaign created (broadcast) | `campaign_created` | Active Global Admins (actor excluded) |
| Campaign created (confirmation) | `campaign_confirmation` | The actor only |
| Campaign Ending Soon | `campaign_ending` | Campaign **owner** (`created_by`); falls back to active Global Admins for ownerless legacy campaigns |

On create, two emails fire-and-forget via `after()`, deduped so the actor receives exactly one (admin broadcast excludes the actor; the actor gets the dedicated confirmation).

**Campaign Ending Soon** is the daily cron's check 6. It selects campaigns where `end_date` is within `CAMPAIGN_ENDING_WITHIN_DAYS` (7) and still in the future, `ending_alert_sent = false`, emails the owner (`campaigns.created_by`), and stamps `ending_alert_sent = true` so it fires at most once per campaign. Check 7 (auto-close) then runs once the date has actually passed. The cron route runs daily at `0 4 * * *` (per `vercel.json` crons), is `force-dynamic`, and is authorized via the `x-vercel-cron` header or `Authorization: Bearer ${CRON_SECRET}`.


---


# 7. Accounts Hub — Payments

Confirmed. The live `payments` table has `eligibility_email_sent` and `sla_breach_alert_sent` columns (plus the rest). Note `id` is `bigint` (not the generated-types `string`), and there is no `logged_by` or `match_status` column in the live DB — match status is computed live. I now have all facts verified. Writing the section.


The Accounts Hub is the terminal stage of the collab lifecycle: where the agreed creator compensation is tracked from accrual to settlement. In the current stack it is a Next.js App Router route backed entirely by Supabase — there is no Google Sheet ledger, no `ensureAccountsSheet_`, and no dual-write. The page lives at `app/(app)/accounts-hub/page.tsx`; all read/aggregation logic is in `features/accounts-hub/queries.ts` and all mutations in the `"use server"` module `features/accounts-hub/actions.ts`. RBAC is enforced server-side: writes call `assertPermission("accounts_write")` (`lib/rbac.server.ts`) and the page itself is gated before the service-role client is ever used.

Payment is raised **per collab, not per deliverable**. A multi-deliverable collab (e.g. 1 reel + 2 stories) carries a single payment that lives on the representative deliverable (lowest `post_id` sharing the `collab_id`). The grouping key, `collabKeyOf`, prefers the stamped `collab_id` and falls back to `inf_id || '-C' || collab_number`, then to `post_id`.

### 8.1 The `payments` table

The sole ledger is the Supabase `payments` table (verified live):

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigint` (identity) | PK |
| `post_id` | `text` | Representative deliverable of the collab |
| `deliverable_post_id` | `text` | Same as `post_id` under the per-collab model |
| `collab_id`, `inf_id`, `username` | `text` | Collab + creator identity |
| `collab_number`, `deliverable_index` | `int` | Collab/deliverable position |
| `utr` | `text` | Bank reference; `null` on a draft row |
| `amount` | `numeric` | Installment amount (or collab total on a draft) |
| `payment_date` | `date` | When the transfer was made |
| `status` | `text`, default `'Not Due'` | One of `Not Due` / `Due` / `Partial` / `Done` |
| `due_date` | `date` | `post_date + 30 days` |
| `estimated_payable_date` | `date` | Next 15th/30th on or after `due_date` |
| `bank_name`, `bank_number`, `ifsc` | `text` | Compliance archival |
| `payment_advice_sent` | `boolean`, default `false` | Reserved (advice email path not active) |
| `posted_but_not_tested` | `boolean`, default `false` | Ad-eligible but not yet tested in the Meta Ads warehouse; annotation only, never blocks |
| `eligibility_email_sent` | `boolean`, default `false` | Cron fire-once flag (Due notice) |
| `sla_breach_alert_sent` | `boolean`, default `false` | Cron fire-once flag (overdue notice) |
| `created_at` | `timestamptz`, default `now()` | Latest-row ordering key |

There is **no `match_status` column** — match status is computed live (§8.5). The dedup contract is `(post_id, lower(utr))`: the same bank UTR may cover several `post_id`s (one transfer, many collabs), but the same UTR twice on one collab is a duplicate. A collab carries at most one `null`-`utr` draft row plus N installment rows (each a distinct UTR).

### 8.2 Payment state machine — Not Due / Due / Partial / Done

The `status` enum (`PaymentStatus = "Not Due" | "Due" | "Partial" | "Done"`) drives the Kanban board (`accounts-kanban.tsx`) and KPI strip. The `Partial` state was added to the legacy three-state machine to support installment payments.

| State | Meaning | Entered when |
|-------|---------|--------------|
| **Not Due** | Accrued, due date not yet reached | Auto-init draft created on Posted (§8.3) |
| **Due** | Payable now, no money moved | `recomputePaymentStates` flips Not Due → Due once `due_date ≤ today`; or a draft write with no UTR |
| **Partial** | Money paid but `0 < paid-so-far < collab total` | An installment is logged whose cumulative paid amount does not yet cover the collab total |
| **Done** | Fully settled (`paid-so-far ≥ collab total`) | An installment brings cumulative paid to/above the collab total |

The collab total is the **sum of `commercial_amount` across every deliverable sharing the `collab_id`** (each row stores the per-row equal split). `queries.ts` and `actions.ts` compute this identically (`collabSumMap` / `collabTotalByKey`) so the board and the submit path agree on the threshold. Once a collab is `Done`, the rollup status is cascaded to every sibling deliverable's `posts.payment_status`, and stray payment rows on the siblings are deleted to keep spend one-row-per-collab; while `Partial`, siblings are left untouched.

### 8.3 The payable cycle & auto-init draft on Posted

Saadaa pays creators on the **15th and 30th** of each month (`PAYABLE_CYCLE_DAYS = [15, 30]` in `lib/payable-cycle.ts`). Two helpers compute the dates:

- `paymentDueDateFor(postDate)` → `post_date + 30` days (`PAYMENT_DUE_DAYS = 30`).
- `nextPayableCycleDate(due)` → the next pay-out date on or after the due date: due-day ≤ 15 → the 15th of that month; 15 < due-day ≤ 30 → the 30th (clamped to the last day for February); due-day > 30 → the 15th of the next month.

When a collab's posting is submitted, `submitPosting` (`features/posting/actions.ts`) sets `posts.payment_status = "Not Due"` and calls **`autoInitDraftPayment`** (port of legacy `_autoInitDraftPayment_`). This function:

1. Resolves the collab's deliverables and picks the representative (lowest `post_id`).
2. Is **idempotent** — bails if any non-`Done` payment row already exists for the representative.
3. Enforces **collab-level eligibility** — does not create a draft until *every* deliverable has both `post_link` and `post_date`, and no `ads_usage_rights=Yes` deliverable is missing a partnership key. This prevents a phantom UTR-less row the operator can't act on.
4. Inserts a `Not Due` row with `amount` = full collab total, `due_date = paymentDueDateFor(postDate)`, and `estimated_payable_date = nextPayableCycleDate(dueDate)`.

`queries.ts` also performs an idempotent backfill on every Accounts Hub load: eligible Posted/Delivered collabs lacking a payment row get a `Not Due` draft inserted, and rows with a null `due_date` (created before the cycle helpers existed) are healed in place.

### 8.4 Server-side guards in `submitPayments`

`submitPayments(input)` (and the single-row wrapper `submitSinglePayment`) validate against `PaymentBatchSchema` (max 10 rows per submit; `features/accounts-hub/schema.ts`), then run every row through a **collab-level gate pipeline** before any write. Both guards are stricter than legacy because Saadaa pays per-collab — any single offending sibling locks the entire collab.

| Gate | Condition that blocks | Result bucket |
|------|----------------------|---------------|
| **Stage** | `workflow_status ∉ {Posted, Delivered}` (or post not found) | `blockedByStage` |
| **§7.2 Posting completeness** | ANY sibling in the collab is missing `post_link` OR `post_date` | `blockedByReelRule` |
| **§8.2 Partnership key** | A UTR is present (a `Done`/installment attempt) AND `ads_usage_rights = Yes` on the row or any sibling, but the row/sibling has neither `ad_partnership_valid = true` nor a non-empty `partnership_id` | `blockedByAdPartnership` |
| **Dedup / already-paid** | Collab already fully paid (`paidSoFar ≥ collabTotal`), or exact `(post_id, lower(utr))` re-submission | `duplicates` |

The §8.2 partnership gate fires **only on `Done` attempts** (rows carrying a UTR) — a UTR-less draft write still passes even while a sibling lacks a partnership key. `ads_usage_rights` truthiness uses the `ADS_YES` helper, treating any non-empty value outside `{"", no, n/a, none, 0, false}` as Yes (so free-text durations like "5 Months" count). Each blocked row is returned with a `BlockedDetail { postId, unpostedSiblings, partnershipMissingSiblings }` so the toast can name the exact siblings to fix.

Accepted rows are written: installments (UTR present) are inserted as new rows stamped with the recomputed rollup status (`Partial` or `Done`), the lone draft is retired in place, and `posts.payment_status` / `utr` / `payment_date` are mirrored onto the representative and cascaded to siblings. The result envelope is `{ ok, saved, paid, due, partial, skipped, skippedIds, blockedByStage, blockedByReelRule, blockedByAdPartnership, duplicates, blockedDetails }`. After writing, the Meta Ads warehouse covered set (5s timeout fallback) stamps `posted_but_not_tested` on each row — annotation only, never blocking. Cache is invalidated via `revalidateTag("payments" | "posts")` and `revalidatePath` for `/accounts-hub`, `/journey`, `/my-dashboard`.

### 8.5 Payment functions

| Function | File | Role |
|----------|------|------|
| `submitPayments(input)` | `accounts-hub/actions.ts` | Batch submit (≤10 rows); full gate pipeline + installment accounting + notifications |
| `submitSinglePayment(input)` | `accounts-hub/actions.ts` | Single-row wrapper → `submitPayments({ rows: [...] })` |
| `autoInitDraftPayment(...)` | `posting/actions.ts` | Idempotent `Not Due` draft creation on Posted |
| `recomputePaymentStates()` | `accounts-hub/actions.ts` | Reconciliation: Not Due → Due when `due_date ≤ today`, heals null `estimated_payable_date`, auto-clears `posted_but_not_tested` once the ad is tested |
| `fetchAccountsHubData(filters)` | `accounts-hub/queries.ts` | Board/table read: collapses deliverables per collab, overlays the latest payment row, backfills drafts, computes KPIs |
| `fetchPayableEligiblePosts()` | `accounts-hub/queries.ts` | "Log Payment" dropdown source — one representative row per fully payment-ready collab |
| `fetchAccountsFilterOptions()` | `accounts-hub/queries.ts` | Cached (5 min) campaign/status/ads-rights filter options |

KPIs (`computeKpi`) are derived over the Posted+Delivered corpus **before** filters are applied (filter bar shows a count chip; KPIs stay global), and split into Not Due / Due / Partial-Outstanding / Done buckets plus a `totalPayable` that always counts the full agreed collab total.

### 8.6 Match status

Match status is **computed live at render time** — there is no stored column. `computeMatchStatus(entered, commercial)` in `lib/payable-cycle.ts` returns one of:

| Result | Condition |
|--------|-----------|
| `Matched with Creator Hub` | `paid > 0`, `commercial > 0`, `paid === commercial` |
| `Not Matched with Creator Hub` | both `> 0` but unequal |
| `Unverified` | either is `≤ 0` |

`columns.tsx` compares **paid-so-far** (cumulative across installments) against the agreed collab `commercial_amount`, so a collab fully paid over several installments still reads "Matched" rather than being flagged as "Off by" on the last partial transfer. The badge renders as Matched / Not Matched / Unverified.

### 8.7 Notifications

Payment notifications come in two flavours — one event-driven (to the creator), two time-based (to the accounts team). All sends go through `sendNotification` (`lib/notifications.ts`), are best-effort, and are logged to `email_logs`. SMTP uses the shared `EMAIL_USER` / `EMAIL_PASS` config.

**Event-driven — Payment Processed (creator).** Inside `submitPayments`, every collab that reaches `Done` in the batch is queued and emailed via `next/server`'s `after()` (fire-and-forget). The recipient is resolved from the post's own `email`, falling back to the creator record by `inf_id`. Type `PAYMENT_PROCESSED` (`payment_processed`); the branded HTML confirms amount, UTR, and payment date. Separately, **one summary email** goes to the submitting operator via `notifyActorConfirmation` (`PAYMENT_CONFIRMATION`) with the saved/paid/partial/due/skipped counts.

**Time-based — Payment Eligibility & SLA (accounts team).** The daily Vercel Cron route `app/api/cron/notifications/route.ts` (`vercel.json`: `"0 4 * * *"`, 04:00 UTC; auth via `x-vercel-cron` header or `Bearer ${CRON_SECRET}`) runs both payment checks against the `payments` table:

| Check | Query | Recipient | Fire-once flag | Type |
|-------|-------|-----------|----------------|------|
| Payment Eligibility | `status = 'Due'` AND `eligibility_email_sent = false` | Accounts team | `eligibility_email_sent` | `PAYMENT_ELIGIBLE` |
| Payment SLA Breach | `status IN ('Due','Partial')` AND `due_date < today − 7` AND `sla_breach_alert_sent = false` | Accounts team | `sla_breach_alert_sent` | `PAYMENT_SLA_BREACH` |

Each row is emailed once and its flag stamped so later runs never re-fire (`PAYMENT_SLA_BREACH_AFTER_DAYS = 7`). The recipient set is resolved by `resolveAccountsTeamEmails()` — active `user_access` rows whose `role ∈ {Accounts Team, Accounts}`. Both checks are independently try/caught so one failure never aborts the others. Note the Not Due → Due flip itself is performed by `recomputePaymentStates()` (intended to ride the existing 3-hr scrape cron / admin trigger), not inside this notifications route; the eligibility check simply reads whatever is already `Due`.

---

Key file paths (all under `New Influencer Project/apps/web/`): `app/(app)/accounts-hub/page.tsx`, `features/accounts-hub/{actions.ts,queries.ts,schema.ts,columns.tsx,accounts-kanban.tsx,kpi-strip.tsx}`, `features/posting/actions.ts` (`autoInitDraftPayment`), `lib/payable-cycle.ts`, `lib/notifications.ts`, `app/api/cron/notifications/route.ts`, `vercel.json`.


---


# 8. Email Notifications

I now have everything needed to write the section accurately.


CreatorHub sends all transactional and time-based email through a single Gmail SMTP transport, wrapped in one branded helper and audited to a `email_logs` table. There is no Google Apps Script `MailApp`/`GmailApp` path anymore and no Google-Sheets write — every send is best-effort, never throws into its caller, and is logged to Supabase. Emails are **reply-to only** (no creator portal exists), so they carry no in-app action links — the lone exception is the User Invitation, which links to `/login` for Google sign-in.

### 9.1 Transport — Gmail SMTP via Nodemailer (`lib/email.ts`)

The low-level sender is `sendMail()` in `apps/web/lib/email.ts`. It builds a Nodemailer transport against `smtp.gmail.com:465` (`secure: true`, implicit TLS) using a Gmail App Password.

| Concern | Detail |
|---|---|
| Library | `nodemailer` |
| Host / port | `smtp.gmail.com` / `465`, `secure: true` |
| Auth | `EMAIL_USER` (sending address) + `EMAIL_PASS` (Gmail App Password) |
| From header | `"${EMAIL_FROM_NAME ?? "Saadaa"}" <${EMAIL_USER}>` |
| Config source | `lib/env.server.ts` (`serverEnv.EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM_NAME`) — set in Vercel prod env, not in source |

`sendMail()` returns `{ ok, messageId?, error? }`. If `EMAIL_USER`/`EMAIL_PASS` are unset it returns `{ ok:false }` rather than throwing. It supports `to`/`cc`/`bcc` (string or array, joined to comma-separated), `replyTo`, an HTML `htmlBody`, an optional `plainBody` (`text`), and base64 `attachments` decoded to `Buffer`. Any SMTP error is caught and surfaced as `{ ok:false, error }`.

### 9.2 Branded wrapper + send helper (`lib/notifications.ts`)

`lib/notifications.ts` (marked `server-only`) sits on top of `sendMail()` and is the single entry point every feature uses.

**`sendNotification(input)`** — sends one branded email to one or more recipients and logs each attempt.
- Recipients are normalized via `normalizeRecipients()`: trimmed, lower-cased, de-duped, `@`-validated; if none remain the send is skipped silently (`{ ok:true, sent:0, skipped:true }`).
- Unless `wrap === false`, the inner `htmlBody` is passed through `wrapNotificationHtml()`. `title` defaults to `subject`; `subtitle` is the optional uppercase ID line.
- Each recipient gets its own `sendMail()` call (in parallel), and each attempt is inserted into `email_logs`.
- It **never throws** — an outer try/catch backstops the whole function and returns `{ ok, sent, skipped, error? }`.

**`wrapNotificationHtml({ title, subtitle?, bodyHtml })`** — the shared branded HTML shell, visually matched to the legacy collab email: dark header band `#2C2420`, ecru body `#FAF8F5`, gold `Saadaa` accent pill `#F0C61E`, 600px max width, 12px corners, `#E7E2D2` borders, and the footer line *"This email was sent via CreatorHub, Saadaa's Influencer Management Platform."* All caller-supplied title/subtitle text is HTML-escaped.

**`buildConfirmationBody({ greetName, summaryLines, rows?, footnote? })`** — builds the standard confirmation interior: `Hi <name>,` greeting → summary `<p>`s → a key/value detail table (`#F5F1EC` label cells, `#E7E2D2` borders) → a *"Thanks, / Saadaa CreatorHub"* signature. All values escaped.

**`notifyActorConfirmation({ actor, type, subject, summaryLines, rows?, ... })`** — convenience wrapper: skips silently if the actor has no valid email, builds the body with `buildConfirmationBody()` plus a plain-text fallback, then calls `sendNotification()`. Used by every form submit to confirm the actor's own action.

**Recipient resolvers** (best-effort, read `user_access`, return de-duped lower-cased emails, `[]` on any error):
- `resolveGlobalAdminEmails()` — roles `Global Admin` / `Owner` / `Owner Level` / `Admin`.
- `resolveAccountsTeamEmails()` — roles `Accounts Team` / `Accounts`.

### 9.3 Audit trail — `email_logs`

Every send attempt (per recipient) inserts a row into Supabase table `email_logs`. The insert is wrapped in its own try/catch — a logging failure never breaks the email path.

| Column | Value |
|---|---|
| `email_type` | the `NOTIFICATION_TYPES` value (`input.type`) |
| `sent_to` | the single normalized recipient |
| `subject` | email subject |
| `status` | `"sent"` or `"failed"` |
| `error` | `null` on success, else the SMTP error |
| `post_id` / `collab_id` | optional context keys |

### 9.4 Notification type registry — `NOTIFICATION_TYPES`

The canonical `email_type` values are centralized in `NOTIFICATION_TYPES` (`lib/notifications.ts`), so every call site and `email_logs` query references one source of truth.

| Constant | `email_type` | Dispatch | Recipient |
|---|---|---|---|
| `CAMPAIGN_CREATED` | `campaign_created` | Event (campaign submit) | Global Admins (actor excluded) |
| `PAYMENT_PROCESSED` | `payment_processed` | Event (payment submit) | The paid creator (post `email` → `creators.email`) |
| `REACHOUT_CONFIRMATION` | `reachout_confirmation` | Event (Reach Out submit) | The actor |
| `INBOUND_CONFIRMATION` | `inbound_confirmation` | Event (Inbound Reach Out submit) | The actor |
| `ONBOARDING_CONFIRMATION` | `onboarding_confirmation` | Event (Onboarding submit) | The actor |
| `CAMPAIGN_CONFIRMATION` | `campaign_confirmation` | Event (campaign submit) | The actor |
| `POSTING_CONFIRMATION` | `posting_confirmation` | Event (Posting submit) | The actor |
| `PAYMENT_CONFIRMATION` | `payment_confirmation` | Event (payment submit) | The actor |
| `SHOPIFY_VALIDATION_FAILED` | `shopify_validation_failed` | Event (onboarding, order not found) | The assigned user (= submitting actor) |
| `USER_INVITATION` | `user_invitation` | Event (user-panel invite) | The invited user |
| `PENDING_ONBOARDING` | `pending_onboarding` | Daily cron | Assigned user (`posts.onboarded_by`) |
| `POSTING_PENDING` | `posting_pending` | Daily cron | Assigned user (`posts.onboarded_by`) |
| `CONTENT_REMINDER` | `content_reminder` | Daily cron | The creator (`posts.email`) |
| `PAYMENT_ELIGIBLE` | `payment_eligible` | Daily cron | Accounts team |
| `PAYMENT_SLA_BREACH` | `payment_sla_breach` | Daily cron | Accounts team |
| `CAMPAIGN_ENDING` | `campaign_ending` | Daily cron | Campaign owner (`campaigns.created_by`), Admins fallback |

### 9.5 Event-driven emails (Server Actions)

Each feature Server Action fires its notification(s) inside Next.js `after()`, so the email runs **after** the response is returned — the form is never blocked, and a delivery failure can never roll back the committed write. Every send is best-effort.

| Action file | Fires |
|---|---|
| `features/campaigns/actions.ts` | `campaign_created` → Global Admins (actor excluded), then `campaign_confirmation` → actor |
| `features/reach-out/actions.ts` | `reachout_confirmation` → actor |
| `features/reach-out/inbound-actions.ts` | `inbound_confirmation` → actor |
| `features/onboarding/actions.ts` | `shopify_validation_failed` → actor (only on a saved submit whose Order ID isn't in synced `shopify_orders` and fails the live Shopify check), and `onboarding_confirmation` → actor |
| `features/posting/actions.ts` | `posting_confirmation` → actor |
| `features/accounts-hub/actions.ts` | `payment_processed` → each creator whose post became `Done` (one email per paid post), plus `payment_confirmation` → actor |
| `features/user-panel/actions.ts` | `user_invitation` → invited user (single invite + CSV batch) |

**User Invitation (`features/user-panel/actions.ts`).** Because CreatorHub is **Google-OAuth-only / passwordless**, there is no invite-token table, no `/auth/accept` route, and no password to set. The invitee's `user_access` row is upserted active immediately; the email simply points them to `${requestOrigin()}/login` to sign in with the matching Google account, with `replyTo` set to the inviter. Sent for both single invites and CSV bulk invites (in parallel, each logged).

### 9.6 Daily Vercel Cron — `app/api/cron/notifications/route.ts`

The six time-based notifications plus a campaign auto-close run in one Route Handler, scheduled via `vercel.json`:

```json
{ "crons": [ { "path": "/api/cron/notifications", "schedule": "0 4 * * *" } ] }
```

Runs daily at 04:00 UTC. The route is `dynamic = "force-dynamic"` with `maxDuration = 60`. It reads/writes **Supabase only** (via `createServiceClient()`).

**Auth (`isAuthorized`).** Accepts the request if it carries the `x-vercel-cron` header **or** `Authorization: Bearer ${CRON_SECRET}`; any other request gets `401`. This blocks public triggering.

**Idempotency.** Each check queries only rows that just crossed a threshold *and* have not yet been emailed (a per-row sent-flag is `null`/`false`), sends the notification, then **stamps the flag regardless of send outcome** so it fires at most once per row. Each check is independently try/caught so one failure never aborts the others. Tunable windows are top-of-file constants.

| # | Check | Query | Recipient | Sent-flag stamped |
|---|---|---|---|---|
| 1 | Pending Onboarding | `posts` `workflow_status='Reach Out'`, `reach_out_date < today-3` | Assigned user (`onboarded_by`) | `posts.onboarding_pending_sent_at` |
| 2 | Posting Pending | `posts` status in `On Board`/`Order Sent`, `est_delivery <= today+2` | Assigned user | `posts.posting_pending_sent_at` |
| 3 | Content Reminder | `posts` onboarded-not-posted, `onboard_date < today-7` | Creator (`posts.email`) | `posts.content_reminder_sent_at` |
| 4 | Payment Eligible | `payments` `status='Due'`, `eligibility_email_sent=false` | Accounts team | `payments.eligibility_email_sent=true` |
| 5 | Payment SLA Breach | `payments` status `Due`/`Partial`, `due_date < today-7` | Accounts team | `payments.sla_breach_alert_sent=true` |
| 6 | Campaign Ending Soon | `campaigns` `today <= end_date <= today+7`, `ending_alert_sent=false` | Owner (`created_by`), Admins fallback | `campaigns.ending_alert_sent=true` |

Assigned-user resolution: `posts.onboarded_by` is used as an email if it contains `@`, else matched against an active `user_access` name→email map (`buildNameToEmailMap`); no match → skipped.

**Auto-close step (7).** After the notifications, campaigns whose `end_date` is in the past and not already closed (`auto_closed_at` null, status not `closed`) are flipped to `status='Closed'` with `auto_closed_at` stamped (one-shot — a reopened campaign keeps `auto_closed_at` set so it never re-closes). The owner-facing "ending soon" notice in check 6 already warned them.

The route returns `{ ran: true, sent: { pending_onboarding, posting_pending, content_reminder, payment_eligible, payment_sla_breach, campaign_ending, campaign_closed } }` with per-check counts.

---
Key file paths (all under `/Users/saadaa/Documents/Influencer Project/New Influencer Project/apps/web`): `lib/email.ts`, `lib/notifications.ts`, `lib/env.server.ts`, `app/api/cron/notifications/route.ts`, `vercel.json`, and the six feature action files listed in §9.5.


---


# 9. Integrations — Shopify, Apify, Meta Ads

I now have a complete, accurate picture. The classification thresholds (impressions ≥50K, ROAS ≥3.0) are owned by the Meta Ads warehouse / analytics team — the CreatorHub app does not compute them; it only displays `ads_results`/`ads_status` and detects warehouse coverage via IFAD-tagged `ad_name`. Writing the section now.


CreatorHub integrates with three external systems — **Shopify** (order/fulfilment data), **Apify** (Instagram profile scraping), and the **Meta Ads warehouse** (ad classification). All three feed **Supabase**, which is the sole source of truth; nothing writes to Google Sheets. Heavy/scheduled work runs as **Supabase Edge Functions** triggered by **`pg_cron`** (`net.http_post`), while time-based email reminders run as a **Vercel Cron** route. Server-side reads/writes from the Next.js app use a service-role client (`createServiceClient` in `lib/supabase/server.ts`).

| Integration | Mechanism | Trigger | Lands in |
|---|---|---|---|
| Shopify (bulk) | `sync-shopify-orders` edge function (bulk mode) | `pg_cron` job `sync-shopify-orders-3h`, `30 */3 * * *` | `shopify_orders` |
| Shopify (on-demand) | `sync-shopify-orders` edge function (single-order mode) | Server action `onboarding/actions.ts` `POST …?order_id=` | `shopify_orders` |
| Apify / Instagram | `scrape-pending-apify` edge function | `pg_cron` job `scrape-apify-every-3h`, `0 */3 * * *` | `instagram_cache`, `creators`, `avatars` bucket |
| Meta Ads warehouse | Read-only PostgREST query to external Supabase project | On-render (`ad-status`) + reconciliation pass in `scrape-pending-apify` | (read-only) drives `posts.ads_results` display |

### 10.1 Shopify — Order & Fulfilment Sync

Source: `supabase/functions/sync-shopify-orders/index.ts` (edge function slug `sync-shopify-orders`). It talks to the Shopify Admin REST API (`/admin/api/{SHOPIFY_API_VERSION}/orders…`, default version `2024-10`) using `X-Shopify-Access-Token`. It has **two modes** in one handler.

**Bulk mode (no params).** Fired every 3 hours by `pg_cron` (`30 */3 * * *`). It pages Shopify orders updated within a rolling window (`SHOPIFY_DAYS_BACK`, default 14 days), `status=any`, `limit=250`, following the `Link: rel="next"` header up to `SHOPIFY_MAX_PAGES` (default 4). Every order is filtered by `orderHasInfTag()` — only orders whose `tags` contain the influencer tag (`SHOPIFY_ORDER_TAGS`, default **`inf`**, case-insensitive) are kept. Matched orders are mapped by `mapOrder()` and upserted into `shopify_orders` in batches with `onConflict: "order_id"`. The response reports `{ seen, matched, upserted, pages, truncated, failed }`.

**On-demand single-order mode (Option B).** Used by onboarding: when an operator enters a freshly-placed Shopify Order ID that the 3-hr bulk sync hasn't picked up yet, `prefillFromShopifyOrder` / submit in `features/onboarding/actions.ts` first looks up `shopify_orders` by `order_id`; on a miss it `POST`s to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-shopify-orders?order_id=<id>` with the service-role bearer, then re-queries `shopify_orders`. The function fetches that one order live via `/orders/{id}.json`, and **upserts it only if it carries the `inf` tag** (`handleSingleOrder` → `orderHasInfTag`). Possible outcomes: `found:false` (404 / bad id), `found:true, tagged:false, reason:"untagged"` (order exists but is not an influencer order), or `matched:1` (upserted). If validation still fails, onboarding emails the assignee a "Shopify order … not found — onboarding blocked" notification (`NOTIFICATION_TYPES.SHOPIFY_VALIDATION_FAILED`) and aborts the submit.

**`shopify_orders` columns** (PK `order_id text`, `onConflict` key):

| Column | Type | Notes |
|---|---|---|
| `order_id` | text | Shopify numeric id as string (PK) |
| `customer_name`, `email`, `phone` | text | phone falls back to shipping address phone |
| `garments_sent` | text | line-item titles joined |
| `line_skus` | text | line-item SKUs joined |
| `order_date` | date | `processed_at` ?? `created_at` |
| `order_placed_date` | date | `created_at` |
| `fulfillment` | text | order `fulfillment_status` |
| `tracking_id`, `tracking_status` | text | from latest fulfilment |
| `delivery_date` | date | set when latest shipment_status = `delivered` |
| `address` | text | flattened shipping (or billing) address |
| `subtotal_price`, `total_price`, `discount_total`, `refund_amount` | numeric | |
| `discount_codes`, `tags`, `note`, `financial_status`, `cancel_reason` | text | `tags` stores the raw Shopify tag string (incl. `inf`) |
| `customer_order_count` | integer | customer lifetime order count |
| `cancelled_at`, `refunded_at` | timestamptz | |
| `fulfillment_events` | jsonb | `{ chain: "YYYY-MM-DD status → …" }` audit trail |
| `synced_at` | timestamptz | last upsert time |

> Note: the `shopify_orders` table also defines a `refund_reason` column; the current edge function does not populate it (left null).

**Required edge secrets:** `SHOPIFY_STORE_DOMAIN` (e.g. `saadaa.myshopify.com`), `SHOPIFY_ADMIN_API_TOKEN` (read_orders scope), optional `SHOPIFY_API_VERSION`, `SHOPIFY_DAYS_BACK`, `SHOPIFY_MAX_PAGES`, `SHOPIFY_ORDER_TAGS`. (`GoKwik` from the legacy stack is no longer integrated — tracking status comes from Shopify fulfilment events only.)

### 10.2 Apify / Instagram — Profile Scraping & Cache

Source: `supabase/functions/scrape-pending-apify/index.ts` (slug `scrape-pending-apify`). Runs every 3 hours via `pg_cron` (`0 */3 * * *`). It is a **queue-drain** model, not a per-request scrape:

1. **Enqueue.** When an operator looks up a handle that isn't already known, `lookupCreator` (`features/reach-out/actions.ts`) reads `creators` first, then `instagram_cache`; an unknown handle is UPSERTed into `instagram_cache` with `status='pending'`. The app never calls Apify synchronously.
2. **Drain.** Each cron tick re-queues stale `auto` rows older than 3 hours back to `pending`, then selects up to `APIFY_BATCH_SIZE` (default 20) `pending` rows with `attempts < APIFY_MAX_ATTEMPTS` (default 3) and calls Apify's `run-sync-get-dataset-items` for actor `APIFY_ACTOR_ID` (default `apify/instagram-profile-scraper`).
3. **Write-back.** For each hit it computes `avg_likes` + engagement rate (`er = ((avgLikes + avgComments) / followers) × 100`) and updates `instagram_cache` to `status='auto'`. It then propagates `followers`, `er`, `avg_likes`, `profile_pic`, `verification`, and tier `category` to the matching `creators` row (COALESCE-style, never clobbering). Misses increment `attempts` and flip to `not_found` at the cap; failures insert into `system_errors` (`type='apify_fail'`) for the Error Portal and auto-resolve on a later success.

**`instagram_cache` columns:** `username` (PK text), `followers`, `er`, `avg_likes`, `avg_views`, `profile_pic`, `is_verified`, `biography`, `raw_json` (jsonb — full Apify payload), `scraped_at`, `status` (`pending | auto | not_found`), `attempts`, `updated_at`.

**Avatar storage + weserv proxy.** Instagram CDN profile-pic URLs are signed and expire within days. On every successful scrape, `persistAvatar()` downloads the image and uploads a permanent copy to the public **`avatars`** Storage bucket (`<username>.<ext>`, `upsert:true`), storing the stable public URL in `instagram_cache.profile_pic` (and on `creators`). At render time, the shared avatar component (`components/ui/avatar.tsx`) and `proxyAvatarUrl()` (`lib/formatters.ts`) route every avatar through `https://images.weserv.nl/?url=…&w=&h=&fit=cover` to bypass Instagram CDN Referer blocks.

**Post-date decode (no API).** The same edge function backfills `posts.post_date` for `Posted`/`Delivered` rows with a null date by decoding the Instagram shortcode locally — bitshift formula `timestamp_ms = (media_id >> 23) + 1_314_220_021_721`, ported to `lib/instagram-shortcode.ts` and inlined in the function — falling back to `onboard_date`, then today (IST). No Apify call is consumed for date stamping.

**Required edge secrets:** `APIFY_TOKEN`, optional `APIFY_ACTOR_ID`, `APIFY_MAX_ATTEMPTS`, `APIFY_BATCH_SIZE`.

### 10.3 Meta Ads — Ad Status Classification

Ads classification is **owned by an external Meta Ads warehouse** (a separate Supabase Postgres project maintained by the analytics team), not computed inside CreatorHub. The app reads from it; it never writes ad data.

**Eligibility (computed in-app).** `features/ad-status/queries.ts` (`fetchAdStatusData`) pulls `posts` in `workflow_status ∈ {Posted, Delivered}` and marks a post eligible if it has non-trivial `ads_usage_rights` **OR** its `post_id_short` appears in the warehouse coverage set.

**Warehouse coverage.** `fetchMetaAdsCoveredPostIds()` (`lib/supabase/meta-ads.ts`) connects to the warehouse via `META_ADS_SUPABASE_URL` + `META_ADS_SUPABASE_SERVICE_KEY`, paginates `primary_table` filtering `ad_name ILIKE '%IFAD%'`, and extracts `post_id_short` values via regex `([A-Z]+-\d+-P\d+)`. The warehouse fetch is wrapped in a 5-second `Promise.race` timeout so warehouse latency never blocks the page render. When the env vars are absent (`isMetaAdsWarehouseConfigured()` → false), the covered set is empty and all eligible posts show as **Pending Classification**.

**Classification values.** The warehouse writes the label onto `posts.ads_results` / `posts.ads_status`; the app reads them (with a `42703` fallback to a base column set if the migration isn't applied). Posts split into **Untested** (no `ads_results` and not in warehouse) vs **Ad Run** (classified or confirmed in warehouse). KPIs: Total Eligible, Classified, In Meta Ads, Pending Classification, Winners, Discarded.

**Classification thresholds (warehouse-owned, documented for reference):**

| Status | Condition |
|---|---|
| Winner | impressions ≥ 50K AND ROAS ≥ 3.0 |
| ITE (In Testing) | impressions ≥ 50K AND ROAS < 3.0 |
| Discarded | impressions < 50K |
| Pending | eligible but not yet classified by the warehouse |

> These thresholds are applied by the analytics warehouse, not by this codebase — CreatorHub only surfaces the resulting label. Connecting/changing the warehouse classification is gated on the warehouse owner (analytics team).

**Payment reconciliation tie-in.** The `scrape-pending-apify` cron also runs `recomputePaymentStates`, which uses the same `fetchMetaAdsCoveredPostIds()` (warehouse secrets optional on the function) to auto-clear `payments.posted_but_not_tested` once a post becomes "tested" — i.e. `posts.ads_results` is set OR its `post_id_short` is present in the warehouse.

**Relevant files:** `features/ad-status/queries.ts`, `features/ad-status/types.ts`, `lib/supabase/meta-ads.ts`, `features/onboarding/actions.ts`, `lib/instagram-shortcode.ts`, `lib/formatters.ts` (`proxyAvatarUrl`), `components/ui/avatar.tsx`; edge functions `sync-shopify-orders` and `scrape-pending-apify`; `pg_cron` jobs `sync-shopify-orders-3h` and `scrape-apify-every-3h`.


---


# 10. UI System & Design

CreatorHub's UI is a single-page-application shell rendered by Next.js 15 (App Router) under `apps/web`. All chrome lives in the authenticated route group `app/(app)/`, gated by `getActor()` in `app/(app)/layout.tsx` — an unauthenticated visitor is redirected to `/login` (or `/login?reason=revoked` when the Supabase session exists but RBAC access was pulled). There is no legacy Apps Script `Index.html`, no Bootstrap, and no client-side `google.script.run` bridge; every view is a React Server Component that reads Supabase directly and hydrates only the interactive islands.

### 11.1 App Shell

`app/(app)/layout.tsx` composes the persistent shell as `.app-shell` and mounts five pieces:

| Element | Component | Role |
|---------|-----------|------|
| Skip link | inline `<a href="#main-content">` | "Skip to workspace" a11y bypass |
| Sidebar | `components/nav/sidebar.tsx` | Primary navigation (desktop fixed, mobile drawer) |
| Scrim | `components/nav/sidebar-scrim.tsx` | Dim overlay + Esc/scroll-lock for the mobile drawer |
| Mobile topbar | `components/nav/mobile-topbar.tsx` | Sticky phone header (hamburger + title + Know More) |
| Know More modal | `features/know-more/know-more-modal.tsx` | Global help modal mounted once |

Page content streams into `<main id="main-content" className="main-content" tabIndex={-1}>`. The actor (a `UserAccessRow`) is fetched once server-side and passed to `<Sidebar>` for permission-aware rendering.

### 11.2 Navigation

The sidebar (`components/nav/sidebar.tsx`) is a static `NAV` array of three labelled sections rendered top-to-bottom. Leaf links carry a Lucide icon and an optional `show: (actor) => hasPermission(actor, ...)` predicate; an entire group is stripped from the DOM when every child is hidden by RBAC (`SidebarSection` filters before render).

| Section | Items (with required permission) |
|---------|----------------------------------|
| **Workspace** | Dashboard · Accounts Hub (`accounts_write`) · My Dashboard |
| **Workflow** | New Campaign (`campaign_create`) · Reach Out → Outbound (`reachout_outbound`) / Inbound (`reachout_inbound`) · Creator Onboarding (`onboarding_write`) · Order Status · Posting Data (`posting_submit`) · Offboarding (`offboarding_write`) |
| **System** | Sheet View · User Panel (`admin`) · Error Portal |

"Reach Out" is the only nested group — a non-link `nav-group` parent with an Outbound/Inbound `nav-children` list. The sidebar brand block shows a `SA` logo badge, the title "CreatorHub", and the subtitle `SAADAA · {actor.role}`. The footer holds a `signOutAction` server-action form and a `v0.1 · Next.js + Supabase` version string.

**Dashboard tabs.** The analytics/system views that used to be standalone sidebar entries (Influencer Journey, TAT, Ad Status, Compliance, Cost, Funnel, Internal Dashboard) now live as tabs inside `/dashboard`, declared in `features/dashboard/tab-config.ts`:

```
overview · journey · tat · ad-status · compliance · cost · funnel · internal
```

Tab state lives in the `?tab=` URL search param (linkable, server-rendered). Each tab reuses the corresponding feature's full page-view component and data fetch, so a tab is identical to its standalone route. The original routes (`/journey`, `/tat`, `/compliance`, …) still exist and are reachable by direct URL. Active-link detection uses `pathname === href || pathname.startsWith(href + "/")` and sets `aria-current="page"`.

### 11.3 Design Tokens

Tokens are declared in a Tailwind v4 `@theme` block at the top of `app/globals.css` (exposed as `--color-*` utilities such as `bg-bg-base`, `text-text-primary`). The palette is the warm ecru/ivory **light** theme — not dark.

| Token | Value | Use |
|-------|-------|-----|
| `--color-bg-base` | `#faf8f5` | Page background |
| `--color-bg-surface` | `#f5f1ec` | Panels, sidebar surface |
| `--color-bg-ecru` | `#f0ead6` | Core Saadaa ecru |
| `--color-bg-white` | `#ffffff` | Modals, KPI cards (solid) |
| `--color-text-primary` | `#161513` | Headings, body |
| `--color-text-secondary` | `#6e695e` | Labels |
| `--color-text-tertiary` | `#9a9384` | Placeholders |
| `--color-border` | `#e7e2d2` | Cards, inputs |
| `--color-accent` | `#f0c61e` | CTA / active accent (accent-text `#161513`) |
| `--color-success-text` / `-bg` | `#4f7c4d` / `#ecf1e9` | Success |
| `--color-warning-text` / `-bg` | `#b57514` / `#faf1dc` | Warning |
| `--color-danger-text` / `-bg` | `#c0392b` / `#fdecea` | Error |
| `--color-purple` / `-pink` / `-indigo` | `#7b4fbf` / `#b54f7a` / `#3b6fd4` | Secondary accents (detail panels only, never nav) |

**Sidebar is light, not dark.** Unlike the legacy dark `#2c2420` rail, the current sidebar uses `--color-sidebar-bg: #faf8f5` with a `--color-sidebar-border: #e7e2d2`. The active nav link inverts to a dark-on-light pill — `--color-sidebar-active-bg: #161513`, `--color-sidebar-active-text: #ffffff`.

**Fonts.** The type system was migrated off webfonts to a native Helvetica stack. All three font roles resolve to the same family (per the `@theme` comment "Helvetica everywhere — no webfont, native stack"):

```
--font-sans:    "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif
--font-display: "Helvetica Neue", Helvetica, Arial, sans-serif
--font-emph:    "Helvetica Neue", Helvetica, Arial, sans-serif
```

The Space Grotesk + Inter pairing described in older docs is no longer loaded; `app/layout.tsx` applies `font-sans` on `<body>` with no `next/font` import. KPI numerals use a dedicated `--text-kpi` (1.18rem / 1.08 line-height) scale token.

### 11.4 Shared Stage Layout

Every workflow stage (Onboarding, Posting, Order Status, Accounts Hub, Offboarding, Reach Out, etc.) follows one canonical shape, with Onboarding (`app/(app)/onboarding/page.tsx`) as the reference implementation. The render order is fixed:

```
PageHeader → Filters bar → KPI strip → Table/Board
```

- **PageHeader** (`components/ui/page-header.tsx`) — `.page-header` with a `.header-icon` (Lucide), an `<h1>`, an optional right-aligned `.mode-pill` (e.g. "We initiate" / "They came in"), and a `.btn-know-more` button carrying `data-know-more="<slug>"`.
- **Stage wrapper** — each page roots in a `.<stage>-stage` div (`.onboarding-stage`, `.my-dashboard-stage`, `.dash-overview-stage`, …) which scopes mobile and bento overrides.
- **Filter-above-KPI rule** — the filter bar (`.onboarding-filter-card` / `.onboarding-filter-grid`, with `:focus-within` polish) renders **before** the KPI strip on every breakpoint. In the Onboarding page, `<OnboardingFiltersBar>` is placed above `<OnboardingKpiSection>` in JSX, confirming the ordering.
- **KPI strip** — `.acc-kpi-grid` of `.acc-kpi` cards (`repeat(5 → 3 → 2 → 1)` columns as width shrinks).
- **List/Cards toggle** — `.ob-viewtoggle` segmented control switches between a fixed-table list view and a card grid.

**Fixed-table column widths.** The list view lives in `.ob-list-wrap` with `table-layout: fixed`. Column widths are driven by `[data-column-id="…"]` selectors so columns stay aligned across stages — e.g. `creator`, `post_id`, `collab_id`, `inf_id`, `campaign`, `stage`, `followers`, `collab`, `commercials`, `deliverables`, `nomenclature`, `order_id`, `email`, `est_delivery`, and a sticky `actions` column (last cell pinned right via `td:last-child`).

**Shared chip & avatar patterns.** Status chips render inline (pill classes like `.kb-pill--warning` / `.kb-pill--danger`, `.pill--danger`, `.cap-pill--success/--danger`) rather than as block elements. Creator avatars use one shared mount helper across every view (never reinvented per-stage), with Instagram images routed through the weserv proxy.

### 11.5 Know More System

In-app help is a single global modal plus a per-stage content registry — no per-page bespoke help UI.

- `features/know-more/know-more-modal.tsx` is mounted once in the `(app)` shell. It uses **document-level click delegation**: any click on a `[data-know-more]` element (the PageHeader/topbar Know More buttons) reads the slug and opens that content. The modal portals into `document.body` as `.km-backdrop` → `.km-panel` (`role="dialog"`, `aria-modal`), with Esc-to-close and scroll lock. Unknown slugs fall through to a soft "hasn't been written yet" panel instead of crashing.
- `features/know-more/content/registry.tsx` (`KM_REGISTRY`) maps each slug to its content component — 21 entries covering every stage and dashboard view (`dashboard`, `campaigns`, `reach-out-outbound`, `reach-out-inbound`, `onboarding`, `offboarding`, `posting`, `order-status`, `accounts-hub`, `orders`, `ad-status`, `tat`, `journey`, `my-dashboard`, `compliance`, `funnel`, `cost-analytics`, `internal-dashboard`, `errors`, `sheets`, `user-panel`).
- `features/know-more/km-shell.tsx` provides the shared, framework-agnostic content primitives — `KMHeader`, `KMSection` (tagged section), `KMList`, `KMCode` (`.km-chip`), and `KMCallout` (`info`/`warning`/`success`/`danger` tones). Every `content/<slug>.tsx` file composes these so panels stay visually uniform. Adding a stage = add a `content/<slug>.tsx` + one registry entry + wire the slug into the PageHeader's `knowMore` prop.
- **Contextual on Dashboard:** the tabbed Dashboard owns one PageHeader, so its Know More is contextual — `tabKnowMoreSlug(resolveTab(?tab))` (from `tab-config.ts`) opens the active tab's help (Overview → `dashboard`, each mirror tab → its own slug).

### 11.6 Mobile Rules

- **Drawer sidebar.** Below `1023px` the sidebar becomes an off-canvas drawer: `width: min(86vw, 320px)`, `transform: translateX(-105%)` when closed, sliding to `translateX(0)` on `.is-open` via a `0.32s cubic-bezier` transition. Open/close state is held in a Zustand store (`stores/sidebar-store`); `SidebarScrim` dims the page, locks body scroll, and closes on Esc or backdrop click.
- **Sticky topbar.** `MobileTopbar` (`.mobile-topbar`, hidden ≥1024px) is sticky with a `hamburger-btn`, the `SA` badge, a two-line `{sectionTitle}` / "Saadaa Creator Hub" stack, and a `.topbar-know-more` button. Section title and Know More slug are resolved from `pathname` (and `?tab=` on Dashboard) via `SECTION_TITLES` / `SECTION_KM_SLUGS` tables. Touch targets honour the safe-area inset (`env(safe-area-inset-top)`).
- **2×2 bento KPIs.** On phones, KPI strips collapse from 5 columns to a dense 2-up grid — `.dash-overview-stage`, `.journey-stage`, and `.my-dashboard-stage` override `.acc-kpi-grid` to `repeat(2, minmax(0, 1fr))` with reduced padding/radius, never a single stacked column for these views.
- **iOS date reset.** A project-wide normalization block in `globals.css` neutralizes Safari's native date control for `input[type="date"]`, `input[type="datetime-local"]`, and the stage-specific input classes (`.form-control`, `.acc-field__input`, `.onboarding-filter-select`) via `-webkit-appearance: none` and `::-webkit-datetime-edit-*` overrides. Any new stage with a date input must reuse this selector list (verified on real iOS Safari, not DevTools emulation).
- **Chrome trim.** The desktop `.page-header` is `display: none` on mobile (the topbar replaces it); `.main-content` drops to full width with bottom padding for the fixed topbar/nav.

### 11.7 Perceived Performance

- **Prefetched tab/nav links.** Sidebar `NavLink`s render `next/link` with `prefetch` and additionally call `router.prefetch(href)` on `onPointerEnter` / `onFocus`, so a route is warmed before the click lands.
- **Optimistic active state.** The sidebar tracks an `optimisticPath` (`useState`) that updates on click *before* the navigation resolves, so the active highlight moves instantly and re-syncs to the real `pathname` via `useEffect`. The mobile drawer also closes optimistically on navigate.
- **Streaming with skeletons.** Stage pages wrap KPI and table sections in React `<Suspense>` with skeleton fallbacks (`KpiSkeleton`, `TableSkeleton`), keyed on serialized filter params so a filter change re-streams just the table while chrome stays painted.
- **`overflow-x: clip`** (not `hidden`) on `.main-content` prevents horizontal overflow without turning it into a scroll container, keeping `position: sticky` descendants (e.g. the Dashboard tab rail) sticky against the window.

Key files: `app/(app)/layout.tsx`, `components/nav/sidebar.tsx`, `components/nav/mobile-topbar.tsx`, `components/nav/sidebar-scrim.tsx`, `components/ui/page-header.tsx`, `app/globals.css` (`@theme` tokens + stage/mobile rules), `features/dashboard/tab-config.ts`, `features/know-more/{know-more-modal,km-shell}.tsx`, `features/know-more/content/registry.tsx`.