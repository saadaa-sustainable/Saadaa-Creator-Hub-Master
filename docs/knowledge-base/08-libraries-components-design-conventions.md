# 08 · Libraries, Components, Design System & Conventions

> Part of the CreatorHub KB. Last verified 2026-06-07. Root: `apps/web`. Code is authoritative.

## 1. `lib/` — Shared Libraries

### Supabase clients

- **`lib/supabase/client.ts`** — `createClient()` browser client (`@supabase/ssr createBrowserClient`, anon key only).
- **`lib/supabase/server.ts`** — `createClient()` (async, cookie-bound RSC/Route client, user-scoped/RLS) and `createServiceClient()` (**privileged service-role**, `persistSession:false`, throws if `SUPABASE_SERVICE_KEY` unset). Doc-mandate: "NEVER ship to the browser. Only use inside server actions / route handlers AFTER calling `assertPermission()`."
- `lib/supabase/types.gen.ts` — full generated `Database` (regenerated against live DB 2026-06-07: all tables/views/functions) + hand-kept union aliases (`WorkflowStatus`/`PaymentStatus`/`AdResult`/…) and `Row` interfaces on top, because the DB stores enums as TEXT+CHECK (raw generator returns `string`). Regenerate with `npm run db:types`, then re-reconcile the aliases. `lib/supabase/meta-ads.ts` — Meta-Ads warehouse accessor.

### RBAC

- **`lib/rbac.ts`** (pure, client-safe): `PermissionKey` union (14 keys); `PERMISSION_DESCRIPTIONS`; `ADMIN_EMAILS` allowlist (devesh/mahesh/tanvi/shrishti @saadaa.in); `normalizeRole` collapses label drift → `Global Admin | User | Accounts Team | Campaign Owner | custom`; `STATIC_GRANTS` fallback (used only when not DB-hydrated — **2026-06-07:** `campaign_create`/`campaign_edit` are now Campaign Owner + Global Admin only; `User` lost them); `hasPermission(actor,key)` — DB-hydrated path wins (grant iff key present OR `admin` present AND key≠`admin`); else `STATIC_GRANTS` by normalized role; `custom` role without hydration → deny-all (fail-closed).
- **`lib/rbac.server.ts`** (`server-only`): `assertPermission(key)` = `requireActor()` + `hasPermission`, throws `Missing permission: ${key}`. The gate at the top of every write server-action.
- **`lib/auth.ts`** — `getActor` (React `cache()`-wrapped): auth.getUser → `user_access` row (must be active) → permission hydration against `access_roles` + `access_role_permissions` (service client; **fail-closed + loud** — every error logged, name drift logged because custom roles then deny-all) → fire-and-forget `touchUserActivity` (debounced 5-min, writes `login` audit row). `requireActor()` throws if no actor.

### Email & notifications

