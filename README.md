# New Influencer Project — CreatorHub (Next.js + Supabase + Vercel)

Replacement for the legacy GAS SPA at `../legacy-gas/`. Same Saadaa palette + same workflows; mobile-first responsive UI on a modern stack.

> Build spec: [`../docs/knowledge-base/09-new-stack-architecture.md`](../docs/knowledge-base/09-new-stack-architecture.md)
> Legacy reference: [`../docs/knowledge-base/00-overview.md`](../docs/knowledge-base/00-overview.md)
> Data model: [`../docs/knowledge-base/03-supabase-migration.md`](../docs/knowledge-base/03-supabase-migration.md)

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15.1+ (App Router) + React 19 + TypeScript 5 |
| UI | Tailwind CSS v4 (CSS-first `@theme`) + Radix primitives + Lucide icons |
| Data | Supabase JS v2 + TanStack Query v5 + TanStack Table v8 |
| State | Zustand (UI state only) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Tests | Vitest + Testing Library |
| Host | Vercel (web) + Supabase Edge Functions (cron) |

## Layout

```
apps/web/
├── app/                  # App Router
│   ├── (auth)/login/
│   ├── (app)/            # Authenticated shell
│   │   ├── layout.tsx
│   │   └── dashboard/
│   ├── layout.tsx
│   ├── providers.tsx
│   ├── globals.css
│   └── page.tsx          # redirect → /dashboard
├── components/
│   ├── ui/               # GlassCard, KpiCard, StatusPill, Avatar, Button, Input, EmptyState, Skeleton, ViewModeToggle
│   ├── nav/              # Sidebar, Topbar
│   └── data-table/       # TanStack Table wrapper
├── lib/
│   ├── supabase/         # client.ts, server.ts, types.gen.ts
│   ├── auth.ts           # getActor() cached per request
│   ├── rbac.ts           # PermissionKey + assertPermission()
│   ├── env.ts            # zod-validated env
│   ├── cn.ts
│   └── formatters.ts     # ₹ / followers / dates / avatar proxy
├── theme/
│   └── fonts.ts          # next/font Inter + Space Grotesk + Plus Jakarta
├── __tests__/
├── middleware.ts         # Supabase session refresh
├── next.config.ts
├── tsconfig.json
└── package.json
```

## Setup

```bash
cd apps/web

# Install
pnpm install        # or npm install / yarn

# Env
cp .env.example .env.local
# Fill SUPABASE_SERVICE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY from Supabase dashboard
# Project ID: xynyvbagcudjrzklwnqp

# Type generation (after Supabase CLI auth)
pnpm db:types

# Dev
pnpm dev            # http://localhost:3000

# Tests
pnpm test
pnpm typecheck
pnpm lint
```

## Design system

Token source of truth: the `@theme { … }` block inside `apps/web/app/globals.css`.

Tailwind v4 CSS-first config — no `tailwind.config.ts`. Tokens are defined as `--color-*`, `--font-*`, `--radius-*`, `--width-*`, `--text-*`, `--blur-*`, `--animate-*` CSS variables inside `@theme`. They become both:
- Real CSS custom properties (referenceable via `var(--color-accent)`)
- Tailwind utilities (`bg-accent`, `text-accent`, `border-accent`, etc.)

Adding a token: edit `globals.css` `@theme` block in the same commit as the usage.

Hard bans (carried from legacy `DESIGN.md`):

- No dark mode.
- No new CSS variables without updating `tokens.css` in the same commit.
- No `border-left: 4px solid` accent stripes.
- No gradients on text, accent, or borders.
- No nested glass cards.
- No emoji in UI copy — Lucide icons only.
- No em dashes in copy.
- Yellow `--accent` (#F0C61E) = CTA + active-nav ONLY. Never decorative.

## Boundary rules

- Server Components by default.
- Client Components for: form inputs, drag-and-drop, tab toggles, charts with tooltips, filter chip → URL bridge, modals, toasts.
- No client-side Supabase reads for first-paint data. TanStack Query is for mutations + revalidation only.
- Suspense boundaries around every async Server Component fetch.
- `loading.tsx` + `error.tsx` per route. `not-found.tsx` for slug routes.

## Status — Phase 0 complete

| Item | Done |
|------|------|
| Next.js + Tailwind + TypeScript scaffold | ✅ |
| Design tokens + fonts | ✅ |
| Supabase clients (browser + server + service-role) | ✅ |
| Auth helpers + RBAC | ✅ |
| Middleware for session refresh | ✅ |
| Primitives: GlassCard, KpiCard/KpiStrip, StatusPill (+ Workflow/AdResult/Payment maps), Avatar, Button, Input, EmptyState, Skeleton, ViewModeToggle | ✅ |
| DataTable (TanStack Table headless wrapper, mobile cards) | ✅ |
| Sidebar with permission-gated nav + nested Reach Out group | ✅ |
| Topbar | ✅ |
| Root layout + (app) shell + (auth)/login | ✅ |
| Sample `/dashboard` page with Suspense + sample queries | ✅ |
| Vitest setup + 3 test suites (StatusPill, KpiCard, formatters) | ✅ |

## Next — Phase 1 reads

Wire the 17 read-heavy views per `09-new-stack-architecture.md` §7 view catalog. Each view = `page.tsx` + `loading.tsx` + `error.tsx`. Server Components fetch directly via `createClient()` from `lib/supabase/server.ts`. Client wrappers only for sort / filter-to-URL / toggle state.

Migration ordering: Onboarding → Posting → Order Status → Journey → TAT/Funnel/Cost → Performance → Compliance → Errors.
