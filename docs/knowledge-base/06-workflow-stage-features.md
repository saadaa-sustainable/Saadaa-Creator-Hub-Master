# 06 · Workflow-Stage Features

> Part of the CreatorHub KB. Last verified 2026-07-10. The six pipeline stages. Code is authoritative; cited `file:line` are relative to `apps/web`.

The shared state machine (`workflow_status` on `posts`):

```
Reach Out → On Board → (Order Sent) → Posted → Delivered → RTO / Cancelled

Creator-level terminal state: Blacklisted / Offboarded
```

## Cross-cutting conventions

- **Data source:** Supabase only (every Sheet mirror removed 2026-05-21). All server reads use `createServiceClient()` (RLS bypass) gated by page-level `assertPermission`.
- **ID/collab model (post-2026-06-06):** `post_id` = short id `{inf_id}-P{post_number}` (no `-C`). `collab_id` = `{inf_id}-C{collab_number}`, groups all deliverable rows of one collab. `post_number` is **per-creator** linear (P linear per creator across collabs, 2026-06-24); `collab_number` increments per `inf_id` (C1 at Reach Out for NEW creators; C2+ created at Onboarding for repeat collabs).
- **Collab grouping key** (`onboarding/columns.tsx`): prefer `collab_id`, fall back `inf_id-C{collab_number}`, then `post_id`. The board renders ONE representative row per collab (lowest `post_id`).
- **Barter = ₹0 rule** enforced everywhere: reach-out RPC forces `commercial_amount=0` for Barter; onboarding `applyBarterLock`; inbound `applyInboundBarterLock`; campaign-budget Barter rows lock avg comp to 0.
- **Layout:** every stage uses `PageHeader` + `.onboarding-stage` wrapper, **filter bar ABOVE the KPI strip**, then board/table; `knowMore` slug wired into PageHeader. Mobile forces Cards view.

---

## 1. Reach Out (`features/reach-out/`)

### Purpose & routes

Creates the first `posts` record per collab (`workflow_status='Reach Out'`). Two flows:

- **Outbound** — `/reach-out/outbound`, perm `reachout_outbound`, "We initiate". Single-creator form with live IG lookup.
- **Inbound** — `/reach-out/inbound`, perm `reachout_inbound`, "They reached us". Bulk roster table + XLSX/CSV import.

### Server actions + RBAC gates

| Action                                        | Gate                                                             | Notes                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `submitReachOut`                              | `reachout_inbound` if direction inbound else `reachout_outbound` | Single submit                                                                                         |
| `submitInboundBatch`                          | `reachout_inbound`                                               | Per-row `submit_reachout`; failures isolated                                                          |
| `editReachOut`                                | `reachout_outbound`                                              | D7 — only `contentType`/`contentName` editable; creator metadata FROZEN once stage leaves "Reach Out" |
| `lookupCreator` / `lookupCreatorsFromDataset` | `reachout_outbound`\|`reachout_inbound`                          | Cache-first IG lookup                                                                                 |

### submit_reachout RPC

`security invoker`, granted to `service_role`. Concurrency via `pg_advisory_xact_lock` on `reachout-user:<username>` (pre-upsert) AND `reachout-inf:<inf_id>` (post-upsert) — prevents duplicate creators + serializes ID assignment (replaces legacy `LockService`). Generates `SIF-N` for new creators; `post_number = MAX+1` **per inf_id** (per-creator P, 2026-06-24); `collab_number = MAX+1` per inf_id; `post_id = post_id_short = {inf_id}-P{post_number}`; `collab_id = {inf_id}-C{collab_number}`. Auto-attaches `creator_brief_link` from `campaigns.brief_link`. **Existing creators are reused (2026-07-08):** the RPC looks up by username and, when found, updates that creator row and inserts a new reach-out post under the SAME SIF — no new creator, no new SIF. (Superseded the 2026-06-24 "new-creators-only" rule; see eligibility below.)

### Key business rules