- **`lib/email.ts`** — Nodemailer Gmail SMTP. `getTransporter()` → `smtp.gmail.com:465` secure, `EMAIL_USER`/`EMAIL_PASS`. `sendMail` returns `{ok,messageId?,error?}`, never throws. From-name defaults "Saadaa". cc/bcc/replyTo + base64 attachments.
- **`lib/notifications.ts`** (`server-only`, best-effort, never throws):
  - `NOTIFICATION_TYPES` — canonical `email_type` constants: `CAMPAIGN_CREATED`, `PAYMENT_PROCESSED`, six submitter confirmations (`REACHOUT/INBOUND/ONBOARDING/CAMPAIGN/POSTING/PAYMENT_CONFIRMATION`), `SHOPIFY_VALIDATION_FAILED`, seven cron/time-based (`PENDING_ONBOARDING`, `POSTING_PENDING`, `DELIVERY_REMINDER` — creator nudge 2 days before `est_delivery`, 2026-07-21, `CONTENT_REMINDER`, `PAYMENT_ELIGIBLE`, `PAYMENT_SLA_BREACH`, `CAMPAIGN_ENDING`), and `USER_INVITATION`.
  - `wrapNotificationHtml` — shared branded wrapper (dark header `#2C2420`, gold eyebrow `#F0C61E`, ecru body `#FAF8F5`, 600px). Matches the collab email.
  - `buildConfirmationBody` — greeting → summary → key/value table (auto-drops null/empty rows) → "Thanks, Saadaa CreatorHub". HTML-escaped.
  - `sendNotification` — normalizes/de-dupes recipients, wraps body, sends per-recipient in parallel, logs each to `email_logs`. Triple-guarded against throwing.
  - `notifyActorConfirmation` — emails the logged-in actor a submit confirmation; safe inside `after()`.
  - **All emails reference Collab ID (`SIF-N-Cn`) as the primary id (2026-06-10):** reach-out / onboarding / posting confirmations + the creator-facing payment-processed email lead with COLLAB ID (the per-deliverable post id, if shown, is a secondary "(deliverable)" row). The collab brief email + cron notifications already used it. Exception: the internal `SHOPIFY_VALIDATION_FAILED` alert keeps Post ID (deliverable-level order failure).
  - `resolveGlobalAdminEmails()` / `resolveAccountsTeamEmails()` — query `user_access` (active, role-filtered).

### Other libs

- **`lib/system-errors.ts`** — `logSystemError({type,key?,message,source?})`: generic Error-Portal sink. **Dedupe:** updates the existing unresolved row matching `(type,key,source)` rather than inserting (partial-unique index). Never throws.
- **`lib/sheet-mirror.ts`** — HMAC-SHA256-signed POST to legacy GAS. **ARCHIVED — not invoked** (all callers removed 2026-05-21; Supabase sole source of truth).
- **`lib/formatters.ts`** — IST (`Asia/Kolkata`) dates. `formatRupees` (INR), `formatNumber`, `formatFollowers`, `formatDate`/`formatDateTime`, `pct`. `workflowStatusLabel` — **display-only relabel** (`"On Board"→"Onboard"`); never query with the label. `tierFromFollowers` (matches the `creators.category` GENERATED column). `proxyAvatarUrl(url,size=96)` — **weserv.nl proxy** to bypass Instagram CDN Referer blocks.
- **`lib/validators.ts`** — centralized URL validation. `IG_PROFILE_RE`; `isValidUrl`; Zod field factories `instagramProfileField`/`optionalUrlField`/`requiredUrlField`.
- **`lib/payable-cycle.ts`** — `PAYMENT_DUE_DAYS=30`, `PAYABLE_CYCLE_DAYS=[15,30]`. `nextPayableCycleDate(due)`, `paymentDueDateFor(postDate)=+30d`, `computeMatchStatus`.
- **`lib/instagram-shortcode.ts`** — port of legacy `shortcodeToDate` (bitshift, no API). `extractShortcode`, `postDateFromUrl` (IST), `usernameFromUrl`.
- **`lib/attachments.ts`** — `TERMS_ATTACHMENT` (`Saadaa_Influencer_TC.pdf`, served at `/api/assets/saadaa-influencer-tc`).
- **`lib/cn.ts`** — `cn(...) = twMerge(clsx(...))`.
- **`lib/env.ts` / `lib/env.server.ts`** — see chapter 03.

## 2. `components/`

### `components/ui/` (barrel `ui/index.ts`)

