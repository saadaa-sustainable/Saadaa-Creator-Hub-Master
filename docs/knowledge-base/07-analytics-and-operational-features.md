# 07 · Analytics & Operational Features

> Part of the CreatorHub KB. Last verified 2026-06-07. Paths relative to `apps/web`. All analytics fetchers use `createServiceClient()` (page-level RBAC gates access first) and aggregate in-memory in JS rather than via SQL views/RPCs. Each fetcher carries a legacy-GAS parity note in its header.

---

## Dashboard — Tabbed Command Centre

**Purpose:** A single tabbed command centre. Tab 1 is a cross-system "Overview" aggregate (bento mosaic); the remaining tabs each mirror a sidebar feature's full page-view verbatim (minus that page's own `<PageHeader>`).
**Route:** `/dashboard?tab=<slug>` — active tab in `?tab=` (linkable, server-rendered, default `overview`). Only the active tab fetches data; each tab body is a keyed `<Suspense>` async server component.

**Tab registry** (`features/dashboard/tab-config.ts`): `DASHBOARD_TABS` = `overview, creators, partnerships, journey, tat, ad-status, compliance, cost, funnel, internal`; `TAB_LABELS`; `TAB_KM_SLUGS` (per-tab Know More); `resolveTab()`. Pill tab bar (`tabs.tsx`) uses Next `<Link prefetch>` per tab (not buttons) for instant RSC switching, ARIA tablist + roving Arrow/Home/End nav.

**Tab bodies** (`tab-bodies.tsx`): each non-Overview body re-creates its standalone route below the title — same outer `<div className="onboarding-stage <name>-stage">` wrapper (load-bearing; scoped CSS keys off it) holding the same filter bar + KPI strips + boards in the same order, reusing the same feature components & fetchers:

| Tab | Reuses |
|-----|--------|
| overview | `fetchDashboardData` → `DashboardFiltersBar` + `DashboardOverviewStrip` + `DashboardBento` |
| creators | `fetchCreatorAnalyticsPage` → filters + `CreatorAnalyticsView` (see Creator Analytics below) |
| partnerships | `fetchPartnershipBoard` → `PartnershipBoard` (see Partnership Status below) |
| journey | `fetchJourneyData` → `JourneyPageClient` |
| tat | `fetchTatData` → `TatFiltersBar` + `TatPageClient` |
| ad-status | `fetchAdStatusData` → filters + KPI strip + `AdStatusBoard` |
| compliance | `fetchComplianceData` → `ComplianceBody` |
| cost | `fetchCostAnalyticsData` → `CostAnalyticsBody` |
| funnel | `fetchFunnelData` → `FunnelBody` |
| internal | `fetchInternalDashboardData` → `InternalDashboardBody` |

### `fetchDashboardData` (Overview aggregate)
`features/dashboard/queries.ts` — single parallel fetch (posts ≤5000 + creators ≤5000), mirrors legacy `getDashboardStatsFiltered` plus new sparkline + action chips + channel split.
- **Defensive column fallback:** tries `POSTS_COLS_EXTENDED` (base + `ads_status`); on PostgREST `42703` retries `POSTS_COLS_BASE` (adWinners stays 0).
- **Server filters:** campaign, content_type (eq), workflow_status (ilike). **Client filters:** influencerType (category substring), dateFrom/dateTo.
- **Pulse:** today vs yesterday + delta for reachOut/onboarded/posted/delivered.
- **Spotlight spend:** 30-day commercial-spend sparkline per `post_date` + total.
- **Pipeline:** reachOut/onboarded/posted, pendingContent, paymentPending, adWinners, conversionPct, postRatePct.
- **Channel split (`channels`, 2026-06-07 widget):** classifies each row by `posts.reachout_direction` — `'inbound'` (creator approached us) vs everything-else-`outbound`. Per-channel reachOut/onboarded/posted/delivered/creators(distinct)/spend + conversionPct. Type `ChannelStats` in `types.ts`.
- **Breakdowns:** contentBreakdown (content_type donut), categoryBreakdown (creator tier donut, one creator counted once).
- **Monthly funnel:** 6 zero-seeded months; reachOut by reach_out_date, onboarded by onboard_date, posted by post_date.
- **Spends per campaign** (top-8); **postingGoal** (posted ÷ total).
- **Top creators** (top-6 by followers + post count); **team leaderboard** (grouped by `onboarded_by`, top-6).
- **StageBoard** (4-col mini-kanban): latest **10** cards per stage (preview), with a `+N more →` drill-in link. The column-header badge shows the **true bucket total** via `stageCounts` (not the rendered-card count) — fixed 2026-06-10 (was showing the capped count). Payment lives on the PARENT collab only; commercial total reconstructed by summing equal-split siblings.
- Action chip → href routing in `ACTION_HREFS` (needsEmail/needsOrder/awaitingPost/noTracking/noPartnership/overdue).

