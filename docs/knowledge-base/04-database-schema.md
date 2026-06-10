# 04 · Database Schema (Supabase / Postgres)

> Part of the CreatorHub KB. Last verified 2026-06-07. Canonical catalog derived from the migrations in `supabase/migrations/`, the hand-maintained `apps/web/lib/supabase/types.gen.ts`, and `CreatorHub-Supabase-Schema-Map.txt`. Supabase project `xynyvbagcudjrzklwnqp`.

> **Base-table caveat.** The repo `supabase/migrations/` folder contains only `ALTER`/RPC/cron migrations dated 2026-05-16 onward. The original `CREATE TABLE` DDL (`001_create_tables.sql`, etc.) lived in the legacy GAS tree and is not in this repo. Base columns are reconstructed from the schema map (2026-05-17) and `types.gen.ts`; columns added/changed after that date are cited to their exact migration filename.

> **Model-version warning (read first).** Two migrations on **2026-06-06** fundamentally changed the data model away from what `types.gen.ts` and the 2026-05-17 schema map describe:
> - **Collab ID restructure** (`2026_06_06_collab_id_restructure.sql`) **abandoned the parent/child deliverable model.** `post_id` is now the SHORT deliverable id (`SIF-1-P1`, no `-C` suffix); a new `collab_id` (`SIF-1-C1`) groups all deliverable rows of one collaboration. `deliverable_index` parent/child is **legacy**.
> - **Partial payments** (`2026_06_06_partial_payments.sql`) replaced `UNIQUE(post_id)` on `payments` with `UNIQUE(post_id, utr)` and added a `Partial` status. "One payment row per post" no longer holds.
>
> `types.gen.ts` was **regenerated against the live DB on 2026-06-07** — the full generated `Database` (all 14 tables + 3 views + functions) with hand-kept union aliases (`WorkflowStatus`, `PaymentStatus`, …) + convenience `Row` interfaces layered on top (the DB models enums as TEXT+CHECK, so the raw generator returns those columns as `string`). It now matches the live schema; regenerate with `npm run db:types`.

---

## Table: `posts`

The spine of the system. One row per **deliverable** (reel or static post). Every reach-out, collab, order, posting, and payment-mirror state hangs off this table.

