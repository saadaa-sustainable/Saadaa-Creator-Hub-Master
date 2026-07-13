# 02 · Architecture & Data Flow

> Part of the CreatorHub KB. Last verified 2026-06-07. Code is authoritative.

## Request / render pipeline

1. **`middleware.ts`** runs on nearly every request (matcher excludes `_next/static`, `_next/image`, `favicon.ico`, image extensions). Builds a `createServerClient` from `@supabase/ssr` using `publicEnv` and calls `supabase.auth.getUser()` purely to **refresh the session cookie** so downstream Server Components see a valid session. No gating logic here.
2. **Root layout** `app/layout.tsx`: `<html lang="en">` with native Helvetica body, `metadata` (title template `"%s · Saadaa Creator Hub"`) + `viewport` (`themeColor #FAF8F5`, `colorScheme: light`), wraps everything in `<Providers>`, imports `globals.css`.
3. **`app/providers.tsx`** (`"use client"`): wraps children in `QueryClientProvider` (TanStack Query — `staleTime 60_000`, `refetchOnWindowFocus: false`, `retry: 1`) and mounts Sonner `<Toaster position="top-right" richColors closeButton/>`.
4. **`app/page.tsx`**: server redirect `/` → `/dashboard`.

## Route groups (under `app/`)

- **`(auth)/login`** — public sign-in. `page.tsx` is a Server Component pulling live COUNTs of creators/campaigns/posts via the **service-role** client; `google-sign-in.tsx` is the client OAuth trigger.
- **`auth/callback/route.ts`** — OAuth code exchange (`exchangeCodeForSession`), then a hard gate: looks up `user_access` via service client and **signs the user out + redirects `/login?reason=revoked`** if the email is absent or `active=false`. Supabase redirect URLs are documented in the file header.
- **`(app)/`** — the authenticated shell.
- **`api/`** — Route Handlers (REST).

## Auth gating in the `(app)` shell

`app/(app)/layout.tsx` is an async Server Component:
- Calls `getActor()`; if null, distinguishes "never signed in" (→ `/login`) from "signed in but revoked" (→ `/login?reason=revoked`) by re-checking `supabase.auth.getUser()`.
- Renders the shell: skip-link, `<Sidebar actor={actor}/>`, `<SidebarScrim/>`, `<MobileTopbar/>`, `<main id="main-content">`, and `<KnowMoreModal/>`.

**`getActor()`** (`lib/auth.ts`) is the single per-request identity resolver, wrapped in React `cache()` for dedup:
- Reads the Supabase user, then the `user_access` row (must exist and be `active`).
- Hydrates dynamic permission scopes from `access_roles` + `access_role_permissions` using the **service-role** client; on any error it logs loudly and falls back to the static role map (`rbac.ts`), which is **fail-closed** for unknown custom roles.
- Side effect (best-effort, non-blocking): bumps `last_login_at`/`last_active_at` (debounced 5 min) and writes a `login` row to `user_audit_log`.

**`lib/impersonation.ts`** (2026-07-13) layers "Act as" on top of `getActor()` WITHOUT touching it: `getActingAs()` resolves the `ch-act-as` session cookie (admin-only, target must be an active `user_access` row, never self — else null), and `attributionName(actor)` is what the workflow write stamps (reach-out `logged_by`, onboarding `onboarded_by`, posting `posted_by`) route through. Permission checks ALWAYS use the real actor; only attribution switches. Start/stop actions live in `features/impersonation/actions.ts` (audited). Details in chapter 07 → My Dashboard.

## RBAC

- **`lib/rbac.ts`** (client-safe): defines 14 `PermissionKey`s — `admin`, `campaign_create`, `campaign_edit`, `reachout_outbound`, `reachout_inbound`, `onboarding_write`, `posting_submit`, `accounts_write`, `performance_view`, `order_status_view`, `sheet_view`, `offboarding_write`, `system_config`, `role_mgmt`. `hasPermission(actor, key)` trusts DB-resolved `actor.permissions` when present (with `admin` implying all non-admin keys), otherwise falls back to `STATIC_GRANTS` per normalized role (Global Admin / User / Accounts Team / Campaign Owner) plus a hard-coded admin-email allowlist.
- **`lib/rbac.server.ts`** (`server-only`): `assertPermission(key)` = `requireActor()` + `hasPermission`, throwing on failure. It is the write-path gate (used across `features/*/actions.ts` and api routes, always paired with the service client).

Full RBAC detail (the permission map, static grants, the 2026-06-07 Campaign Owner change) is in chapter 08 → RBAC.

## Server Components, Server Actions, Suspense