- **Content type** (UI label "Content Type"; field key `contentCode`): 10 hard-coded codes in `content-codes.ts` (UGC, VRP, OFF, BST, EDU, PRC, TBG, MAR, OST, FOU). _(Relabeled from "Content Code" 2026-06-07.)_
- **Reach-out eligibility (2026-07-10, `guards.ts › checkReachoutAllowed`, shared outbound + inbound):** creator blacklist is checked first and is permanently terminal. Otherwise an existing creator can be re-reached subject to (1) **Cooldown** — one active reach-out per creator per rolling **30 days** across all campaigns (`REACHOUT_COOLDOWN_DAYS`); and (2) **Per-campaign** — never a second active reach-out for the same campaign. Cancelled/legacy-voided collabs are ignored by those two cooldown rules, but they never override a creator blacklist. Inbound checks per row sequentially. The lookup also returns a red Offboarded result before spending a Meta call for a known blocked handle.
- **Live refresh on re-reach:** `lookupCreator` no longer short-circuits an existing creator — it runs the live Meta business_discovery fetch and `refreshExistingCreator()` overlays fresh followers/ER/avg-likes/avatar/tier/name/verified onto the stored identity and writes them to the `creators` row **in place** (same `inf_id`, same `profile_id` — only backfilled when missing; never a new SIF). On Meta cooldown/failure the stored row is returned untouched. Outbound form: submit unblocked (button "Re-Reach Out"), badge "Existing · Refreshed".
- **Closed-campaign block:** if `campaigns.status` lowercased = `'closed'`, the whole submit/batch is rejected ("Reopen it — Campaign Owner / Global Admin").
- **Creator cap = ONBOARDING cap (2026-06-10):** reach-out is unlimited per campaign; the cap is enforced at onboarding. cap = Σ `campaign_budget.num_influencers`. "Used" = distinct creators with an onboarded-active post (`On Board`, `Order Sent`, `Posted`, or `Delivered`). `cap=0` means no cap. The creator-level blacklist is checked before this cap calculation and Shopify work, so an offboarded creator cannot use onboarding as a re-entry path.
- After submit: enqueues IG scrape (`instagram_cache` upsert, insert-only), fires `notifyActorConfirmation` (REACHOUT/INBOUND_CONFIRMATION — one summary email per batch) via `after()`, revalidates tags + routes.

### IG lookup (`lookupCreator`)

Cache-first 3-tier: (1) `creators` row → identity locked, metrics editable; (2) `instagram_cache` with meaningful non-pending data; (3) else upsert pending row → `source:'queued'` (3-hr cron fills it).

**Fresh-cache tier + Meta quota model (2026-07-14):** Meta's app-level quota is ~200 calls/hr and batch sub-requests count INDIVIDUALLY (Graph API batch docs: "each call within the batch is counted separately for … API call limits") — batching never stretches the budget; caching does. Both `lookupCreator` and `lookupCreatorsBatch` serve any handle whose `instagram_cache.status='meta'` row is < 6h old (`FRESH_FETCH_TTL_MS`) at zero quota — full node incl. `inf_name` (column added 2026-07-14) + `is_verified` — and this works mid-cooldown. Bulk Meta batches contain cache-misses only. Cache-served hits are NEVER re-persisted (upsert would fake-refresh `scraped_at`). A Meta-reported `rate_limited` error slams the gate to the 300s high-usage cooldown via `recordMetaUsage(0, 100)`. Inbound form applies `source:"meta"` hits even when `fetched===0` (cache serves during cooldown; previously discarded). **Usage-driven ladder (5fd3b7c):** a filled 50-call window pauses only when effective X-App-Usage is warm — <60% no pause (reset only), 60–75% → 60s, ≥75% → 300s; the header pill shows `Meta {count}/50 · {usage}%` and refreshes instantly on the `ch:meta-fetch` window event.

### Inbound XLSX bulk import

