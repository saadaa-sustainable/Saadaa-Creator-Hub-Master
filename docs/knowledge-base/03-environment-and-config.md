# 03 · Environment & Config

> Part of the CreatorHub KB. Last verified 2026-06-07. **Never commit secret values** — names only. Next-app secrets are set in Vercel; edge-function secrets are set in Supabase. The two stores are separate.

## How env is read

- **`lib/env.ts`** — `publicEnv`: Zod-validated, browser-safe. Only the two `NEXT_PUBLIC_*` Supabase vars. Parsed at import (throws if missing).
- **`lib/env.server.ts`** — `serverEnv`: `import "server-only"` (importing from a client component is a build error). Holds all secrets. Notably **strips empty-string env vars** before parsing so `KEY=` falls through to `.optional()`.
- **Direct `process.env`** is used in only a few spots: `META_ADS_SUPABASE_URL` / `META_ADS_SUPABASE_SERVICE_KEY` (`lib/supabase/meta-ads.ts`), `CRON_SECRET` (`app/api/cron/notifications/route.ts`), and the two `NEXT_PUBLIC_*` inside `env.ts`.
- Edge functions read **`Deno.env.get(...)`** independently (separate secret store).

## Env vars — Next.js app (Vercel + `.env.local`)

Set in **Vercel project env** (prod) and `apps/web/.env.local` (dev).

| Var | Used at | Purpose | Required? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/env.ts` | Supabase project URL (browser + server) | Required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/env.ts` | Supabase anon key (RLS-scoped client) | Required |
| `SUPABASE_SERVICE_KEY` | `lib/env.server.ts`, `lib/supabase/server.ts` | Service-role key for privileged server writes; throws if used unset | Required for all write paths/cron |
| `SHOPIFY_WEBHOOK_SECRET` | `lib/env.server.ts` | Declared for Shopify webhook verification | Optional |
| `EMAIL_USER` | `lib/env.server.ts`, `lib/email.ts` | Gmail SMTP sending address | Required to send mail |
| `EMAIL_PASS` | `lib/env.server.ts`, `lib/email.ts` | Gmail app password | Required to send mail |
| `EMAIL_FROM_NAME` | `lib/env.server.ts`, `lib/email.ts` | Display name (defaults "Saadaa") | Optional |
| `CRON_SECRET` | `app/api/cron/notifications/route.ts` | Bearer secret authorizing cron POSTs | Optional (Vercel cron header also accepted) |
| `GAS_MIRROR_ENDPOINT` | `lib/sheet-mirror.ts` | Legacy GAS doPost URL for sheet mirror | Optional (mirror archived/not invoked) |
| `GAS_MIRROR_SECRET` | `lib/sheet-mirror.ts` | HMAC-SHA256 shared secret for mirror | Optional |
| `META_ADS_SUPABASE_URL` | `lib/supabase/meta-ads.ts` | Meta Ads warehouse (separate Supabase) URL | Optional |
| `META_ADS_SUPABASE_SERVICE_KEY` | `lib/supabase/meta-ads.ts` | Meta Ads warehouse service key | Optional |
| `APIFY_TOKEN` | declared `lib/env.server.ts` | Apify API token | Optional in app (actual use is the edge fn) |
| `APIFY_ACTOR_ID` | declared `lib/env.server.ts` | Apify actor (default `apify/instagram-profile-scraper`) | Optional |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | declared `lib/env.server.ts` | Google Sheets service account JSON | Optional/legacy |
| `SPREADSHEET_ID` | declared `lib/env.server.ts` | Legacy spreadsheet id | Optional/legacy |

Present in `.env.local` but **not validated by the Zod schema** (legacy holdover — the planned GAS MailApp email path that Nodemailer replaced): `GAS_EMAIL_ENDPOINT`, `GAS_EMAIL_SECRET`, `GAS_EMAIL_FROM_NAME` (superseded by `EMAIL_*`).

## Env vars — Supabase Edge Function secrets (set in Supabase, NOT Vercel)

Read by `Deno.env.get` inside the two edge functions; set as Supabase Edge secrets (`supabase secrets set …`).

| Var | Function | Purpose |
|---|---|---|
| `SUPABASE_URL` | both | Auto-injected by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | both | Auto-injected; service role for DB writes |
| `APIFY_TOKEN` | scrape-pending-apify | Apify API token; function 503s without it |
| `APIFY_ACTOR_ID` | scrape-pending-apify | default `apify/instagram-profile-scraper` |
| `APIFY_MAX_ATTEMPTS` | scrape-pending-apify | retry cap, default 3 |
| `APIFY_BATCH_SIZE` | scrape-pending-apify | batch size, default 20 |
| `META_ADS_SUPABASE_URL` / `META_ADS_SUPABASE_SERVICE_KEY` | scrape-pending-apify | optional warehouse for "tested" reconciliation |
| `SHOPIFY_STORE_DOMAIN` | sync-shopify-orders | e.g. `saadaa.myshopify.com`; 503s without it |
| `SHOPIFY_ADMIN_API_TOKEN` | sync-shopify-orders | Admin API token, `read_orders` scope |
| `SHOPIFY_API_VERSION` | sync-shopify-orders | default `2024-10` |
| `SHOPIFY_DAYS_BACK` | sync-shopify-orders | bulk window, default 14 |
| `SHOPIFY_MAX_PAGES` | sync-shopify-orders | pagination cap, default 4 |
| `SHOPIFY_ORDER_TAGS` | sync-shopify-orders | influencer tag(s), default `inf` |

`supabase/config.toml` additionally references local-dev-only `env(...)` substitutions (`OPENAI_API_KEY`, `SENDGRID_API_KEY`, Twilio/Apple/S3 keys) — CLI placeholders for disabled features, not used by the running app. The committed `config.toml` contains **no real secrets** (all are `env(...)` placeholders).

## Key data-flow / config takeaways

- Supabase is the sole source of truth; Sheets is a best-effort HMAC mirror (now archived/not invoked); Shopify/Apify data arrive only via the two 3-hour edge-function crons writing into `shopify_orders` / `instagram_cache`.
- The app never talks to Shopify or Apify directly from Next.js — onboarding triggers a single-order Shopify sync by hitting the edge-function URL.
- Email is Gmail SMTP via Nodemailer (`smtp.gmail.com:465`), replacing the originally planned GAS MailApp path (the leftover `GAS_EMAIL_*` vars belong to it).
- Two cron systems coexist: Vercel cron (`/api/cron/notifications`, daily 04:00 UTC) and Supabase pg_cron (3-hourly Apify scrape + Shopify sync).