| Component              | Notes                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`               | CVA; variants primary (yellow CTA, "<10% of any screen")/secondary/ghost/danger/link; sizes sm/md/lg; `asChild` via Radix Slot; loading shimmer         |
| `StatusPill` + helpers | CVA pill, tones neutral/success/warning/danger/info/accent. `WorkflowStatusPill`, `AdResultPill`, `PaymentStatusPill`. Labels via `workflowStatusLabel` |
| `KpiCard` / `KpiStrip` | Strip is `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4` (mobile 2-col)                                                                                     |
| `GlassCard`            | "the ONE container pattern across the app. Never nest."                                                                                                 |
| `Input`                | labeled field, aria-describedby/invalid, `text-base sm:text-sm` (16px on mobile → no iOS zoom)                                                          |
| `MissingFieldsAlert`   | red `role="alert"` above submit; null when empty                                                                                                        |
| `ViewModeToggle`       | list/cards/kanban radiogroup, localStorage-persisted                                                                                                    |
| `SubmissionToggle`     | "Not Submitted / Submitted" segment shared by Onboarding + Posting                                                                                      |
| `InfoTooltip`          | Shared Radix popover for plain-language KPI/chart/table definitions; portalled and collision-aware                                                      |
| `Avatar`               | the single avatar component (see conventions)                                                                                                           |
| `PageHeader`           | canonical stage header; `knowMore` slug renders `.btn-know-more` carrying `data-know-more={slug}` (the KM modal hook) + optional `modePill`             |

Other primitives: `card`, `label`, `skeleton` (Skeleton/KpiStripSkeleton/ChartSkeleton/TableSkeleton), `page-placeholder`, `partnership-key-edit`, `empty-state`, `count-up` (eased number count-up on first viewport entry; reduced-motion-safe; server tiles use `features/dashboard/count-up-stats.tsx` client wrappers since RSC can't pass format fns).

**Bento kit split (2026-07-02):** `features/dashboard/bento-kit.tsx` = LIGHT (HeroKpi/TileHead/InfoDot, no recharts — safe for any route's KPI strip); `features/dashboard/bento-charts.tsx` = recharts (DonutTile/ActivityTrendTile/ChartTip — import ONLY on chart-bearing surfaces or the route bundle grows ~170kB). All dashboard tabs (Journey/TAT/Ad Status/Compliance/Cost/Funnel/Internal + Overview + My Dashboard) use HeroKpi for KPI strips; gold #F0C61E never appears on KPI accents (CTA-only).

**Bento motion system (globals.css, 2026-07-02):** `.bento-tile` (one-shot entrance + hover lift/accent border), `.bento-stagger` (child stagger, cap 12), `.bento-bar` (scaleX grow), `.bento-donut-slice` (hover thicken), `.dash-tab-swap` (tab-panel rise). Rules: transform/opacity ONLY, mount-only (never replay on data/filter refresh), disabled under prefers-reduced-motion. Used across Dashboard bento/strips/widgets, My Dashboard, Partnership board. Gotcha pair: custom modals must self-style footers (`.modal-foot`/`.btn` are scoped to `.modal-panel--onboarding`); `.ob-list-wrap` tables are `table-layout:fixed` — every new column needs a `[data-column-id]` width rule.

**Overview popup rule (2026-07-10):** operational detail popups use the centered Ad Status modal rhythm (`campaign-detail-modal` + `ob-overview-modal` + `ad-detail-modal` where appropriate), a bounded scroll body, and a stable footer. Detail values use `white-space:normal` + `overflow-wrap:anywhere`; do not truncate team-facing data with ellipses. The Posting Drive help uses the same portalled `InfoTooltip`, so it cannot be clipped by the modal body or overlap adjacent fields.

### `components/nav/`

- **`sidebar.tsx`** — permission-gated nav; each leaf carries `show?: (actor) => boolean` via `hasPermission`; `SidebarSection` strips any group whose every child is hidden. Journey/TAT/Ad-Status/Compliance/Cost/Funnel/Internal are Dashboard tabs (removed from sidebar). Optimistic active-path + prefetch on hover.
- **`mobile-topbar.tsx`** — sticky mobile header: hamburger, brand "Saadaa Creator Hub", section title (`SECTION_TITLES`), Know More button (`SECTION_KM_SLUGS`; for `/dashboard` resolves the slug from the active tab). Same `data-know-more` hook.
- Also `nav/topbar.tsx`, `nav/sidebar-scrim.tsx`, `nav/sign-out-action.ts`.

### `components/data-table/data-table.tsx`

TanStack Table v8 generic `DataTable<TData>`. Dense legacy density, sticky `bg-bg-ecru` header, sortable columns w/ keyboard + `aria-sort`, zebra rows, "Showing N rows". **`mobileCard` render-prop** produces stacked cards on `<md` while the `<table>` is `hidden md:block` — the project-wide table↔card responsive pattern.

## 3. `features/know-more/` — Know More System

A global single-mount help system. **Protocol: every stage ships a KM slug.**

- **`know-more-modal.tsx`** — mounted once in `app/(app)/layout.tsx`. Document-level click delegation on `[data-know-more]` (works for any PageHeader/topbar without re-binding). Esc-to-close + scroll-lock. `createPortal` slide-in right panel; unknown slugs → soft "coming soon".
- **`content/registry.tsx`** — `KM_REGISTRY: Record<slug, ComponentType>` (21 slugs). Adding a stage = add an entry + create `content/<slug>.tsx`.
- **`km-shell.tsx`** — shared primitives `KMHeader`, `KMSection({tag})`, `KMList`, `KMCode`, `KMCallout({tone})`.
- **`content/<slug>.tsx`** — default-exported component from km-shell primitives, legacy-density (~400-600 words), code-accurate, following the 5-section template (Page layout · KPIs · Form sections · Rules · Callout).

## 4. Design System

### `app/globals.css` `@theme` tokens (Tailwind v4)

- **Backgrounds:** `--color-bg-base #faf8f5`, `bg-surface #f5f1ec`, `bg-ecru #f0ead6`, `bg-alt #f6f3f1`, `bg-muted #f0ede6`, `bg-white #ffffff`.
- **Text:** `text-primary #161513`, charcoal `#2c2420`, mid `#494640`, secondary `#6e695e`, tertiary `#9a9384`, link `#3b6fd4`.
- **Borders:** `--color-border #e7e2d2`, soft/warm/mid/strong variants.
- **Accent (CTA ONLY):** `--color-accent #f0c61e`, accent-text `#161513`, sand/amber/warm.
- **Status (paired):** success `#4f7c4d`/bg `#ecf1e9`; warning `#b57514`/bg `#faf1dc`/border `#e8c87a`; danger `#c0392b`/bg `#fdecea`; info `#355c7a`/bg `#d6e1f5`.
- **Secondary accents (detail panels only — never nav/primary):** purple `#7b4fbf`, pink `#b54f7a`, indigo `#3b6fd4` (+ soft bg tints).
- **Geometry:** `--radius` 12px (sm 6 / lg 16); shadows sm/md/lg; `--shadow-focus 0 0 0 3px rgba(240,198,30,.24)`; `--width-sidebar 260px`, `--container-content 1400px`. Animations fade-in/slide-down/rise/shimmer/pulse-soft.