### Bento layout (`dashboard-bento.tsx`)
12-col mosaic, rows A–J: Hero+Spotlight → Pulse → StageBoard → Action+PostingGoal → WorkflowFunnel+MonthlyTrend → **ChannelSplit (Row E2, full-width)** → Content+Tier donuts → PipelineKpis → TopCreators+TeamLeaderboard → SpendsPerCampaign → CampaignKpis. The **channel-split widget** (`widgets/channel-split.tsx`) renders two `ChannelCard`s (Inbound indigo `#3B6FD4`, Outbound purple `#7B4FBF` — DS "detail panel" accents, off-nav), each with headline conversion %, Creators/Spend/Posted chips, and a 3-step mini funnel sized to the channel's own max bucket.
- **Per-campaign focus (2026-06-10):** when exactly one campaign is filtered, `fetchDashboardData` populates `campaignFocus` (a dedicated per-campaign query, independent of date/tier/content filters) and `widgets/campaign-focus.tsx` renders a Row-0 strip: **Reached Out** · **Onboarded Y/cap** (slots-left) · **Un-onboarded** (reached out, never onboarded-active) · **Posted**. Surfaces the onboarding-cap funnel. `null` when no single campaign is selected.

---

## My Dashboard — Personal Workload Board
**Route:** `/my-dashboard`, scoped to `posts.onboarded_by = actor.name || actor.email`. Pulls my posts (≤500), joins creators, reconstructs collab totals from equal-split siblings.
- **KPIs:** myActive, pendingPost, posted, rtos, totalCampaigns, activeCampaigns, totalReachouts.
- **Pending actions:** "Overdue delivery" (On Board/Order Sent + est_delivery<today) and "Awaiting post" (Delivered + no post_date), sorted by daysOverdue, top-15.
- **Team leaderboard:** global, score = `posted*5 + paid*8 + active*2`, top-5.

## Internal Dashboard
**Route:** `/internal-dashboard`. Mirrors legacy `getDashboardMetrics`. `InternalDashboardData extends FunnelData` + per-campaign axis. 8 metrics per bucket: r/o/b/d/p/g/pend/overdue. **Dual-bucketing rule:** reach-cohort metrics are PARENT-ONLY bucketed by `reach_out_date`; `p` (posted) is per-deliverable bucketed by `post_date`. `overdue` = pend & reach >15 days old. Buckets by month + ISO-week + team + campaign.

## Cost Analytics
**Route:** `/cost-analytics`. Mirrors legacy `getBudgetVsActuals`. Budget from `campaign_budget` (+ `campaigns.total_budget`), actuals from `posts.commercial_amount` (status ∈ on board/order sent/posted/delivered). `actualCost` sums across ALL rows (equal-split); `actualCreators` counts parents only. Rollups keyed `month||campaignId||tier`. `variance = actual−budget`, `utilPct = actual/budget`. Alerts: top-5 overBudget + top-5 underUtilised (<50%).

## Compliance KPIs
**Route:** `/compliance`. Mirrors legacy `getComplianceKPIs` 1:1, no date filtering. Pipeline (parent-only mutually-exclusive buckets). Conversion rates verbatim: onboardConvRate, postingRate, deliveryRate, paymentRate, rtoRate (each `{pct,num,den}`). TAT averages (roToOb/obToPost/roToPost). Coverage: withOrder/withTracking/withPostLink/withEmail/withBank + email & bank coverage %. Per-campaign + per-team breakdown.