- Roster table, manual cap **10** (`INBOUND_MANUAL_CAP`). Per-row required: `instagramLink`, `gender`, `contentCode`. **Collab Type + Commercials removed from inbound (2026-06-10)** — `submitInboundRoster` passes `p_collab_type: null` + `p_commercial_amount: 0`, so inbound reach-outs leave `collab_type` **unset** (NOT auto-Barter) and commercial 0; both are set later in Onboarding (same as outbound). Leaving collab_type null keeps inbound out of the Funnel's Barter bucket (`statusKey(collab_type)==="barter"`) until a type is chosen. UI columns + per-row validation dropped.
- **Template** (`downloadTemplate`): 3-sheet workbook (Inbound Reach Out, Content Types, dropdown data validations injected by patching sheet XML). Headers: `instaLink, gender, contentCode` (collabType + commercials columns + the collab-type data-validation removed 2026-06-10).
- **Import:** parses XLSX/CSV, header-alias-tolerant (`rosterValue` accepts old "Content Code" header too), caps 200 rows, batch-prefills via lookups. Succeeded rows stripped on submit; failed rows kept for fix-and-retry.

---

## 2. Campaigns (`features/campaigns/`)

### Purpose & routes

Creates `campaigns` (`IFC{NNN}`) + `campaign_budget` rows that gate downstream Reach Out and define the creator cap. Routes `/campaigns` (list) and `/campaigns/new`.

### RBAC

`/campaigns` viewable by anyone with `reachout_outbound`. `canManage` = `campaign_create || campaign_edit` — controls Edit/Close/Reopen affordances + the New Campaign link.

### Server actions + RBAC gates

