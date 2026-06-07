# 01 · Overview & Stack

> Part of the CreatorHub KB (the project "brain"). Last verified 2026-06-07. The code is the ultimate authority; if a `file:line` here drifts, fix the reference and update this chapter.

## What it is

**Saadaa Creator Hub** (internal codename "CreatorHub", "New Influencer Project") is the Next.js + Supabase rebuild of a legacy Google Apps Script influencer-management SPA. It manages the full creator collaboration lifecycle (Reach Out → Onboarding → Posting → Order Status → Accounts/Payments → Offboarding) plus analytics. Source of truth is Supabase; Google Sheets is mirrored but no longer authoritative.

- Repo root: `New Influencer Project/`
- Web app: `apps/web/` (the only package — see Monorepo note below)
- README: `README.md:1`; overnight-build runbook: `MORNING-CHECKLIST.md:1`

## Monorepo layout

The repo uses an `apps/*` directory convention but is **not** a real monorepo workspace. There is **no root `package.json`, no `turbo.json`, no `pnpm-workspace.yaml`**. The single package lives at `apps/web/package.json` (name `@influencer-project/web`). The `.gitignore` references `.turbo/` but Turbo is not actually configured. Other top-level dirs: `apps/`, `docs/`, `supabase/`, and (one level up, outside the git repo) `legacy-gas/` (the read-only old GAS code).

## Framework versions (exact, from `apps/web/package.json`)

| Layer | Package | Version range | Notes |
|---|---|---|---|
| Framework | `next` | `^15.1.0` | App Router |
| UI runtime | `react` / `react-dom` | `^19.0.0` | React 19 |
| Language | `typescript` | `^5.6.3` | |
| Node types | `@types/node` | `^22.7.7` | |
| Styling | `tailwindcss` | `^4.0.0` | v4 CSS-first, no `tailwind.config.ts` |
| Tailwind PostCSS | `@tailwindcss/postcss` | `^4.0.0` | |
| Data client | `@supabase/supabase-js` | `^2.45.4` | |
| Supabase SSR | `@supabase/ssr` | `^0.5.1` | cookie-based sessions |
| Server state | `@tanstack/react-query` | `^5.59.0` | mutations/revalidation only |
| Tables | `@tanstack/react-table` | `^8.20.5` | headless |
| UI primitives | Radix UI | dialog/dropdown-menu/popover/select/slot/tabs/toast/tooltip | |
| Icons | `lucide-react` | `^0.452.0` | |
| Forms | `react-hook-form` `^7.53.1` + `@hookform/resolvers` `^3.9.0` + `zod` `^3.23.8` | | |
| Charts | `recharts` | `^2.13.0` | |
| UI state | `zustand` | `^5.0.0` | sidebar store only |
| Toasts | `sonner` | `^1.5.0` | |
| Email | `nodemailer` | `^8.0.7` | Gmail SMTP |
| Dates | `date-fns` `^4.1.0` + `date-fns-tz` `^3.2.0` | | IST formatting |
| Excel export | `xlsx` | `^0.18.5` | inbound bulk import/template |
| Class utils | `class-variance-authority` `^0.7.0`, `clsx` `^2.1.1`, `tailwind-merge` `^2.5.4` | | |
| Server-only guard | `server-only` | `^0.0.1` | |
| Tests | `vitest` `^2.1.3` + Testing Library + `jsdom` `^25.0.1` + `@vitejs/plugin-react` | | |
| Lint | `eslint` `^9.13.0` + `eslint-config-next` `^15.1.0` | | flat config |
| Format | `prettier` `^3.3.3` + `prettier-plugin-tailwindcss` `^0.6.8` | | |

Note: the README's stack table lists "Space Grotesk" fonts, but `theme/fonts.ts` shows fonts were **stripped to the native Helvetica stack** — the `spaceGrotesk` export is now an empty placeholder kept only so callers that spread `spaceGrotesk.variable` still compile (`app/layout.tsx:23`). See chapter 08 → Design System.

## Package manager

No `packageManager` field; the lockfile is **`package-lock.json`** → **npm** is canonical. (README setup text mentions `pnpm install`; treat npm as the source of truth — the lockfile wins.)

## Scripts (`package.json`)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev --turbo` | Dev server (Turbopack), http://localhost:3000 |
| `build` | `next build` | Production build |
| `start` | `next start` | Serve production build |
| `lint` | `eslint .` | Flat-config ESLint (`next lint` is deprecated in 15) |
| `typecheck` | `tsc --noEmit` | Type-only check |
| `test` | `vitest run` | One-shot test run |
| `test:watch` | `vitest` | Watch mode |
| `db:types` | `supabase gen types typescript --project-id xynyvbagcudjrzklwnqp > lib/supabase/types.gen.ts` | Regenerate DB types |
| `format` | `prettier --write "**/*.{ts,tsx,md,json}"` | Format |