## Funnel View
**Route:** `/funnel`. Mirrors legacy `getDashboardMetrics`. Same `FunnelMetrics` 8-metric shape + dual-bucketing as Internal Dashboard (Internal = Funnel + campaign axis). `byMonth`/`byWeek` desc + per-team. `isoWeekKey` is a port of legacy `_isoWeek`.

## TAT Analytics
**Route:** `/tat`. Posts limited to Posted/Delivered (≤2000) + `shopify_orders` for `order_placed_date`. **7 TAT pairs** (each `{avg,min,max,count}`): ro_to_onboard, ro_to_posting, ro_to_order_created, ob_to_delivered, ob_to_posting, order_to_delivered, delivered_to_posting. `daysBetween` floors, rejects negatives/pre-2020. Filters campaign/tier/status/reach-out range (JS). KPI: totalPosts, postsWithOrder, avgEndToEnd, delivered/rto/cancelled (order metrics deduped per order_id). Campaign benchmark chart = per-campaign avg reach→posting days.

## Influencer Journey
**Route:** `/journey`. 4-stage read-only kanban (Reach Out → Onboard → Posted → Payment) + funnel conversion strip. Columns: Reach Out, Onboard (On Board+Order Sent), Posted (every deliverable), Payment (parent rows only). KPI: inPipeline/active/posted/closed. Funnel is cumulative parent-only (counts each collab at every stage reached, so rates are monotonic): reached→onboarded→posted→paid + the three conversion %.

## Ad Status — Winner / ITE / Discarded + Warehouse Reconciliation
**Routes:** `/performance/ad-run-status` (full build) + `/performance/untested-ads` (still a placeholder); also the dashboard `ad-status` tab. Posts in Posted/Delivered (≤2000) + creators + `instagram_cache` + Meta Ads warehouse covered-set.
- **Warehouse reconciliation:** `lib/supabase/meta-ads.ts#fetchMetaAdsCoveredPostIds()` (separate Supabase project, `ad_name ILIKE %IFAD%`, regex-extract `post_id_short`), wrapped in a **5s `Promise.race` timeout**.
- **Eligibility** (`isEligible`): non-trivial `ads_usage_rights` OR in covered set.
- **Buckets:** Untested = not classified AND not in warehouse; Ad-Run = classified (`ads_results` non-empty) OR in warehouse.
- **KPI:** totalEligible, classified, inMetaAds, pendingClassification, winners (`ads_results==="Winner"`), discarded (`Discarded`/`Discarded but analyse`).
- **Badges:** Winner (green), ITE (amber), "Discarded but analyse"→Analyse (blue), Discarded (red), else Untested.
- Shared classification source: `lib/ad-tested.ts` (used by both Ad Status + Accounts Hub `posted_but_not_tested` flag so both surfaces agree).
> The Winner/ITE/Discarded classification LOGIC is owned by Anmol's warehouse (this app only reads `ads_results`/coverage).