| Action                      | Gate              | Notes                                                                                                                                                      |
| --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitCampaign`            | `campaign_create` | RPC `submit_campaign`; stamps `created_by=actor.email`                                                                                                     |
| `editCampaign`              | `campaign_edit`   | UPDATE campaign + delete-then-insert budget rows                                                                                                           |
| `fetchCampaignForEdit`      | `campaign_edit`   | Prefill loader                                                                                                                                             |
| `closeCampaign`             | `campaign_edit`   | sets `status='Closed'`                                                                                                                                     |
| `reopenCampaign`            | `campaign_edit`   | sets `status='Active'` + stamps `auto_closed_at` so daily cron won't re-close                                                                              |
| `bulkAssignPostsToCampaign` | `campaign_edit`   | bulk-set `campaign_id` on unassigned reach-outs; only moves rows where `campaign_id IS NULL` (never reassigns); target must be live (not Pending/Rejected) |

### Validation & budget rows

- **Required:** `campaignName`, `keyMessage`, **`startDate`** and **`endDate`** (both `min(1)` required — 2026-06-07, red `*` + inline errors), `briefLink` (valid URL). `superRefine`: allocated > 0; allocated ≤ numCreators cap; `endDate >= startDate`.
- **Budget row:** tier (5 `INFLUENCER_TIERS`), collabType ∈ `["Barter","Paid"]`, numInfluencers, avgComp (locked 0 for Barter), minGarments fixed **2**, maxGarments (default 3). Garment formula `maxGarments × 900 × 0.6`. Form auto-seeds 2 rows (Barter + Paid) on first `numCreators` entry; edit mode suppresses auto-seed.
- **Creator cap** = Σ `num_influencers`; "used" = distinct active creators. Surfaced as `creators_used / creator_cap` on cards + the reach-out pill.

### Lifecycle + edge cases

- **Auto-close — two triggers** (both stamp `auto_closed_at`, one-shot; reopen also stamps it to prevent re-close):
  1. **End date** — daily cron (check #7) flips `status='Closed'` once `end_date < today`.
  2. **Allocation posted (2026-06-10)** — `closeCampaignIfComplete` (`lib/campaign-lifecycle.ts`): closes when distinct creators with a **Posted/Delivered** collab reach the creator cap (Σ `num_influencers`, cap>0). Cancelled/voided collabs ignored. Fires in **real time** from `submitPosting` (via `after()`, on the campaign of the just-posted deliverable) and as a **daily cron backstop** (check #9 sweeps open campaigns). Skips already-Closed or reopened (`auto_closed_at` set) campaigns. If the cap is never filled, only the end-date trigger applies.
- Manual `closeCampaign`/`reopenCampaign` (Campaign Owner / Global Admin).
- **On close, un-onboarded reach-outs are voided** — `voidUnonboardedForCampaign` (`lib/campaign-lifecycle.ts`) flips every non-onboarded, non-terminal reach-out on the campaign to `Cancelled`. Wired into all three close paths (end-date cron #7, completion close, manual `closeCampaign`). Data is kept (Cancelled rows stay in Sheet View + per-campaign dashboard metrics). Since the onboard cap counts only onboarded-active creators, leftovers stay live as backups until close (so a freed slot from an offboard can still onboard one).
- **D8:** editing avg_comp/num_influencers does NOT retroactively rewrite existing posts' `commercial_amount`; returns a `warning` with the count of tied reach-outs. Preserves original `month_label`.
- `submitCampaign` fires CAMPAIGN_CREATED (active Global Admins, actor excluded) + CAMPAIGN_CONFIRMATION (actor) via `after()`.

### Bulk campaign-assign tool (2026-06-30)

`features/campaigns/bulk-assign-{queries,actions,panel}.tsx`. Panel under the campaign list (rendered when `canManage`). `fetchUnassignedReachOuts` lists `posts` where `campaign_id IS NULL` + stage `Reach Out`; `fetchAssignableCampaigns` returns live campaigns (filters out Pending/Rejected). `BulkAssignCampaignPanel` = collapsible card, filter (handle/SIF/callout-by) + select-all + campaign picker + Assign. `bulkAssignPostsToCampaign(postIds, campaignId)` validates the target is live then `UPDATE posts SET campaign_id … WHERE id IN (…) AND campaign_id IS NULL` (idempotent, never reassigns). Built to attach the 2026-06-30 historic-creator reach-out ingest (252 rows, campaign-null; see repo-root `sheet-ingest/INGEST_LOG.md`) to real campaigns once the team maps them.

---

## 3. Onboarding (`features/onboarding/`)

### Purpose & route

Links the reach-out to a Shopify order, captures deliverables/commercials/bank details, flips `workflow_status='On Board'`, expands deliverables into child rows, sends the collab email. Route `/onboarding`, gate `onboarding_write`.

### Onboarding cap (2026-06-10)

`submitOnboarding` enforces the campaign creator cap **here** (reach-out is unlimited). Before flipping to On Board it counts distinct creators on the campaign that are **onboarded-active** (`isOnboardedActive`: On Board / Order Sent / Posted / Delivered); if that count ≥ cap (Σ `num_influencers`) and this creator isn't already in the set, the submit is blocked (`"…at its onboarding cap (X/cap)…"`). Because the count excludes voided/offboarded collabs, offboarding an onboarded creator frees a slot so a pending reach-out can be onboarded. `cap=0` ⇒ no cap.

### Data sources

Reads `posts` (+`campaigns`/`creators` joins), `instagram_cache` (avatar fallback), `shopify_orders`. Default view = not-yet-onboarded queue (`workflow_status='Reach Out'`); `submitted=yes` → `["On Board","Order Sent","Posted","Delivered"]`.

### Order linking + live Shopify single-order pull

1. Look up `shopify_orders` by `order_id`.
2. On miss → POST edge `sync-shopify-orders?order_id=...` (live pull; **Option B** — only upserts if the order carries the influencer `INF` tag), re-check.
3. Still not found → reject with `fieldErrors.orderId` + fire SHOPIFY_VALIDATION_FAILED email to the submitting actor.
   Resolves email, address (`parseShopifyAddress` → street/city/state/pincode using INDIAN_STATES anchoring), tracking, garments, SKUs → `garment_qty`.
4. **View Order link (2026-07-14):** onboarded cards + list rows get a success-green "View Order" button, and the Overview modal has it in the footer (Close · View Order · Edit Onboarding) plus a clickable Order ID. `lib/shopify.ts shopifyOrderAdminUrl(orderNumber, internalId?)` deep-links `admin.shopify.com/store/saadaa-design/orders/{internal id}` — the internal id lives in `shopify_orders.shopify_internal_id` (edge fn v13 stores it; backfilled 2026-07-14) and is stamped onto rows as `_shopifyInternalId` in onboarding queries. Missing internal id → falls back to admin order search by number. Reuse the helper for any stage that shows an order id.

### Deliverable expansion §6.2

- `total = reels + posts` (static). **Stories count as deliverables for KPIs/breakdown but never spawn a child row.**
- **Equal-split:** `perDeliverableAmount = round(commercials/total, 2)` stored on every row so `SUM(commercial_amount)` across the collab = the agreed total.
- Child rows spawned only when `total>1`: each gets next **per-creator** `post_number` (2026-06-24), `post_id = {inf_id}-P{n}` (no `-C`), shared `collab_id`, `deliverable_role='child'`, copies order/address/bank/agency. Parent UPDATE sets `workflow_status='On Board'`, `payment_status=null`, `onboard_date=today`, bank fields, syncs creator-level fields to `creators`.

### Repeat collab (C2+ for existing creators) — 2026-06-24

- **Entry:** a "New collab (existing creator)" button on the Onboarding board opens the modal in **repeat mode** (`OrderCreationModal repeatMode`): creator dropdown (`listOnboardableCreators`) + campaign (`listOpenCampaigns`) + content-type (`CONTENT_CODES`) pickers, then the normal onboarding fields.
- **Flow:** `submitRepeatCollab` → RPC `create_repeat_collab(inf_id, campaign_id, content_type)` mints the C2+ parent (atomic per-creator P/C, `workflow_status='Reach Out'`) → delegates to the untouched `submitOnboarding` (Shopify order validation, On Board, child spawn). On failure the just-created parent is deleted (no orphan). Migration `2026_06_24_phase3_create_repeat_collab.sql`.

### Collab email

- **Template (2026-07-09):** approved copy — intro → Agreed Deliverables (`[n] Collaboration Reel` / `[n] Story` / `[n] Months of Ads Usage Rights…`) → Commercials → Timelines (Script 3d / Draft 7d / Live 10d, from product delivery) → Payment Terms (**15th/30th** cycle) → Content Guidelines (`#RAHOSAADAA #PEHNOSAADAA #SAADAA`) → Content Direction → confirmation clause → "SAADAA Team". Subject **`Collaboration Confirmation | Collab ID: <id>`**. `buildCollabEmailHtml` (server) + `buildPreviewHtml` (modal) kept in sync.
- **Collab ID display** = `posts.collab_id` (`SIF-N-C{n}`), fallback `inf_id-C{collab_number}` — NOT the deliverable/post id.
- **Commercials — barter = garment quantity** (`posts.garment_qty`) for BOTH Barter and Barter + Paid: renders `Barter Quantity: [N] Products`; Barter + Paid also shows `Total Agreed Amount: ₹[amount]`. Carried through the `barterAmount` field (modal input "BARTER (No. of Products)").
- **Deliverable breakdown** chip on the card rendered as `{posts}P : {reels}R[: {stories}S]`; count chip reads "N deliverables" with breakdown tooltip.
- Recipient: `post.email` → creator email → shopify order email. **CC** = the acting user; **BCC** = `tanvi@saadaa.in`.
- **Attachments (3):** campaign brief (only `campaigns.brief_link`/`internal_brief_link` — never `post.creator_brief_link`; rejects Spreadsheet URLs, extracts Drive file id) + T&C PDF (Drive-primary `TERMS_DRIVE_FILE_ID` → repo-bundled fallback) + pronunciation voice note (`PRONUNCIATION_DRIVE_FILE_ID`, `Saadaa_Pronunciation.m4a`). **Send is hard-gated on brief + T&C + CC** (see Error Portal ch07); the voice note is best-effort and does NOT gate.
- `sendCollabEmail` resolves attachments + validates the gate **before** stamping `collab_email_sent_at` (blocked sends stamp nothing and log `collab_email_blocked`); on pass it stamps immediately then sends + logs to `email_logs` via `after()`. `skipCollabEmail` sets `collab_email_skipped=true`. Email + payment live on the collab representative (lowest post_id).

