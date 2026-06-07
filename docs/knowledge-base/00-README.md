# CreatorHub Knowledge Base — the Project Brain

> **What this is.** The single, version-controlled source of truth for the **Saadaa Creator Hub** (a.k.a. "CreatorHub" / "New Influencer Project") — the Next.js 15 + Supabase rebuild of the legacy Google Apps Script influencer-management platform. It documents every subsystem: stack, architecture, environment, database, backend functions, every feature, the shared libraries, the design system, and the conventions.
>
> **How to use it.** Read `00` → `08` top-to-bottom for a full mental model, or jump to the chapter you need. Each chapter cites real `file:line` references — the code is always the ultimate authority; this KB is the map.
>
> **How to keep it current (mandatory).** Every shippable change does TWO things in the same commit: (1) append a dated entry to the external changelog `Influencer Project/CreatorHub-Changelog-AddOns.md`, and (2) update the affected KB chapter here. See `09-changelog-and-maintenance.md`.
>
> **Last full sweep:** 2026-06-07.

---

## Table of contents

| # | Chapter | Covers |
|---|---------|--------|
| 00 | **README** (this file) | What the KB is, how to use + maintain it, the 60-second project summary |
| 01 | [Overview & Stack](01-overview-and-stack.md) | What the product is, exact framework versions, scripts, config files, platforms & hosting |
| 02 | [Architecture & Data Flow](02-architecture-and-data-flow.md) | Request/render pipeline, route groups, auth gating, RBAC, server actions, API routes |
| 03 | [Environment & Config](03-environment-and-config.md) | Every env var (Next + Supabase edge), where each is set, how env is read |
| 04 | [Database Schema](04-database-schema.md) | Every table/column/constraint/index, RPCs, triggers, pg_cron, enums |
| 05 | [Supabase Backend & Integrations](05-supabase-backend-and-integrations.md) | The two edge functions, Shopify / Apify / Meta-Ads / IG-shortcode integrations |
| 06 | [Workflow-Stage Features](06-workflow-stage-features.md) | Reach Out, Campaigns, Onboarding, Posting, Order Status, Offboarding |
| 07 | [Analytics & Operational Features](07-analytics-and-operational-features.md) | Dashboard, My/Internal/Cost/Compliance/Funnel/TAT/Journey, Ad Status, Accounts Hub, Creators, Sheets, Errors, User Panel |
| 08 | [Libraries, Components, Design System & Conventions](08-libraries-components-design-conventions.md) | `lib/*`, `components/*`, Know More, design tokens, cross-cutting rules |
| 09 | [Changelog & Maintenance](09-changelog-and-maintenance.md) | Where the changelog lives, the update protocol, recent milestones |

---

## 60-second project summary

**Saadaa Creator Hub** manages the full influencer-collaboration lifecycle for the Saadaa brand:

```
Reach Out → On Board → (Order Sent) → Posted → Delivered → RTO / Cancelled
                                                          ↘ Offboarded (manual terminal)
```

- **Frontend:** Next.js 15 (App Router, React 19 Server Components + Server Actions), Tailwind v4 (`@theme` tokens, no config file), TanStack Table/Query, Radix UI, Recharts, Lucide icons. One package: `apps/web`.
- **Backend / data:** Supabase — Postgres (sole source of truth), Google-OAuth-only auth (GoTrue), Storage (`avatars` bucket), two Deno **Edge Functions** (`sync-shopify-orders`, `scrape-pending-apify`), and pg_cron.
- **External integrations:** Shopify (order validation, via `shopify_orders` table), Apify (Instagram scraping, via `instagram_cache` queue), Meta Ads warehouse (separate Supabase project, ad reconciliation), Gmail SMTP (Nodemailer, all email).
- **Hosting:** Vercel (region `bom1`, push-to-`main` auto-deploys prod) + a daily Vercel cron at `/api/cron/notifications`.
- **Auth/RBAC:** `getActor()` per-request identity; permission scopes resolved from DB (`access_roles` + `access_role_permissions`) with a fail-closed static fallback; every write gated by `assertPermission(<key>)`.
- **Key ID model:** `inf_id` = `SIF-N`; `post_id` = short deliverable id `SIF-N-PN`; `collab_id` = `SIF-N-CN` (groups all deliverables of one collab); `campaign_id` = `IFC{NNN}`. IDs are generated atomically inside Postgres RPCs (`submit_reachout`, `submit_campaign`).
- **Deliverable model:** a collab's deliverable total = `reels + static_posts`; **stories count as deliverables but never spawn a child row**. `commercial_amount` is equal-split across deliverable rows and re-summed per collab for any display/KPI.

> **Legacy.** The old Google Apps Script app lives in `Influencer Project/legacy-gas/` (read-only reference). New features mirror legacy data shapes + business rules exactly; only UI/UX and scalability diverge.