## Config files

- **`next.config.ts`**: `reactStrictMode: true`, `typedRoutes: true`, `experimental.optimizePackageImports: ["lucide-react"]`, `images.remotePatterns` allowing `images.weserv.nl` (proxy), `scontent.cdninstagram.com`, `*.cdninstagram.com` (Instagram avatars).
- **`tsconfig.json`**: `target ES2022`, `module esnext`, `moduleResolution "bundler"`, `strict: true`, `noEmit`, `jsx: "preserve"`, Next plugin, path alias `@/* → ./*`, `types: ["node", "@testing-library/jest-dom"]`.
- **`postcss.config.js`**: single plugin `@tailwindcss/postcss`. Design tokens live in `app/globals.css` `@theme` block — no `tailwind.config.ts`.
- **`eslint.config.mjs`**: flat config via `FlatCompat`, extends `next/core-web-vitals` + `next/typescript`. Relaxations: `@typescript-eslint/no-explicit-any: off` (codebase intentionally uses `(supabase as any)` to bypass generated-type gaps), unused-vars → `warn` with `^_` ignore, `react/no-unescaped-entities` → `warn`. Ignores `.next/**`, `node_modules/**`, `next-env.d.ts`, `lib/supabase/types.gen.ts`.
- **`vitest.config.ts`**: jsdom env, `@vitejs/plugin-react`, `@` alias, setup `./__tests__/setup.ts`, globals on, css off.

---

## Platforms & Hosting

### Vercel (web app host)

- **Two `vercel.json` files exist** (the active one is determined by Vercel's project Root Directory setting):
  - Repo-root `vercel.json`: defines the **cron** — `path: /api/cron/notifications`, `schedule: "0 4 * * *"` (daily 04:00 UTC).
  - `apps/web/vercel.json`: `framework: nextjs`, `regions: ["bom1"]` (Mumbai).
- Deployment: push-to-`main` (Vercel auto-deploys main → prod). `gh` is not installed locally.
- Cron auth: Vercel Cron sends `x-vercel-cron` header and/or `Authorization: Bearer ${CRON_SECRET}`; the route accepts either (`app/api/cron/notifications/route.ts`).

### Supabase (database + auth + edge functions + storage)

- Project id `xynyvbagcudjrzklwnqp`; URL `https://xynyvbagcudjrzklwnqp.supabase.co`.
- **Auth**: Google OAuth only ("SSO via Google Workspace", `@saadaa.in`) — `app/(auth)/login/page.tsx`, callback `app/auth/callback/route.ts`. No passwords.
- **Postgres**: 40+ migrations in `supabase/migrations/`. Key tables: `posts`, `creators`, `campaigns`, `campaign_budget`, `payments`, `shopify_orders`, `instagram_cache`, `system_errors`, `user_access`, `access_roles`, `access_role_permissions`, `user_audit_log`, `email_logs`, `cell_comments`, `cell_edits`. (Full catalog → chapter 04.)
- **Storage**: public `avatars` bucket — IG profile pics are downloaded and persisted because IG signed URLs expire.
- **Edge Functions** (two, in `supabase/functions/`): `scrape-pending-apify` (3-hr Apify scrape) and `sync-shopify-orders` (3-hr bulk + on-demand single-order). Detail → chapter 05.

### External integrations (high-level map)

| Service | Where wired | Notes |
|---|---|---|
| **Shopify** (Admin REST) | edge `sync-shopify-orders`; invoked from app at `features/onboarding/actions.ts` via `…/functions/v1/sync-shopify-orders?order_id=` | App reads from the `shopify_orders` table; the Next app never calls Shopify directly. |
| **Apify** (IG scraping) | edge `scrape-pending-apify` (`run-sync-get-dataset-items`) | App only queues handles into `instagram_cache(status='pending')`; cron does the fetch. |
| **Meta Ads warehouse** (separate Supabase project) | `lib/supabase/meta-ads.ts` (app) + mirrored Deno port in the apify edge fn | Read-only `primary_table` scan for `IFAD`-tagged ad names; used to mark ads "tested". Optional. |
| **Gmail SMTP** (email) | `lib/email.ts` via Nodemailer (`smtp.gmail.com:465`) | Sends notifications/collab emails. Replaced the planned GAS `MailApp` endpoint. |
| **Google Sheets** (legacy mirror) | `lib/sheet-mirror.ts` — HMAC-signed POST to legacy GAS `doPost` | **Archived/not invoked.** Supabase is sole source of truth. |
| **GoKwik** | Not present in this codebase | Legacy GAS integration only. |