### KPIs

Count COLLABS (grouped by `collab_id`): totalOnboarded, pendingOnboardings (Reach Out), completionRate, adRightsSelected/noAdRights, pendingEmail, avg deliverables per collab, shopifyValidationRate.

---

## 4. Posting (`features/posting/`)

### Purpose & route

Records the live post (link, date, download/raw links), flips `workflow_status='Posted'`, attempts the eligibility-gated draft payment init, then hands over to the **blocking partnership popup** (auto-invite). Route `/posting`, gate `posting_submit`. **Counts are PER POST_ID** (one deliverable per row — no collab grouping).

**Per-stage member attribution (2026-07-16, `9e0985d`):** with a member selected, the rows list AND KPIs split by stage — work queue / Posts Due key on `onboarded_by`, Submitted view / Submitted + Delayed KPIs key on `posted_by` (fallback `onboarded_by` for pre-stamp rows). The member dropdown unions `posted_by` so someone who only submitted posts still appears. Onboarding page equivalent: queue = `logged_by`, Submitted = `onboarded_by`.

### Server action

| Action                                                     | Gate               | Notes                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitPosting`                                            | `posting_submit`   | Writes posting fields and `workflow_status='Posted'`; calls `autoInitDraftPayment`, which alone may stamp `payment_status='Not Due'` after the whole collab becomes eligible. No partnership write — that's the popup's job |
| `syncPartnershipForPost`                                   | `posting_submit`   | Popup step: live Meta check + stamp; `{autoInvite:true}` sends the invite when NO record exists                                                            |
| `resendPartnershipForPost` / `resendPartnershipForCreator` | `posting_submit`   | Explicit resend after a rejection (popup / kanban button) — never automatic                                                                                |
| `refreshPartnershipForCreator`                             | `performance_view` | Kanban sweep: re-read Meta state, stamp approved_at/declined_at                                                                                            |
| `savePartnershipKey`                                       | `posting_submit`   | Inline partnership_id patch = **ads-only admin override** — non-empty key sets `ad_partnership_valid=true`, but it never bypasses creator acceptance for payment |

### Partnership auto-invite (2026-07-02)

- **Partnership Key input removed** from the form. After a successful submit, `partnership-flow-modal.tsx` blocks: live-check (`lib/partnership-sync.ts#syncCreatorPartnership`) → none = auto-send with progress bar → approved/pending = informational → rejected/revoked = **Resend** button. OK appears only once the final state is known.
- Creator-level Meta state fans onto ALL of the creator's `posts` rows: `partnership_status` (normalized), `partnership_id`, `ad_partnership_valid` (true on approve / false on reject-revoke / untouched otherwise), first-transition `partnership_sent_at` / `_approved_at` / `_declined_at` (resend overwrites sent_at). Mapping lives in client-safe `lib/partnership.ts` (`toPartnershipState`, `partnershipApproved`, `PARTNERSHIP_STATE_LABELS`); `PartnershipBadge` in `status-pill.tsx` is the one shared pill (posting form header + board, Journey cards, Accounts Hub, Creator Analytics, Dashboard kanban).
- Fail-soft: Meta/API errors log to `system_errors` type `partnership_sync` and never block a posting submit.