## Accounts Hub — Payment Ledger
**Route:** `/accounts-hub`. Mirrors legacy `getAccountsHubData` + `submitPayments`.
- **Collab-ID model:** fetches ALL deliverables in stages {Reach Out, On Board, Order Sent, Posted, Delivered}, collapses to ONE representative row per `collab_id` (lowest post_id), summing `commercial_amount` across equal-split siblings. Payment raised per collab_id.
- **Partial-payments rollup:** `paidSoFar` = sum of UTR-bearing installments, `_remainder` = total − paid, `_isPartial` = 0<paid<total.
- **Draft backfill:** for Posted/Delivered collabs with no payment row, inserts a "Not Due" draft — only if fully payment-eligible. Sets `due_date = post_date + 30d`, `estimated_payable_date = nextPayableCycleDate(due)`.
- **Eligible posts** (`/api/accounts/eligible-posts`, `accounts_write`): collab-level gate (all posted + ads→partnership **approved** via `partnershipApproved()`, 2026-07-02), one representative per ready collab.
- **Estimated payable date (15th/30th):** `lib/payable-cycle.ts` — `PAYABLE_CYCLE_DAYS=[15,30]`, `PAYMENT_DUE_DAYS=30`. `computeMatchStatus` (entered vs commercial). (Saadaa pays 15th & 30th.)
- **KPIs:** postsDone + Not Due / Due / Done / **Partial** (count + outstanding) + totalPayable, computed over the FULL corpus BEFORE filters. Outstanding alert banner lists partially-paid collabs + total owed.
- **Per-deliverable ledger:** `/api/accounts/post-deliverables/[postId]` returns the clicked post + every collab sibling with its payment row.
- **CSV export:** `/api/accounts/export?mode=due|paid|all` — columns include Collab ID, Influencer Name, Username, **Profile URL** (`instagram.com/<username>`), amount/paid-so-far/outstanding/UTR/cycle. `due` = Due+Not Due+Partial, `paid` = Done.
- **Log form (2026-06-10):** the entry field is a **Collab ID** dropdown (`fetchPayableEligiblePosts` already returns one row per collab; value stays the representative post_id internally). Selecting one renders the creator name + handle inline. Import: **Download CSV template** (`Collab ID,UTR,Date,Amount`) + **Upload CSV** (.csv/.xlsx via `parseDelimited` → `resolveToPostId` maps Collab ID→post_id) + Paste from Excel — all share one parser, 10-row cap.
- **Kanban (2026-06-10):** `KANBAN_COLUMNS` adds a 4th **Payment Done** lane. The board special-cases `payment.status === "Done"` → Payment Done (regardless of workflow_status), so Posted shows only unpaid collabs; this set == the Paid CSV.
- **Monthly payable digest (2026-06-10):** check #8 in `app/api/cron/notifications/route.ts`. On day-of-month 12 (this month's 15th cycle) and 27 (30th cycle) it sends ONE branded `accounts_payable_digest` to Accounts Team + Global Admins — a full payable sheet (creator, handle, Collab ID, amount, due, status, **bank name/account/IFSC**) for payments with `estimated_payable_date = cycleIso` and status in Due/Not Due/Partial, excluding Offboarded collabs. Fire-once/day guard via `email_logs`.
- **`submitPayments`** (`actions.ts`): 3-gate pipeline (stage gate Posted/Delivered; §7.2 collab posting completeness; §8.2 ad-partnership gate — since 2026-07-02 requires `partnershipApproved()`, i.e. creator-approved status or admin override, not bare key presence). Dedup key `(post_id, lower(utr))`. **Partial-payments engine:** each distinct UTR = a new installment row; Done cascades status to all collab deliverables + deletes stray sibling rows. Stamps `posted_but_not_tested` (warehouse-aware, 5s timeout). Fires per-creator "Payment Processed" emails + actor confirmation. `recomputePaymentStates` is the daily reconciliation cron.

## Creators — `[username]` Overview
**Route:** `/creators/[username]` (currently a placeholder; full tabbed drill-down pending).
**API (built):** `GET /api/creators/[username]/overview` (`requireActor`): creator row + last-12 posts + payments. **Backfills** missing creator fields (email/agency/bank/ifsc/state) from the most recent post, and contact/address from `shopify_orders`. Stats: postCount, onboardedCount, paidTotal, payableTotal, paymentCount.