| Column | Type | Null | Default | Notes / Migration |
|---|---|---|---|---|
| `id` | uuid | no | gen | PK |
| `post_id` | text | no | — | **UNIQUE.** Since 2026-06-06 = SHORT deliverable id (`SIF-N-PN`), no `-C` suffix |
| `post_id_short` | text | yes | — | `inf_id-P{post_number}` |
| `post_number` | int | yes | — | **GLOBAL** linear counter (max+1 across ALL posts) |
| `collab_number` | int | yes | 1 | Per-creator collab episode counter; CHECK `>= 1` |
| `collab_id` | text | yes | — | `inf_id-C{collab_number}` (e.g. `SIF-1-C1`). Groups all deliverables of one collab |
| `deliverable_index` | int | yes | — | **LEGACY** parent/child ordinal (1 = parent). Superseded by `collab_id` |
| `deliverable_type` | text | yes | — | CHECK `in ('reel','post')` or NULL |
| `inf_id` | text | yes | — | FK → `creators.inf_id` (**RESTRICT**) |
| `campaign_id` | text | yes | — | FK → `campaigns.campaign_id` **ON DELETE SET NULL** |
| `workflow_status` | text | no | — | CHECK `posts_workflow_status_check` (see Enums) |
| `reach_out_date` | date | yes | — | `current_date` on insert |
| `reachout_type` | text | yes | — | |
| `reachout_direction` | text | yes | `'outbound'` | CHECK `in ('inbound','outbound')` |
| `onboard_date` | date | yes | — | |
| `onboarded_by` | text | yes | — | actor who **last handled** the row: reach-out logger at reach-out, then **overwritten** with the onboarder at onboarding. Posting's "Onboarded by" filter uses this (rows there are already onboarded). |
| `logged_by` | text | yes | — | **reach-out logger** (actor), written by `submit_reachout`, **never overwritten** (added 2026-06-10, migration `add_logged_by_reachout_logger`). Powers Onboarding's "Reached out by" filter. |
| `posting_dispatch_date` | date | yes | — | day garment dispatched; drives §5.5 follow-up |
| `collab_type` | text | yes | — | `Barter` \| `Barter + Paid` |
| `commercial_amount` | numeric | yes | — | forced to 0 when `collab_type='Barter'`; equal-split per deliverable |
| `creator_brief_link` | text | yes | — | auto-attached from `campaigns.brief_link` |
| `order_id` / `shopify_order_id` | text | yes | — | |
| `garments` / `garment_qty` | text / int | yes | — | |
| `tracking_id` / `order_status` / `delivery_date` / `est_delivery` / `order_placed_date` | | yes | — | order tracking |
| `reels` / `static_posts` / `stories` | int | yes | 0 | deliverable counts; **stories counted but never spawn a child row** |
| `ads_usage_rights` | text | yes | — | free-text durations (e.g. "11 Months"); "has rights" = truthiness, never `=='Yes'` |
| `post_date` / `post_link` / `download_link` / `duration_days` | | yes | — | posting |
| `raw_dump` / `partnership_id` | text | yes | — | `2026_05_17_posts_raw_dump_partnership_id.sql` |
| `ad_partnership_valid` | boolean | yes | false | gates Done transition when ads rights granted |
| `content_name` / `content_type` | text | yes | — | |
| `ads_status` / `ads_results` | text | yes | — | Winner \| ITE \| Discarded \| Pending |
| `collab_email_sent_at` | timestamptz | yes | — | |
| `collab_email_skipped` | boolean | yes | false | "intentionally no email" |
| `content_reminder_sent_at` / `posting_pending_sent_at` / `onboarding_pending_sent_at` | timestamptz | yes | — | Wave7 cron idempotency flags |
| `bank_name` / `bank_number` / `ifsc` | text | yes | — | denorm snapshot at onboard |
| `username` / `email` / `agency_name` / `nomenclature` / `notes` / `remarks` | text | yes | — | |
| `utr` / `payment_date` | | yes | — | payment mirror |
| `payment_status` | text | yes | — | plain text, **no CHECK**; mirrors payments status (`Not Due`/`Due`/`Partial`/`Done`) |
| `created_at` / `updated_at` | timestamptz | no | now() | |

**Dropped columns** (`2026_05_27_drop_unused_post_cols.sql`): `commercial_reel_rate`, `commercial_post_rate`, `commercial_story_rate`, `collab_message`, `match_status`.

**Constraints:** `post_id` UNIQUE; `posts_reachout_direction_chk`; `posts_collab_number_chk (>=1)`; `posts_deliverable_type_chk`; `posts_workflow_status_check`; FK `posts_campaign_id_fkey` (SET NULL); FK `inf_id` → creators (RESTRICT).
**Indexes:** `post_id` UNIQUE, `inf_id`, `campaign_id`, `workflow_status`, `payment_status`, `order_status`, `reach_out_date DESC`, `(campaign_id, workflow_status)`, `(workflow_status, updated_at DESC)`, `(inf_id, collab_number)`, `reachout_direction`, `idx_posts_collab_id`, plus several partial indexes.

---

## Table: `creators`