### Validation

- `postId`, `postLink` (`http(s)://`) required.
- `downloadLink` (Drive Link) — **form field REMOVED 2026-07-16 (`505f075`)**: the Drive automation files the reel into `Saadaa All Collabs/{collab}/{post}.mp4` on submit and auto-fills `posts.download_link` (existing manual link never overwritten; resubmits carry it via `defaultValues`). Schema field kept optional (valid-URL check when present). History: was MANDATORY on every post 2026-06-10 → 2026-07-16.
- ~~Partnership key (REQ #9)~~ removed 2026-07-02 — the invite is auto-sent; gates now key on **creator approval**, not key presence.
- **post_date resolution:** form value → decode from IG shortcode (no API) → today. Returns `postDateSource`.
- **Live Instagram fetch (2026-06-29):** on link entry the form calls `fetchPostDetails({postLink, username})` (debounced) → `fetchPostByShortcode` in `lib/meta-graph.ts` hits Meta `business_discovery` for THIS creator's recent media and matches the shortcode. A match returns the **authoritative** post date (Meta `timestamp`, replacing the ±1d estimate), **proves ownership** (the post is in the creator's own media → auto-clears the manual date/owner ticks), and loads caption/likes/comments/media_type for the **View Post** preview (native IG embed iframe — videos play inline). Reuses the `lib/meta-rate-limit` gate; falls back to the shortcode estimate + manual verify when Meta is cooling down / the account is personal / the post is older than the recent window. Ownership: URL-handle-path mismatch still hard-blocks; the Meta match is the stronger positive confirmation for bare `/p/` links.