## Sheets — Sheet View Grid
**Route:** `/sheets?tab=<id>` (`canEdit = hasPermission(actor,"admin")`). Google-Sheets-style read/edit grid over 10 Supabase tables, one tab each.
- **Catalogue:** `features/sheets/types.ts` `SHEET_TABLES` (posts, creators, campaigns, campaign_budget [special month-block `variant:"budget"`], payments, shopify_orders, system_errors, instagram_cache, inbound_reachout_queue, user_access). Each `ColDef` flags editable/type/options.
- **Fetch:** `fetchTabCounts` (parallel head counts), `fetchSheetData` (paginates past PostgREST's 1000-row cap up to 50k).
- **Actions** (all `assertPermission("admin")`): `updateSheetCell` (type-coerces, snapshots old value), **edited badge** (`recordCellEdit` → `cell_edits`, fails soft on missing table; `fetchRecentCellEdits` returns latest edit per cell within N days), **revised-details email** (`sendRevisedDetailsEmail` fires only for `CRITICAL_COLUMNS` that changed — order_status, est_delivery, delivered_date, commercial_amount, email, bank fields, order_id — to creator + onboarded_by, old→new diff, logs `email_logs`), **cell comments** (`cell_comments` threads with @-mention extraction + validation + fanout).
- **Row delete + restore (Global-Admin only, added 2026-06-09):** `canDelete = hasPermission(actor,"admin")` — its own prop, decoupled from `canEdit`. Enabled per-tab via `deletable:true` in `SHEET_TABLES` — operational tabs only (posts, creators, campaigns, campaign_budget, payments, inbound_reachout_queue, system_errors); **never** user_access (RBAC) or cron-synced shopify_orders/instagram_cache. Grid renders per-row checkboxes + header select-all; the Delete button opens a confirm dialog (≥10 rows requires typing `DELETE`). `deleteSheetRows` snapshots each row's full JSON to `row_deletions` then hard-deletes; FK violations (Postgres `23503`) are caught per-row and surfaced as friendly "still referenced by …" messages (batch never aborts). A toast offers **Undo**; the toolbar **Trash** button (`fetchRecentDeletions`, last 30d) lists deletions with per-row **Restore**. `restoreDeletedRows` re-`upsert`s the snapshot, stripping generated columns (`NON_RESTORABLE_COLUMNS` — campaign_budget's `total_cost`/`est_garment_cost`/`total_with_garments`) and preserving the original PK. Deleting a campaign cascade-removes its budget blocks and nulls `posts.campaign_id` (DB FK rules).

## Errors — Error Portal (`system_errors`)
**Route:** `/errors`. Mirrors legacy `runErrorAudit` + the `logSystemError_` sink. Parallel pulls posts/payments/shopify_orders/unresolved system_errors/creators-count.
- **5 audit rules:** INVALID_POST_ID (HIGH), DUPLICATE_UTR (HIGH), PAYMENT_BEFORE_POSTING (MEDIUM), MISSING_BANK_DETAILS (MEDIUM), MISSING_TRACKING (LOW, order >2 days old).
- **Data health:** stage counts + missing bank/email/tracking/order/postLink + paymentsDue + totalPaidOut + totalCreators.
- **MISSING_COLLAB_EMAIL** worklist: parent + onboarded/posted/delivered + `collab_email_sent_at IS NULL`.
- **Summary:** HIGH/MEDIUM/LOW + apiFails (`system_errors` type ig_fetch/apify_fail) + missingEmail.

## User Panel / Admin Users — Invite, Roles, Audit, CSV
**Routes:** `/admin/users` + `/admin/users/[email]` — both redirect unless `hasPermission(actor,"admin")`.
- **Fetch:** `fetchUserPanelData` reads `user_access` + a 30-day activity sparkline (posts.onboarded_by / payments.logged_by / cell_comments.author_email). KPIs: total/active/admins/accounts/pendingInvites/lastActiveToday. `fetchUserAuditLog` reads `user_audit_log`.
- **Actions** (all `assertPermission("admin")`): **invite flow** (`saveUser` upserts `user_access`; new+active users get a branded **Google-OAuth-only** invite email linking to `/login` — passwordless, no accept token); **audit log** (every mutation writes `user_audit_log`); `deleteUser`/`toggleUserActive`/`recordUserActivity`; **CSV invite** (`bulkInviteUsers` — role-alias map, parallel sends, one `csv_invite_batch` audit).
- **Roles + RBAC:** `roles-actions.ts` CRUD over `access_roles` + `access_role_permissions` (reads `access_role_summary`). `listRoles`/`createRole`/`updateRole` (renames propagate to `user_access.role` + audit each affected user)/`deleteRole` (blocked while users assigned; system roles immutable). Permission model → chapter 08.

---

## Settings — Account, Admin Shortcuts, Workflow Prefs, Test Mode (`/settings`)
**Route:** `/settings` (sidebar System group, admin-gated via `hasPermission(actor,"admin")`; page renders for any actor but the admin controls are isolated). Know More slug `settings`. Ported from Workflow Optimizer's Settings tab, adapted to Saadaa's 4 entities + data-derived IDs.
- **Layout:** Account card (read-only identity from `user_access` — name/email/role/department) + Administration shortcuts (User Panel / Sheet View / Error Portal, each permission-gated). Admin-only below: Workflow Preferences + Test Mode danger zone.
- **Feature dir:** `features/settings/` — `test-scopes.ts` (plain module: 4 scopes + labels + `SCOPE_PREVIEW` + keys), `actions.ts` (`'use server'`), `test-mode-settings.tsx` + `campaign-auto-close-card.tsx` (client). KM content `features/know-more/content/settings.tsx`.