- **Reads**: Server Components fetch first-paint data directly via `createClient()` (cookie/RLS-scoped) from `lib/supabase/server.ts`. Every async fetch is wrapped in `<Suspense>`; routes ship `loading.tsx` + `error.tsx` (group-level `app/(app)/error.tsx`).
- **Writes**: `"use server"` Server Actions in `features/*/actions.ts` call `assertPermission()` then the privileged `createServiceClient()`. TanStack Query handles client-side mutation/revalidation only (no client Supabase reads for first paint).
- **Supabase clients** (`lib/supabase/`): `client.ts` browser client (anon), `server.ts` cookie-bound RSC/route client (`createClient`, RLS-scoped) + `createServiceClient` (service-role, throws if `SUPABASE_SERVICE_KEY` unset, never shipped to browser).

## Routes under `app/(app)/*`

Pages: `accounts-hub`, `admin/users` + `admin/users/[email]`, `campaigns` + `campaigns/new`, `compliance`, `cost-analytics`, `creators/[username]`, `dashboard`, `errors`, `funnel`, `internal-dashboard`, `journey`, `my-dashboard`, `offboarding`, `onboarding`, `order-status`, `orders`, `performance/ad-run-status`, `performance/untested-ads`, `posting`, `reach-out/inbound`, `reach-out/outbound`, `sheets`, `tat`.

The dashboard is **tabbed** — Journey/TAT/Ad Status/Compliance/Cost/Funnel/Internal render as tabs inside `/dashboard` (`features/dashboard/tab-bodies.tsx`), though their standalone routes still exist. (Detail → chapter 07.)

## Sidebar nav → permission gating

`components/nav/sidebar.tsx` maps each nav leaf to a `hasPermission` predicate (e.g. Accounts Hub → `accounts_write`, New Campaign → `campaign_create`, Outbound/Inbound → `reachout_outbound`/`reachout_inbound`, Onboarding → `onboarding_write`, Posting → `posting_submit`, Offboarding → `offboarding_write`, User Panel → `admin`). Sections with all-hidden children are stripped entirely.

## API routes (`app/api/*`)

| Route | Role |
|---|---|
| `GET /api/cron/notifications` | Daily cron: 6 idempotent email checks (pending onboarding, posting due, content reminder, payment eligible/SLA-breach, campaign ending) + campaign auto-close. `force-dynamic`, `maxDuration 60`, auth via `x-vercel-cron` or `CRON_SECRET`. |
| `GET /api/creators/[username]/overview` | Single creator overview (creator row + last-12 posts + payments; backfills missing fields). |
| `GET /api/accounts/eligible-posts` | Accounts Hub eligible (payable) posts. |
| `GET /api/accounts/export` | Accounts CSV export (`mode=due|paid|all`). |
| `GET /api/accounts/post-deliverables/[postId]` | Per-post collab deliverable + payment ledger. |
| `GET /api/assets/saadaa-influencer-tc` | Serves the T&C PDF asset (collab-email attachment). |
| `GET /auth/callback` | OAuth code exchange + access gate. |

## Feature & support layout (`apps/web`)

- `features/` (20 domains): accounts-hub, ad-status, campaigns, compliance, cost-analytics, dashboard, errors, funnel, internal-dashboard, journey, know-more, my-dashboard, offboarding, onboarding, order-status, posting, reach-out, sheets, tat, user-panel — each typically `schema.ts` + `actions.ts` + `queries.ts` + components.
- `components/`: `ui/`, `nav/` (sidebar, mobile-topbar, scrim, sign-out-action, topbar), `data-table/`.
- `lib/`: env (`env.ts`, `env.server.ts`), auth/rbac, `supabase/` (client/server/meta-ads/types.gen), `email.ts`, `notifications.ts`, `sheet-mirror.ts`, `system-errors.ts`, `attachments.ts`, `instagram-shortcode.ts`, `payable-cycle.ts`, `ad-tested.ts`, `formatters.ts`, `validators.ts`, `cn.ts`.
- `stores/sidebar-store.ts` (Zustand), `theme/fonts.ts`, `__tests__/`.

## Two cron systems coexist

- **Vercel cron** — `/api/cron/notifications`, daily 04:00 UTC, defined in root `vercel.json` (the Wave-7 notification matrix + campaign auto-close).
- **Supabase pg_cron** — 3-hourly Apify scrape (`scrape-pending-apify-3h`, `15 */3 * * *`) + Shopify sync (`sync-shopify-orders-3h`, `30 */3 * * *`), both invoking edge functions with a Vault-backed service-role bearer. (Detail → chapters 04 + 05.)