### autoInitDraftPayment §8.1

Spawns one Not-Due `payments` row per collab on the representative deliverable. Idempotent. The canonical collab-level gate lives in `lib/payment-eligibility.ts`: every deliverable must have `post_link` + `post_date`, and the creator must have actually accepted the partnership (`partnership_status='approved'`). Ads rights and `ad_partnership_valid` admin overrides do not bypass this payment rule. `reconcile_creator_payment_eligibility` runs after posting and every creator partnership transition: approval may create the draft; pending/rejected/revoked removes only empty open drafts, preserving Partial/Done and every UTR-bearing row. A partial unique index guarantees one NULL-UTR draft per representative. Only after the draft insert succeeds is `posts.payment_status='Not Due'` mirrored across the collab. Amount = sum of per-row split. Sets `due_date` + `estimated_payable_date` (15th/30th cycle).

### KPIs

Per post_id over `["On Board","Order Sent","Posted"]`: **Posts Due** (not Posted), **Submitted** (Posted), Completion Rate, **Delayed** (Posted where `post_date > est_delivery`). Ad-rights filter applied in JS via `ADS_YES` truthiness (never `.eq("ads_usage_rights","Yes")` — would drop durations).

---

## 5. Order Status (`features/order-status/`)

### Purpose & route

Read-only tracking dashboard: one row per parent `posts` record with an `order_id`, enriched with live `shopify_orders`. Route `/order-status` (a separate `/orders` route also exists). No server write actions.

### States

- **`bucketStatus`** maps the **effective** status (live `tracking_status` if present, else manual `order_status`) into 6 buckets: `pending`, `transit`, `delivered`, `rto`, `cancelled` (+ "cancelled after rto" → cancelledRto).
- **Overdue:** `est_delivery < today` AND effective status not delivered/rto/cancelled.

### KPIs

Volume: total, pendingDispatch, inTransit, delivered, rto, cancelled, cancelledRto, deliveryRate, rtoRate. Commerce intel: totalRevenue (excludes cancelled), avgOrderValue, refunded count/amount/rate, discountUsed, repeatCustomer, taggedCount. Shopify extended columns use a `42703` fallback so commerce-intel KPIs degrade to 0 rather than erroring.

---

## 6. Offboarding (`features/offboarding/`)

### Purpose & route

Creator-level permanent blacklist (2026-07-10), not a collab transition. Route `/offboarding`, gated by `offboarding_write`. The review tray groups creators with at least one `On Board`/`Order Sent` deliverable whose `est_delivery` is before today (IST). `Posted` is the canonical signal that the posting form was submitted. Already-blacklisted creators are excluded from the review tray and shown in the Offboarded ledger instead.

### Server action