### Campaign auto-close switch
- `getCampaignAutoCloseEnabled()` (default **ON** — only explicit `'false'` disables) / `setCampaignAutoCloseEnabled(bool)` (admin). Stored in `app_settings.campaign_auto_close_enabled` (TEXT `'true'`/`'false'`).
- **Honored in 3 places** (all skip close when OFF = backlog mode): cron `#7` date-based auto-close + cron `#9` completion close (`app/api/cron/notifications/route.ts`), and the real-time completion close in `submitPosting` (`features/posting/actions.ts`).

### Test Mode (danger zone)
- **4 independent scopes** → table: `campaign`→`campaigns`, `creator`→`creators`, `collab`→`posts`, `payment`→`payments`. Each table has `is_test boolean default false` + a partial index.
- **Scope ON** → new rows in that entity are stamped `is_test=true` via `stampTestRows()` (service-client `update`, no-op when off; called from `submitCampaign`, `submitReachOut`, `submitInboundBatch`, `submitOnboarding` (parent+children), repeat-collab via delegation, `submitPayments` (captures inserted ids)). Each entity stamped by **its own** scope.
- **Scope OFF = destructive**: itemised preview (`previewTestEntries`) then archive→delete via `purge_test_rows(p_source_table,p_scope,p_deleted_by)` RPC (SECURITY DEFINER, allowlist 4 tables, archives `to_jsonb(row)` into `test_mode_archive` then `delete where is_test`). Purge runs in **FK-safe order** `PURGE_ORDER = payment→collab→creator→campaign`.
- **No id-counter reset** (unlike WO): Saadaa IDs are derived `max+1` from live data → next id auto-continues after purge. Scope set persisted in `app_settings.test_mode_scopes` (JSON array string, `[]`=off). All actions gate on `assertPermission("system_config")`.

---

## Cross-cutting notes
- **No SQL views/RPCs for analytics** — every fetcher pulls raw rows (`.limit()` 2k–10k) and aggregates in JS; `access_role_summary` is the only DB view used.
- **Parent/child collab rule is pervasive:** payment lives on the representative; `commercial_amount` is equal-split and re-summed across siblings for any display/KPI.
- **Defensive EXTENDED→BASE column fallback** (`42703`) in dashboard, tat, ad-status, order-status fetchers — missing prod columns degrade gracefully.
- **Legacy parity** cited per fetcher header (getDashboardStatsFiltered, getDashboardMetrics, getComplianceKPIs, getBudgetVsActuals, getAccountsHubData/submitPayments, runErrorAudit, getAdStatusData, _isoWeek, _nextPayableCycleDate_).

## Historic Analytics + Creator Analytics (2026-06-25)

**Historic Analytics** — sidebar route `/historic-analytics` (`performance_view`-gated, History icon). Reuses the entire dashboard Overview bento over the `historic_posts_dash` VIEW (= historic_posts + NULL-aliased reels/static_posts/stories/partnership_id/ad_partnership_valid/ads_usage_rights/collab_email_sent_at/collab_email_skipped/ads_status). `fetchDashboardData(filters, tableName)` + `fetchDashboardFilterOptions(tableName)` are parameterized; pass `'historic_posts_dash'`. Caveats: deliverable counts + Ad Winners = 0 (legacy has no structured deliverable split), only 3 stages (Reach Out / On Board / Posted) so later bands are empty by design.

