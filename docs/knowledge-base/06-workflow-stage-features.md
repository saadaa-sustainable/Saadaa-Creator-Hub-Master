# 06 · Workflow-Stage Features

> Part of the CreatorHub KB. Last verified 2026-06-07. The six pipeline stages. Code is authoritative; cited `file:line` are relative to `apps/web`.

The shared state machine (`workflow_status` on `posts`):

```
Reach Out → On Board → (Order Sent) → Posted → Delivered → RTO / Cancelled
                                                          ↘ Offboarded (manual terminal)
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
| Action | Gate | Notes |
|---|---|---|
| `submitReachOut` | `reachout_inbound` if direction inbound else `reachout_outbound` | Single submit |
| `submitInboundBatch` | `reachout_inbound` | Per-row `submit_reachout`; failures isolated |
| `editReachOut` | `reachout_outbound` | D7 — only `contentType`/`contentName` editable; creator metadata FROZEN once stage leaves "Reach Out" |
| `lookupCreator` / `lookupCreatorsFromDataset` | `reachout_outbound`\|`reachout_inbound` | Cache-first IG lookup |

### submit_reachout RPC
`security invoker`, granted to `service_role`. Concurrency via `pg_advisory_xact_lock` on `reachout-user:<username>` (pre-upsert) AND `reachout-inf:<inf_id>` (post-upsert) — prevents duplicate creators + serializes ID assignment (replaces legacy `LockService`). Generates `SIF-N` for new creators; `post_number = MAX+1` **per inf_id** (per-creator P, 2026-06-24); `collab_number = MAX+1` per inf_id; `post_id = post_id_short = {inf_id}-P{post_number}`; `collab_id = {inf_id}-C{collab_number}`. Auto-attaches `creator_brief_link` from `campaigns.brief_link`. **Reach Out is NEW-creators-only (2026-06-24):** `submitReachOut`/`submitInboundBatch` reject an existing creator (`creators` row exists) → use Onboarding for C2+.

### Key business rules
- **Content type** (UI label "Content Type"; field key `contentCode`): 10 hard-coded codes in `content-codes.ts` (UGC, VRP, OFF, BST, EDU, PRC, TBG, MAR, OST, FOU). *(Relabeled from "Content Code" 2026-06-07.)*
- **Duplicate-creator guard:** blocks re-reaching the same creator in the same campaign unless the prior collab is `Cancelled` **or voided (`Offboarded`/`Offboarding`)** — both free the slot (RTO/Delivered still count as active). Uses `isVoidedStatus` (`lib/workflow.ts`). Inbound checks per-row sequentially (catches intra-batch dupes).
- **Existing-creator block (2026-06-24):** beyond the per-campaign guard, reach-out is rejected for ANY existing creator (a `creators` row exists by username) in both flows. The outbound form disables submit + shows a banner the moment Fetch resolves an existing creator. Existing creators start new collabs (C2+) at Onboarding, so `C1` is only ever minted at reach-out.
- **Closed-campaign block:** if `campaigns.status` lowercased = `'closed'`, the whole submit/batch is rejected ("Reopen it — Campaign Owner / Global Admin").
- **Creator cap = ONBOARDING cap (2026-06-10):** reach-out is now **unlimited** per campaign — the cap is enforced at **onboarding** (`submitOnboarding`), not reach-out. cap = Σ `campaign_budget.num_influencers`. "Used" = distinct creators **onboarded-and-active** (`isOnboardedActive`: On Board / Order Sent / Posted / Delivered) by username. Onboarding a new creator is blocked once used ≥ cap; an onboarded creator who is later offboarded (voided) leaves the set and frees a slot for a pending reach-out. `cap=0` ⇒ no cap. The reach-out form pill shows `onboarded / cap · N slots left` (informational — does not block reach-out). Un-onboarded leftovers are voided (→ Cancelled) when the campaign closes (`voidUnonboardedForCampaign`).
- After submit: enqueues IG scrape (`instagram_cache` upsert, insert-only), fires `notifyActorConfirmation` (REACHOUT/INBOUND_CONFIRMATION — one summary email per batch) via `after()`, revalidates tags + routes.

### IG lookup (`lookupCreator`)
Cache-first 3-tier: (1) `creators` row → identity locked, metrics editable; (2) `instagram_cache` with meaningful non-pending data; (3) else upsert pending row → `source:'queued'` (3-hr cron fills it).

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
| Action | Gate | Notes |
|---|---|---|
| `submitCampaign` | `campaign_create` | RPC `submit_campaign`; stamps `created_by=actor.email` |
| `editCampaign` | `campaign_edit` | UPDATE campaign + delete-then-insert budget rows |
| `fetchCampaignForEdit` | `campaign_edit` | Prefill loader |
| `closeCampaign` | `campaign_edit` | sets `status='Closed'` |
| `reopenCampaign` | `campaign_edit` | sets `status='Active'` + stamps `auto_closed_at` so daily cron won't re-close |
| `bulkAssignPostsToCampaign` | `campaign_edit` | bulk-set `campaign_id` on unassigned reach-outs; only moves rows where `campaign_id IS NULL` (never reassigns); target must be live (not Pending/Rejected) |

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

### Deliverable expansion §6.2
- `total = reels + posts` (static). **Stories count as deliverables for KPIs/breakdown but never spawn a child row.**
- **Equal-split:** `perDeliverableAmount = round(commercials/total, 2)` stored on every row so `SUM(commercial_amount)` across the collab = the agreed total.
- Child rows spawned only when `total>1`: each gets next **per-creator** `post_number` (2026-06-24), `post_id = {inf_id}-P{n}` (no `-C`), shared `collab_id`, `deliverable_role='child'`, copies order/address/bank/agency. Parent UPDATE sets `workflow_status='On Board'`, `payment_status=null`, `onboard_date=today`, bank fields, syncs creator-level fields to `creators`.

### Repeat collab (C2+ for existing creators) — 2026-06-24
- **Entry:** a "New collab (existing creator)" button on the Onboarding board opens the modal in **repeat mode** (`OrderCreationModal repeatMode`): creator dropdown (`listOnboardableCreators`) + campaign (`listOpenCampaigns`) + content-type (`CONTENT_CODES`) pickers, then the normal onboarding fields.
- **Flow:** `submitRepeatCollab` → RPC `create_repeat_collab(inf_id, campaign_id, content_type)` mints the C2+ parent (atomic per-creator P/C, `workflow_status='Reach Out'`) → delegates to the untouched `submitOnboarding` (Shopify order validation, On Board, child spawn). On failure the just-created parent is deleted (no orphan). Migration `2026_06_24_phase3_create_repeat_collab.sql`.

### Collab email
- **Deliverable breakdown** rendered as `{posts}P : {reels}R[: {stories}S]`; count chip reads "N deliverables" with breakdown tooltip.
- Recipient: `post.email` → creator email → shopify order email.
- Attachments: campaign brief (only `campaigns.brief_link`/`internal_brief_link` — never `post.creator_brief_link`; rejects Spreadsheet URLs, extracts Drive file id) + permanent T&C PDF.
- `sendCollabEmail` stamps `collab_email_sent_at` immediately (UI updates without waiting for SMTP), then sends + logs to `email_logs` via `after()`. `skipCollabEmail` sets `collab_email_skipped=true`. Email + payment live on the collab representative (lowest post_id).

### KPIs
Count COLLABS (grouped by `collab_id`): totalOnboarded, pendingOnboardings (Reach Out), completionRate, adRightsSelected/noAdRights, pendingEmail, avg deliverables per collab, shopifyValidationRate.

---

## 4. Posting (`features/posting/`)

### Purpose & route
Records the live post (link, date, download/raw links, partnership key), flips `workflow_status='Posted'`, auto-inits the draft payment. Route `/posting`, gate `posting_submit`. **Counts are PER POST_ID** (one deliverable per row — no collab grouping).

### Server action
| Action | Gate | Notes |
|---|---|---|
| `submitPosting` | `posting_submit` | Writes posting fields, `workflow_status='Posted'`, `payment_status='Not Due'`; calls `autoInitDraftPayment` |
| `savePartnershipKey` | `posting_submit` | Inline partnership_id patch (also from Accounts Hub) |

### Validation
- `postId`, `postLink` (`http(s)://`) required.
- `downloadLink` (Drive Link) **MANDATORY for every post** (2026-06-10) — red `*`, always required + valid URL, not just ad posts. The content asset must always be captured.
- **Partnership key (REQ #9):** required when ad usage rights granted (truthiness, since `ads_usage_rights` stores durations); when present must be the numeric Meta partnership code (`/^\d{6,}$/`).
- **post_date resolution:** form value → decode from IG shortcode (no API) → today. Returns `postDateSource`.
- **Live Instagram fetch (2026-06-29):** on link entry the form calls `fetchPostDetails({postLink, username})` (debounced) → `fetchPostByShortcode` in `lib/meta-graph.ts` hits Meta `business_discovery` for THIS creator's recent media and matches the shortcode. A match returns the **authoritative** post date (Meta `timestamp`, replacing the ±1d estimate), **proves ownership** (the post is in the creator's own media → auto-clears the manual date/owner ticks), and loads caption/likes/comments/media_type for the **View Post** preview (native IG embed iframe — videos play inline). Reuses the `lib/meta-rate-limit` gate; falls back to the shortcode estimate + manual verify when Meta is cooling down / the account is personal / the post is older than the recent window. Ownership: URL-handle-path mismatch still hard-blocks; the Meta match is the stronger positive confirmation for bare `/p/` links.

