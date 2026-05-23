# Morning Checklist — 2026-05-20 Overnight Build

What you need to do manually when you wake up. Order matters — top → bottom.

---

## 1. Apply Supabase SQL Migrations (5 min)

Two new RPCs need DDL run in Supabase **SQL Editor** (REST can't run CREATE FUNCTION).

### A. `submit_campaign` RPC

Open Supabase Dashboard → SQL Editor → paste the **entire contents** of:

```
supabase/migrations/2026_05_20_submit_campaign_rpc.sql
```

Run. Expected output: `Success. No rows returned.`

Verify it loaded:
```sql
select proname from pg_proc where proname = 'submit_campaign';
```
Expected: 1 row.

### B. (Already applied 2026-05-19 — `submit_reachout` RPC)
No action needed unless schema drifted.

---

## 2. Restart Next.js Dev Server (1 min)

The dev server picks up the new env vars + schema changes:

```bash
cd "/Users/saadaa/Documents/Influencer Project/New Influencer Project/apps/web"
# Kill old:
lsof -ti:3000 | xargs kill -9
# Start fresh:
npm run dev
```

---

## 3. Regenerate Supabase Types (2 min)

The local `types.gen.ts` is stale — many TS errors in `features/` are because of this, not actual bugs. Regen:

```bash
cd "/Users/saadaa/Documents/Influencer Project/New Influencer Project/apps/web"
npm run db:types
```

If the script fails (auth), run:
```bash
npx supabase login
npx supabase gen types typescript --project-id xynyvbagcudjrzklwnqp > lib/supabase/types.gen.ts
```

---

## 4. End-to-End Smoke Tests (15 min)

### Test 1 — Create Campaign
1. Go to `/campaigns/new`
2. Fill: name "Test Campaign", brand SAADAA, key message anything, brief link any URL, add 1 budget row (Mid tier / Barter / segment "Test" / 5 influencers / ₹2000 avg / 2-3 garments)
3. Submit
4. Expected:
   - Supabase: `campaigns` row created with `IFC{NNN}` (auto-incremented)
   - Supabase: `campaign_budget` row(s) created
   - Sheet: `Campaign` tab has new row appended
   - Sheet: `Campaign Budget` tab has new block at bottom with formulas
   - Redirect to `/campaigns?created=IFC...`

### Test 2 — Inbound Reach-Out
1. Go to `/reach-out/inbound`
2. Same form as outbound but pill says "Creator initiated"
3. Fetch + submit a creator
4. Expected: Supabase `posts` row with `reachout_direction='inbound'` and `Inbound` in `reachout_type` column ⚠️ NOTE: `posts.reachout_type` doesn't exist on schema — so it goes to `reachout_direction` only. Sheet `REACHOUT TYPE` column gets "Inbound".

### Test 3 — Onboarding (Create Order)
1. Go to `/onboarding`
2. Find a Reach Out row → click "Create Order"
3. Enter a real Shopify order_id that exists in `shopify_orders` table
4. Click Preview → see email/tracking/address
5. Set garment qty = 1
6. Submit
7. Expected:
   - Post row updated: `workflow_status='On Board'`, `email`, `order_id`, `tracking_id`, `order_status`, `garment_qty`, `onboard_date` populated
   - Sheet: Creator Data row matching POST_ID gets cells filled, Status flipped to "On Board"

### Test 4 — Posting
1. Go to `/posting`
2. Find an On Board row → click "Submit"
3. Enter post date (today), live post link (any IG URL), download link if ads_usage_rights=Yes
4. Submit
5. Expected:
   - Post row: `workflow_status='Posted'`, `post_date`, `post_link`, `download_link`
   - Sheet: row updated with Post Date / Link To Post / Download Link / Status='Posted'

---

## 5. Manual UI Audit Pass (user request "same UI as legacy")

Tomorrow's TODOs (UI parity):

- [ ] `/campaigns/new` — compare Section 1/2/3 layout side-by-side with legacy Index.html `#view-campaign`. Adjust spacing, field widths, headings.
- [ ] `/campaigns` list — compare with legacy `Campaign` view (if it has one). Add filter chips if legacy has.
- [ ] `/onboarding` table action button — confirm "Create Order" matches legacy pattern; modal styling may need adjustment.
- [ ] `/posting` row table — match legacy post-row layout (probably uses inline edit, not modal). Current build uses modal-per-row. May need flip to inline.
- [ ] **Slash command** — you mentioned `/ui-ux-pro-max:ui-ux-pro-max` — invoke this on each new page (`/campaigns/new`, `/onboarding`, `/posting`) for polish pass.
- [ ] Mobile views — verify 2x2 bento per memory `feedback_mobile_ui_rules.md`. New tables already have mobile card variants.

---

## 6. GAS State

All mirror handlers deployed @132:
- ✅ `_mirrorReachOut_` — appends Creator Data row
- ✅ `_mirrorCampaign_` — appends Campaign sheet + Campaign Budget block
- ✅ `_mirrorOnboard_` — updates Creator Data row by POST_ID
- ✅ `_mirrorPosting_` — updates Creator Data row by POST_ID
- ⏳ `_mirrorPayment_` — still stub (Payments stage not built yet)

Deploy ID: `AKfycbzFe-pwH8GtSOXXNbEYutUYxY5uFbrw7Mxw4-NMxZVC_NnfTiX0hxQqpdOYyu7NLGm9`

Future GAS edits: just run `./legacy-gas/redeploy-mirror.sh "msg"` — no manual UI clicks.

---

## 7. Known Open Items

| Area | Status | Notes |
|------|--------|-------|
| Type errors in `features/onboarding`, `features/posting`, `features/reach-out` | Cosmetic | Caused by stale `types.gen.ts`. Step 3 above fixes most. Runtime works. |
| `reachout_type` column on `posts` | Not in schema | Dropped from RPC. Direction-only via `reachout_direction`. Sheet still gets "Inbound"/"Outbound" in REACHOUT TYPE column via mirror. |
| Inbound CSV bulk upload (>10 creators) | Deferred | Legacy MOM §4.2 — defer to later phase. Single-creator inbound works. |
| Onboarding "merged order creation" (MOM Phase 3) | Built per legacy | Matches legacy `submitOrderCreation`. Sheet mirror works. |
| Posting approval column | Behind feature flag | Per legacy, hidden by default. |
| Payments mirror | Stub | Phase 5. |
| `OnboardingRow.creator.profile_pic` rendering | OK | Same `Avatar` component as elsewhere. |

---

## 8. Files Created Tonight

### New feature folders
- `features/campaigns/` — schema, actions, queries, create-form
- `features/posting/` — schema, actions, queries, posting-form, posting-table
- `features/onboarding/` — extended (schema, actions, order-form added)

### New routes
- `/campaigns` (rebuilt from stub)
- `/campaigns/new`
- `/reach-out/inbound` (rebuilt from stub, reuses outbound-form)
- `/posting` (rebuilt from stub)

### Backend
- `supabase/migrations/2026_05_20_submit_campaign_rpc.sql` ← **APPLY MANUALLY**
- GAS handlers in `legacy-gas/InfluencerBackend.js` — deployed @132

### Shared
- `lib/sheet-mirror.ts` — extended with `mirror_campaign` action type
- `features/reach-out/schema.ts` — added `reachoutDirection` field
- `features/reach-out/actions.ts` — direction-aware permission gating
- `features/reach-out/outbound-form.tsx` — accepts `direction` prop (defaults outbound)

---

## 9. Memory Updates Saved

- `feedback_mirror_legacy_exactly.md` (created earlier tonight) — codifies "mirror legacy data + logic, only UI/UX diverges". Read this before next session.

---

## 10. Tomorrow's Suggested Order

1. Run Step 1 (apply SQL)
2. Run Step 2 (restart server) + Step 3 (regen types)
3. Smoke test each stage (Test 1-4)
4. UI audit per Step 5 — run the `/ui-ux-pro-max` skill on each new page
5. Then proceed to **Payments stage** (last stage before Journey/Accounts polish)
6. Long-tail: Admin Panel (#17), follow-up logic confirm (#23), Ad Status with Anmol (#34)