**Creator Analytics** — dashboard tab `?tab=creators` (`features/creator-analytics/`). **SERVER-SIDE PAGINATED (60/page) since 2026-06-26** — no longer fetches the whole base into JS. `fetchCreatorAnalyticsPage(filters, page, pageSize)` calls the `creator_analytics_page(...)` RPC, which filters, follower-desc orders and windowed-slices over a **precomputed cache** + creators join; the client gets 60 mapped `CreatorAnalyticsRow`s + the full filtered `total_count` (identical on every row). **Perf architecture (2026-06-26):** the first cut aggregated posts ∪ historic_posts (11k rows) per request — its 3×-referenced `allposts` CTE was materialized into a catastrophic plan under PostgREST's generic param plan → ~85s → statement-timeout 500 ("Couldn't load the dashboard"). Fixed by a per-creator cache table `creator_analytics_summary` (live/historic collab counts, current_stage, deliverables, collab_types, date ranges) kept fresh by **incremental** statement-level triggers on `posts`/`historic_posts` (`trg_cas_ins_del`/`trg_cas_upd` → `refresh_creator_analytics_summary_for(ids[])`, recompute only changed inf_ids — ~8ms/write; full rebuild via `refresh_creator_analytics_summary()`). The page RPC is now a plan-stable creators→summary join (<120ms any page/filter). Migration `2026_06_26_creator_analytics_summary_fix.sql`. The summary table is RLS-on/no-policy + refresh fns EXECUTE-revoked from anon/authenticated. Page lives in `?cpage` (legacy `?page` accepted); a server-driven Prev/Next pager (`<Link>`s flipping `?cpage`, preserving `tab=creators` + all filters; re-renders the server tab body via the dashboard Suspense keyed on non-tab params) mirrors the Historic Creators picker footer. Any filter change deletes `cpage`/`page` → page 1. The row no longer carries `collabs[]` or a `collab_type_breakdown` map — instead `collab_types: string|null` (RPC-formatted "Barter: 2 · Barter + Paid: 1"). The per-creator collab-history modal loads on demand via the `"use server"` action `loadCreatorCollabHistory` → `fetchCreatorCollabHistory` → `creator_collab_history(p_inf_id)` RPC (logged-in-actor gated), with a loading spinner; header stats come from the row in hand. Counts still exclude reach-out-only/no-order rows (RPC enforces). Filters (search/tier/region/creator_type/stage/reach-out + posted ranges) URL-synced. List = plain 60-row table (mobile card fallback) / Cards = card grid (cards forced ≤768px), shared Avatar, Historic/New chip + stage pill. The old `fetchCreatorAnalytics` + in-JS `applyFilters` and the client `DataTable`-over-all-rows were removed.

**Prior-collab badge** (onboarding board): reach-out rows show a ↻ chip with prior collab count + ids + next C, via RPC `prior_collab_summary(p_inf_ids[])` — next_collab matches `mint_onboarding_block` (incl reach-out-only-historic → C2). See [[project_collab_deliverable_numbering_rule]].

## Partnership Status (2026-07-02)