### autoInitDraftPayment §8.1
Spawns one Not-Due `payments` row per collab on the representative deliverable. Idempotent. Collab-level gate: every deliverable must have post_link + post_date, no ads-rights deliverable may lack a partnership. Amount = sum of per-row split. Sets `due_date` + `estimated_payable_date` (15th/30th cycle).

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
Manual terminal stage that **VOIDS** a collab (2026-06-10). Moves a whole collab episode to `workflow_status='Offboarded'`, which removes it from **every** other surface — Accounts Hub board + Due CSV, Order Status, Journey, and all dashboards/analytics — via the shared `isVoidedStatus` filter (`lib/workflow.ts`), so its leftover balance can never be paid. Payment rows are never deleted: already-disbursed money is kept in the DB, the Sheet View Payments tab, and the Accounts **Paid/All** CSV (which fetch with `includeVoided`). Route `/offboarding`, whole page gated `offboarding_write`.

### Server action
| Action | Gate | Notes |
|---|---|---|
| `moveToOffboarding(postId)` | `offboarding_write` | Resolves `(inf_id, collab_number)`, UPDATEs **every** deliverable row sharing that key to `workflow_status='Offboarded'`; single-row fallback if grouping key missing. Voids the collab (removed everywhere via `isVoidedStatus`); does NOT touch `payment_status` or delete payment rows, so disbursed money survives as history |

### UI
- **Move panel:** operator picks a collab from the "Collab ID" `<select>` (value = representative post_id, label `{collabId} · @{username}`) and confirms via the danger button. Irreversible from this screen.
- **Board + detail overlay** (`offboarding-board.tsx`): List/Cards toggle (mobile forced to Cards), deliverables shown as `{staticPosts}P : {reels}R[: {stories}S]`, `PaymentPill`. Clicking any card/row opens an "Offboarding Overview" portal modal with the full collab snapshot (Post/Collab/INF ID, campaign, collab type, deliverables, ads rights, commercials, order id/status, tracking, payment, dates, followers, category, post link).
- **KPIs:** total, paid (`payment_status='Done'`), awaitingPayment, totalCommercials (Σ per-collab agreed).

---

## Notable edge cases
- **Duplicate guard treats `Cancelled` and voided (`Offboarded`) as re-addable** — RTO/Delivered count as active.
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