Per-influencer profile, bank details, IG metrics. One row per creator, keyed by `inf_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `inf_id` | text | **UNIQUE.** Legacy default `INF-NNN` from `inf_id_seq`; `submit_reachout` RPC generates `SIF-{N}` via MAX numeric suffix +1 |
| `username` | text | **UNIQUE** (lowercased soft-key) |
| `inf_name` / `instagram_url` / `instagram_link` | text | |
| `followers` | int | |
| `gender` / `verification` | text | |
| `category` | text | **GENERATED STORED** from `followers`: Nano `<10K` \| Micro `<50K` \| Mid tier `<300K` \| Macro `<1M` \| Mega `>=1M` |
| `content_type` / `email` / `contact` / `address` / `agency_name` / `state` / `language` | text | |
| `er_percent` / `er` / `avg_likes` | numeric | |
| `profile_pic` | text | avatar URL (synced from `avatars` storage bucket via trigger) |
| `bank_name` / `bank_number` / `ifsc` | text | |
| `ig_data` | jsonb | |
| `ig_status` | text | `auto` \| `private` \| `not_found` \| `manual` |
| `ig_fetched_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

**Constraints/Indexes:** `inf_id` UNIQUE, `username` UNIQUE, `category` index.

---

## Table: `campaigns`

Campaign master. One row per campaign, id `IFC{NNN}`.

| Column | Type | Notes / Migration |
|---|---|---|
| `id` | uuid | PK |
| `campaign_id` | text | **UNIQUE.** `IFC{NNN}` zero-padded to 3. Generated by `submit_campaign` RPC |
| `campaign_num` | int | **UNIQUE.** Drives `IFC{NNN}` via MAX+1 |
| `name` / `campaign_name` / `month` | text | |
| `brief_pdf_url` / `brief_link` / `internal_brief_link` | text | `brief_link` auto-attached to posts at reach-out |
| `key_message` | text | required by `submit_campaign` |
| `start_date` / `end_date` | date | **both required** at create + edit (`2026_05_20_campaign_dates.sql`; required enforced app-side 2026-06-07) |
| `no_of_creators` | text/int | stored as text by RPC |
| `total_budget` | numeric | Σ(comp) + garment cost, computed by RPC |
| `status` | text | `active`/`Active` \| `Closed`/`Completed` \| `Paused` \| `Draft` (RPC writes lowercase `active`) |
| `created_by` | text | actor email |
| `auto_closed_at` | timestamptz | set on reopen to block daily cron re-close |
| `ending_alert_sent` | boolean | Wave7 cron idempotency |
| `created_at` / `updated_at` | timestamptz | |

**Dropped:** `name_identifier`, `brand`, `description`, `budget`, `budget_json`.

---

## Table: `campaign_budget`

Per-tier normalized budget lines. Many rows per campaign, grouped by `month_label`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | PK |
| `campaign_id` | text | FK → `campaigns.campaign_id` **ON DELETE CASCADE** |
| `month_label` | text | e.g. `'May 2026'` |
| `tier` | text | e.g. `'Nano (1K to 10K)'` |
| `collab_type` | text | `Barter` \| `Paid` |
| `campaign_name` | text | segment label |
| `num_influencers` | int | default 0 — **sum of these = the campaign creator cap** |
| `avg_comp` | numeric(12,2) | default 0 (0 for Barter) |
| `total_cost` | numeric(14,2) | **GENERATED** `num_influencers * avg_comp` |
| `min_garments` / `max_garments` | int | default 2 / 3 |
| `est_garment_cost` | numeric(12,2) | **GENERATED** `max_garments * 900 * 0.6` |
| `total_with_garments` | numeric(14,2) | **GENERATED** `(num*avg_comp) + (max*900*0.6*num)` |
| `created_at` | timestamptz | |

The 3 GENERATED columns cannot be inserted explicitly — `submit_campaign` inserts only raw inputs.

---

## Table: `payments`