| Action                               | Gate                | Notes                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offboardCreator({ infId, reason })` | `offboarding_write` | Zod requires a trimmed 10–1,000 character reason; calls `offboard_creator_if_eligible`, which locks the creator and currently eligible post rows, rebuilds evidence, updates the blacklist, and fires the audit trigger in one transaction. Existing posts and payments stay unchanged because the terminal state belongs to the creator. |

### UI

- **Needs Review / Offboarded segments:** candidate cards and the permanent ledger share search/campaign filters.
- **Creator overview:** centered Ad Status modal shell, full-value wrapping, overdue evidence list, creator details, and reason/actor/timestamp for completed actions.
- **Reason dialog:** mandatory textarea, live character count, explicit permanent-action warning, disabled confirm until valid.
- **KPIs:** candidate creators, overdue deliverables, longest overdue days, and offboarded creators.

### Enforcement and audit

- `creators`: `is_blacklisted`, `blacklist_reason`, `blacklisted_at`, `blacklisted_by`, and `blacklist_evidence` (captured post IDs, collabs, campaigns, team members, deadlines).
- `creator_audit_log`: trigger-written in the same update transaction; RLS enabled; application service role has `SELECT` + `INSERT` only. Creator events are merged into `/audit-log`.
- Outbound/inbound lookup and submit paths reject a blacklisted creator. Onboarding independently rejects by `inf_id`/username before cap and Shopify work.

---

## Notable edge cases

- **Creator blacklist overrides duplicate/cooldown rules** — no prior collab status makes a blacklisted creator re-addable.
- **Inbound batch** is sequential (intra-batch dup catch); per-row failures isolated.
- **Onboarding child spawn ignores stories** (stories never get a post_id row) but stories still count in KPIs/breakdowns.
- **Equal-split commercial** means per-row `commercial_amount` is a fraction; per-collab totals everywhere come from sibling sums.
- **`ads_usage_rights` is free-text durations** — all "has ad rights" checks use truthiness, never `=='Yes'`.
- **`closeCampaign`/`reopenCampaign`** interact with the daily auto-close cron; reopen stamps `auto_closed_at`.
- **D7 freeze:** editing a reach-out's creator metadata is rejected once it leaves "Reach Out".
- **D8:** editing a campaign never rewrites existing posts' commercials (returns a warning instead).

## Collab minting — onboarding, not reach-out (2026-06-25)

A collab (`C{n}`) is born at **onboarding**, keyed to the order (rule: a collab = one order). Reach-out posts carry NULL `collab_id`/`collab_number` and show **"Pending"** on the onboarding board until onboarded; their deliverable number `P{n}` is assigned at reach-out and stays per-creator linear across collabs. On onboarding submit, `mint_collab_for_order(inf_id, order_id)` reuses the collab already mapped to that order_id (idempotent re-onboard / same order) else mints the creator's next C. Re-onboarding a creator with a DIFFERENT order_id mints the next C (the repeat-collab flow creates a fresh reach-out post via `create_repeat_collab`, then onboards it). Board/KPI grouping treats NULL-collab rows by `post_id` (never a fabricated `-C1`). See [[project_collab_deliverable_numbering_rule]].

## post_id minted at onboarding, not reach-out (2026-06-25c)

Extends the collab move: BOTH `post_id` (P) and collab (C) are now minted at onboarding. Reach-out creates a `posts` row with NULL post_id/post_number/collab — identified by its bigserial `id`, shown as "Pending" on the onboarding board. The onboarding form keys the row by `id` (`OnboardingSchema` accepts id OR postId). On submit, `mint_onboarding_block(inf_id, order_id, deliverable_count)` reserves the collab + the contiguous P-block (`P{maxP+1..maxP+N}`, one post_id per deliverable) in one advisory-locked call, with maxP/maxC continuing over `posts` ∪ `historic_posts`. `submitOnboarding` stamps post_id/post_number/collab onto the parent (first onboard only; re-onboard keeps stored ids) and spawns children from the reserved block. Ghosted reach-outs keep NULL ids. See [[project_collab_deliverable_numbering_rule]] (v2).