### Fonts

`theme/fonts.ts` + globals: **Helvetica native stack everywhere** (`--font-sans/display/emph` → `"Helvetica Neue", Helvetica, Arial, sans-serif`). No webfonts. `fonts.ts` keeps an empty `spaceGrotesk` placeholder so old `.variable` spreads compile.

### Glass card

The shipped `.glass-card` is a **solid surface** (`bg-surface`, `radius-lg`, `shadow-sm`, 1px border, hover lift) — NOT the translucent blur formula. `GlassCard` is the single wrapper; "Never nest."

### ⚠ Divergence from `MASTER.md`

The historical brand spec lives at `Influencer Project/design-system/MASTER.md` (outside the repo). The **live `@theme` is authoritative** and has diverged:

- **Fonts:** MASTER says Space Grotesk + Inter; live app is **Helvetica native stack only**.
- **Sidebar:** MASTER says dark `#2C2420`; live app uses a **light** sidebar.
- **Glass card:** MASTER's translucent-blur is superseded by the solid `.glass-card`.

Still holds from MASTER: warm ecru palette, yellow `#F0C61E` = CTA only, paired status tokens, secondary accents for detail panels only, SVG icons (Lucide), 150-250ms transitions, touch targets ≥40-44px.

## 5. Cross-Cutting Conventions