Payment ledger / state machine. **Post-2026-06-06: one DRAFT row per collab + N installment rows** (each a distinct UTR).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `post_id` | text | FK → `posts.post_id` (RESTRICT) |
| `collab_id` | text | `inf_id-C{n}`; payment covers a whole collab |
| `inf_id` / `username` / `collab_number` / `deliverable_index` | | mirror of posts |
| `utr` | text | bank txn ref; part of UNIQUE(post_id,utr) |
| `amount` | numeric | installment amount |
| `payment_date` | date | |
| `bank_name` / `bank_number` / `ifsc` / `logged_by` | text | |
| `status` | text | default `'Not Due'`; CHECK `payments_status_chk`: `Not Due`\|`Due`\|`Partial`\|`Done` (or NULL) |
| `due_date` | date | `post_date + PAYMENT_DUE_DAYS(30)` |
| `estimated_payable_date` | date | next 15th/30th `>= due_date` |
| `payment_advice_sent` | boolean | |
| `deliverable_post_id` | text | FK → `posts.post_id` **ON DELETE SET NULL** |
| `posted_but_not_tested` | boolean | default false — ad-eligible-but-untested annotation |
| `eligibility_email_sent` / `sla_breach_alert_sent` | boolean | Wave7 cron flags |
| `created_at` | timestamptz | |

**Dropped:** `payment_id`, `payment_mode`.
**Constraints:** `payments_status_chk`; UNIQUE(post_id) **dropped** → replaced by `payments_post_utr_unique` UNIQUE(post_id, utr); FKs RESTRICT + SET NULL. NULL-utr drafts are not DB-deduped (app guarantees ≤1 draft/post_id).

---

## Table: `shopify_orders`

Shopify Admin API order mirror, upserted by the 3-hr `sync-shopify-orders` Edge Function.

| Column | Type | Notes |
|---|---|---|
| `order_id` | text | **PK** (upsert conflict key) |
| `email` / `phone` / `tracking_id` / `tracking_status` / `address` | text | |
| `delivery_date` / `order_date` / `order_placed_date` | date | `order_date` = dispatch date |
| `garments` | text | |
| `synced_at` | timestamptz | |
| `subtotal_price` / `total_price` / `discount_total` / `refund_amount` | numeric(12,2) | |
| `discount_codes` / `tags` / `line_skus` | text (csv) | `tags` carries the `inf` influencer marker |
| `note` / `financial_status` / `cancel_reason` / `refund_reason` | text | |
| `customer_order_count` | int | |
| `cancelled_at` / `refunded_at` | timestamptz | |
| `fulfillment_events` | jsonb | full status audit trail |

**Indexes:** GIN on `to_tsvector(tags)`, `discount_codes` (partial), `cancelled_at` (partial), `order_date DESC`.

---

## Table: `instagram_cache`

Apify profile cache + scrape retry queue. Keyed by `username`.

| Column | Type | Notes |
|---|---|---|
| `username` | text | **PK** |
| `profile_data` | jsonb | |
| `fetched_at` / `scraped_at` | timestamptz | first-scrape time |
| `status` | text | default `'auto'`; `auto`(data) \| `pending`(queued) \| `not_found`(retries exhausted) \| `private` |
| `attempts` | int | default 0; Apify retry counter, reset on success |
| `updated_at` | timestamptz | last successful refresh |

**Indexes:** `fetched_at`; `instagram_cache_pending_idx (username) where status='pending'`.

---

## Other tables (summary)