**Partnership Status** — dashboard tab `?tab=partnerships` (`features/dashboard/partnership-queries.ts` + `partnership-board.tsx`), Know More `partnership-status`. Per-CREATOR rollup of the Meta branded-content permission mirrored on `posts.partnership_status` (+ `partnership_sent_at/_approved_at/_declined_at`, stamped by `lib/partnership-sync.ts`).
- **Lanes:** Requested (pending) / Accepted (approved) / Rejected (rejected+revoked). One card per `inf_id` (state uniform across a creator's rows). Cards: shared `Avatar`, name/@handle, INF ID, followers, `DeactivatedBadge`; sent stamp on every card, approved/declined stamp per lane; **Resend request** button on Rejected (`resendPartnershipForCreator`, `posting_submit`).
- **Live sweep:** on tab mount + the "Refresh statuses" button, every Requested creator is re-checked against Meta (`refreshPartnershipForCreator`, `performance_view`; newest-first, cap 20/sweep, 350ms stagger) — lane moves happen client-side immediately and the server action stamps the DB timestamps.
- **Filters** (URL-synced, above the KPI strip): `q` (INF ID/name/handle), `campaign` (creator has ≥1 post in it), `sentFrom`/`sentTo`. KPI strip = total/requested/accepted/rejected counts.
- `fetchPartnershipBoard` reads posts (partnership_status not null, is_test=false) + one creators `.in(inf_id)` enrichment; buckets/filters/sorts in JS (corpus = creators with requests, small).
- **Creator Analytics** roster also shows the shared `PartnershipBadge` per creator — merged in `fetchCreatorAnalyticsPage` via one batched posts lookup per page (RPC untouched, fail-soft).
- **Gate change (payment/ads):** `partnershipApproved()` in `lib/partnership.ts` (= status approved OR `ad_partnership_valid` admin override) replaced key-presence checks at all gate sites: `submitPayments` §8.2, `autoInitDraftPayment` §8.1, Accounts Hub backfill + `fetchPayableEligiblePosts`, accounts overview modal. `savePartnershipKey` = admin override (key ⇒ `ad_partnership_valid=true`).

## Audit Log (2026-06-29)

Admin-only SYSTEM page `/audit-log` (`admin` perm, ScrollText icon, `features/audit-log/`). UI/layout ported from the DAM (Workflow-Optimizer) Audit Log — source-filter tiles → search → event list — rebuilt with the CreatorHub shell (PageHeader + `.onboarding-stage`) + palette/tokens, **no framer-motion**. `fetchAuditLogData()` merges CreatorHub's existing audit tables newest-first (each capped 500): **Sheet** = `cell_edits` (old→new diff) + `cell_comments` (raised/resolved) + `row_deletions` (delete/restore); **User** = `user_audit_log` (invite/role/deactivate); **System** = `system_errors` (raised/resolved). Read-only — no new schema, no writes. Each `AuditEntry` = {source, at, actor, action, target (`table · key`), detail, tone}. Tone dot: create/resolve green, change amber, delete red, neutral. Tiles filter by source with live counts; search spans actor/action/target/detail. Know More `audit-log`. **When the Approvals page ships, add an `Approval` source over `approval_logs` to `queries.ts`.** This is phase 1 of the 3-page DAM tab port (Audit Log → Issue Desk → Approvals).

## Issue Desk (2026-06-29)

SYSTEM page `/issue-desk` (open to all authenticated, LifeBuoy icon, `features/issue-desk/`). UI ported from the DAM Issue Desk — KPI strip → 2-col Raise-a-Ticket + Resolution Queue (status tabs, expandable rows, admin controls) — CreatorHub shell + palette. New table **`support_tickets`** (`id` identity → `ticket_no` GENERATED `TKT-{id}`; category/priority/status CHECKs; requester + admin fields; RLS-on, anon/auth revoked; `updated_at` touch trigger; migration `2026_06_29_support_tickets.sql`). `fetchSupportTicketDesk()` — admins see all, others see only their own (`requester_email`); counts drive the KPIs. Actions: `createSupportTicket` (any `requireActor`; validates len; stamps requester from actor), `updateSupportTicket` (`assertPermission("admin")`; sets status + admin_note + resolution + resolved_at/closed_at), `searchTicketReferences` (autocomplete over campaigns / creators / posts.collab_id for the optional **linked record**). Status flow open→in_progress→resolved→closed. Know More `issue-desk`. Email notifications deferred. Phase 2 of the DAM tab port.

## Approvals — campaign sign-off gate (2026-06-29)

Admin-only SYSTEM page `/approvals` (`admin`, ShieldCheck, `features/approvals/`). UI ported from the DAM Approvals (KPI tiles + Approve/Reject cards), CreatorHub shell/palette. **Gates new campaigns:** `submitCampaign` now stamps status **`Pending Approval`** (alongside `created_by`) instead of going live; an admin approves (→ `Active`) or rejects (→ `Rejected`) here. Actions `approveCampaign`/`rejectCampaign` in `features/campaigns/actions.ts` (`assertPermission("admin")`, atomic `.ilike("status","pending%")` guard) write the new **`approval_logs`** table (migration `2026_06_29_approval_logs.sql`; RLS-on). **Consumers updated so pending/rejected stay hidden:** reach-out picker (`fetchCampaignsForSelect` → `ilike status active`), onboarding `listOpenCampaigns` (active only), reach-out submit guards (outbound `actions.ts` + inbound `inbound-actions.ts` reject non-active), cron auto-close (`ilike status active`). Pre-existing/reopened campaigns stay `Active` — only NEW ones route through approval. The **Audit Log** gained an `Approval` source over `approval_logs`. Know More `approvals`. Phase 3 of the DAM tab port (Audit Log → Issue Desk → Approvals — all shipped).