### ID generation (atomic, in Postgres RPCs)

- `SIF-N`/`inf_id` + `post_id`/`post_number`/`collab_number` are generated by the **`submit_reachout` RPC**, not TS; the action reads back `{post_id, post_id_short, post_number, collab_number, inf_id}`.
- `IFC{NNN}` campaign id by the **`submit_campaign` RPC**; ownership stamped in a follow-up `created_by` UPDATE.
- `collab_id` = `${inf_id}-C${collab_number}` (groups deliverables); `post_id` = short `${inf_id}-P${post_number}` (no `-C`).

### Deliverable model (§6.2 expansion)

A collab with `reels + static_posts` total >1 keeps the representative (parent) row at 1 deliverable and spawns child rows for the rest. **`stories` count but spawn no child row.** Equal-split: `commercial_amount = total / (reels + static_posts)` per row so the collab sum equals the agreed total. `deliverable_role` = parent|child|single. Re-submit is destructive (children re-created).

### Server-action write pattern (canonical)

`"use server"` → `assertPermission(<key>)` → Zod `safeParse` → `createServiceClient()` → write (RPC or `.update/.insert`) → `revalidateTag/revalidatePath` → fire-and-forget side-effects (`notifyActorConfirmation`, `sendNotification`) inside `after()`. Result envelope: `{ok:true, …} | {ok:false, error, fieldErrors?}`.

### Supabase-only source of truth

All `mirrorToSheet()` calls removed 2026-05-21. `sheet-mirror.ts` remains but is not invoked. Shopify orders sync via the `sync-shopify-orders` edge function (on-demand + 3-hr cron).

### Email-notification matrix recipients

- Submitter confirmations → the logged-in actor.
- Payment eligibility / SLA breach → Accounts Team.
- Campaign Ending / admin alerts → Global Admins.
- Shopify Validation Failed → the assigned user / submitter.
- User Invitation → the invitee (links to `/login`; Google-OAuth-only).
- Collab email → the creator.
  Every send logs to `email_logs` with its `NOTIFICATION_TYPES` `email_type`.

### Habits (enforced per change)

- **Changelog:** every shippable change appended to `Influencer Project/CreatorHub-Changelog-AddOns.md` in the same commit.
- **Know More:** every UI/behavior change updates the view's KM content in the same commit; new stages register a slug.
- **No internal jargon in UI:** strip §N / MOM / Stage N / "founder spec" refs from user-facing strings. Collab Type = Barter / Barter + Paid only.

### Mobile UI rules

2×2 bento KPI strips, sticky `MobileTopbar` (hamburger + "Saadaa Creator Hub"), drawer sidebar from left, touch targets ≥44px, weserv image proxy, DataTable mobile-card fallback.

### iOS date input reset

`globals.css` ships a shared selector list for `input[type="date"]`/`datetime-local`: `-webkit-appearance:none`, `min-height:44px`, `line-height:1.25`, transparent empty-date placeholder, hidden spin/clear chrome. **New date fields MUST be added to this selector list** and verified on real iOS Safari (DevTools emulation lies).

### Filter-above-KPI + stage layout

Every stage renders Header → Filter → KPI → Toolbar → Board. Stage chrome shared via `.onboarding-stage`, `.onboarding-filter-card/-grid`, `.ob-viewtoggle`, `.ob-card-grid`. Onboarding is the canonical template; no per-stage reinvention.

### Shared avatar pattern

`components/ui/avatar.tsx` is the single avatar component. Always proxies through weserv (`proxyAvatarUrl`), falls back to initials on error, enforces fixed square dims, and on click opens a portal Creator Overview modal fetching `/api/creators/<handle>/overview`. Never construct avatar `<img>` ad hoc.

### Dates / money

IST everywhere (`formatters.ts`, `payable-cycle.ts`, `instagram-shortcode.ts`). `workflow_status` stored value queried as-is; only `workflowStatusLabel` relabels for display. All money via `formatRupees` (INR, en-IN).