| Table | Purpose | Notable |
|---|---|---|
| `user_access` | Auth + role roster | `email` UNIQUE (the FK target across the schema); `role` matches `access_roles.name`; `active` gate; activity timestamps; `employee_id`/`department` |
| `access_roles` | DB-driven custom roles | `name` UNIQUE; `is_system`; `color`; trigger `trg_access_roles_updated_at`; RLS service-only. Seeded: Global Admin, User, Accounts Team (system) + Offboarding Manager (custom) |
| `access_role_permissions` | Per-role scope grants | PK `(role_id, scope)`; FK CASCADE; scopes = the PermissionKey union; RLS service-only |
| `system_errors` | Generic Error Portal sink | `type`/`key`/`message`/`source`/`resolved`; partial-UNIQUE dedupe `(type, key, source) where not resolved`; SELECT to authenticated |
| `cell_comments` | Sheet View comment threads + @-mentions | FK to `user_access.email`; GIN on `mentions`; trigger updated_at; RLS service-only |
| `cell_edits` | Sheet View single-cell audit ("edited" badge + revised-details email) | IDENTITY PK; old/new value; RLS enabled, **no policy** (service-only, PII) |
| `row_deletions` | Sheet View row-delete restore log | IDENTITY PK; `sheet_key`/`table_name`/`row_pk`/`pk_column`; full `row_data` jsonb snapshot; `deleted_by`/`deleted_at` + `restored_by`/`restored_at`; RLS enabled, **no policy** (service-only). Written by `deleteSheetRows`, read/restored by `restoreDeletedRows` |
| `email_logs` | Outbound-email sink (collab + notification matrix) | `email_type` matches `NOTIFICATION_TYPES`; RLS enabled, **no policy** (service-only, PII) |
| `user_audit_log` | Append-only User Panel activity feed | `action` CHECK `in (invite,edit,role_change,activate,deactivate,delete,login,csv_invite_batch)`; before/after jsonb |

## Views

| View | Purpose |
|---|---|
| `inbound_reachout_queue` | Inbound posts in `Reach Out` stage joined to creators (`reachout_direction='inbound' AND workflow_status='Reach Out'`). Columns: `post_id, inf_id, username, campaign_id, content_type, reach_out_date, collab_type, commercial_amount, creator_brief_link, inf_name, followers` — **no `id`/`created_at`** (its Sheet View tab must sort on `reach_out_date` + key on `post_id`, and is NOT deletable since it's a view). |
| `campaign_budget_monthly` | Per-month roll-up of `campaign_budget` |
| `access_role_summary` | Roles + `granted_count` + `user_count` rollup |

## Sequences

`inf_id_seq` (legacy `INF-NNN`, superseded by `SIF-{N}` MAX+1 in RPC), `campaign_id_seq` (superseded by `campaign_num` MAX+1), `cell_comments_id_seq`, `user_audit_log_id_seq`.

---

## Enums / Allowed-Value Sets

All "enums" are **TEXT columns guarded by CHECK constraints**, not Postgres `ENUM` types.

- **`posts.workflow_status`** (`posts_workflow_status_check`): `Reach Out`, `On Board`, `Posted`, `Delivered`, `RTO`, `Cancelled`, `Cancelled After RTO`, `Offboarding`/`Offboarded`, plus legacy values. *(The 2026-06-07 work added `Offboarded`; `types.gen.ts` also lists aspirational values like `Order Sent`/`Awaiting Reply`/`Declined` — verify against the live CHECK before relying on them.)*
- **`posts.reachout_direction`**: `inbound` \| `outbound` (default `outbound`). Drives the dashboard channel split.
- **`posts.deliverable_type`**: `reel` \| `post` (or NULL). Stories deliberately excluded.
- **`posts.collab_type`** (app-enforced): `Barter` \| `Barter + Paid`. Barter ⇒ `commercial_amount=0`.
- **`posts.ads_status` / `ads_results`**: `Winner` \| `ITE` \| `Discarded` \| `Pending` (+`Discarded but analyse`). Rules: Winner = impressions≥50K & ROAS≥3.0; ITE = ≥50K & ROAS<3.0; Discarded = <50K.
- **`payments.status`** (`payments_status_chk`): `Not Due` \| `Due` \| `Partial` \| `Done`.
- **`creators.category`** (GENERATED): `Nano` \| `Micro` \| `Mid tier` \| `Macro` \| `Mega`.
- **`access_roles.name` / `user_access.role`**: `Global Admin`, `User`, `Accounts Team`, `Campaign Owner` (+ custom `Offboarding Manager`).
- **`user_audit_log.action`**: `invite`, `edit`, `role_change`, `activate`, `deactivate`, `delete`, `login`, `csv_invite_batch`.

---

## RPC / PL-pgSQL Functions

| Function | Args | Returns | Behavior |
|---|---|---|---|
| `submit_reachout` | 20 params (username, inf_name, instagram_link, followers, gender, state, email, campaign_id, content_type, content_name, reachout_type, reachout_direction, reels, static_posts, stories, ads_usage_rights, collab_type, commercial_amount, raw_dump, logged_by_email) | `post_id, post_id_short, post_number, collab_number, inf_id, collab_id` | Atomic reach-out. Advisory locks on `reachout-user:<username>` + `reachout-inf:<inf_id>`. Upserts `creators` by username (generates `SIF-{MAX+1}` if new). `post_number` = global MAX+1; `collab_number` = per-inf_id MAX+1. **post_id = SHORT id; collab_id = inf_id-C{n}.** Auto-attaches `brief_link`. Barter ⇒ amount 0. Inserts `Reach Out` post. (`2026_06_06_submit_reachout_collab_id.sql`) |
| `submit_campaign` | `p_form jsonb, p_budget_rows jsonb, p_month_label text` | `campaign_id, campaign_num, total_budget` | Atomic campaign. Validates name/key_message/brief_link/dates/≥1 row. Advisory lock `submit_campaign:counter`. `campaign_num` = MAX+1, `campaign_id = 'IFC'||lpad(num,3,'0')`. `total_budget` = Σ(num×avg_comp) + Σ(num×max_garments×900×0.6). Inserts campaign (`active`) + N budget rows (raw inputs only). (`2026_05_20_submit_campaign_rpc.sql`) |
| `touch_access_roles_updated_at` / `touch_cell_comments_updated_at` | trigger | trigger | set `updated_at = now()` |

## Triggers

| Trigger | Table | Function |
|---|---|---|
| `trg_access_roles_updated_at` | `access_roles` | `touch_access_roles_updated_at()` |
| `trg_cell_comments_updated_at` | `cell_comments` | `touch_cell_comments_updated_at()` |
| `trg_sync_creator_avatar` | storage→creators | avatar mirror (applied live, DDL not in repo) |

## pg_cron Jobs

Extensions: `pg_cron`, `pg_net`, `supabase_vault`. Bearer JWT read at fire-time from `vault.decrypted_secrets` where `name='supabase_service_role_key'`.

| Job | Schedule | Effect |
|---|---|---|
| `scrape-pending-apify-3h` | `15 */3 * * *` | POST → `scrape-pending-apify` (drains `instagram_cache.status='pending'`) |
| `sync-shopify-orders-3h` | `30 */3 * * *` | POST → `sync-shopify-orders` (upserts `inf`-tagged orders) |

> **Deferred crons:** the Wave-7 time-based notification flags exist (`2026_06_06_notification_flags.sql`) and are driven by `app/api/cron/notifications/route.ts` (Vercel cron, daily 04:00 UTC) — no extra pg_cron schedule is checked in.

## RLS Notes

- Base tables use the **service-role key** everywhere server-side (bypasses RLS).
- RLS-enabled + service_role-only policy: `access_roles`, `access_role_permissions`, `cell_comments`, `user_audit_log`.
- RLS-enabled + NO policy (hard lock, PII): `cell_edits`, `email_logs`, `row_deletions`.
- `system_errors`: SELECT to `authenticated`, full DML to `service_role`.

## Domain facts (verified)

- **`inf_id`** = `SIF-N` (RPC, MAX+1). **`post_number`** is global. **`collab_number`** is per-creator. **`collab_id` = `inf_id-C{collab_number}`**; **`post_id` = short `inf_id-P{post_number}`** (no `-C`). **`campaign_id` = `IFC{NNN}`**.
- **Deliverable model:** total = `reels + static_posts`. **Stories count as deliverables but never spawn a child row** (`deliverable_type` CHECK only allows `reel`/`post`).
- **Parent/child (`deliverable_index`)** is legacy — the 2026-06-06 Collab ID restructure replaced grouping with `collab_id`; payment is raised per `collab_id`.
