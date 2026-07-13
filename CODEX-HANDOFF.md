
# Codex handoff — CreatorHub dashboards: team-member row drill-down + Historic Ad Status

## Repo & stack
- Next.js 15 App Router + TypeScript, Supabase (Postgres + PostgREST), Tailwind. App root: `apps/web`.
- Prod: `saadaa-creator-hub-master.vercel.app`. **Push to `main` → Vercel auto-deploys.** No PRs for this repo.
- Verify before every push: `cd apps/web && npx tsc --noEmit` (must exit 0). Optional `npm run build`.
- Supabase service client: `createServiceClient()` from `@/lib/supabase/server`. RBAC gate: `assertPermission("performance_view")` (the slug that covers Funnel + Internal Dashboard + Cost + Compliance).
- Design tokens: warm ecru light theme; gold `#F0C61E` is CTA-only. Reuse existing classes (`modal-panel`, `modal-backdrop--onboarding`, `onboarding-filter-*`, `bento-tile`, `HeroKpi`).

## Data model (important)
- `historic_posts` — the migrated archive, **fully denormalized** (creator fields live on the row: `username, profile_pic, followers, influencer_category, gender, avg_likes, engaged_rate, state, city, email` + all collab fields). Team owner = `logged_by ?? onboarded_by`.
- `posts` — the LIVE pipeline. **Not denormalized** — creator fields (name, avatar, followers, category) come from the `creators` table joined on `username`/`inf_id`. Team owner = `logged_by ?? onboarded_by`.
- Campaign map: `C24→IFC002, C45→IFC003, C49→IFC001`.
- "Posted" metric rule (already implemented in `lib/workflow.ts › isContentLink`): a post counts only if `post_link` is a real URL (http / instagram.com / youtube), NOT bare text like "Ghosted".

## Shared-component insight (do not duplicate)
`FunnelBody` (`features/funnel/page-client.tsx`) and `InternalDashboardBody`
(`features/internal-dashboard/page-client.tsx`) are rendered by BOTH:
- main Dashboard live routes: `app/(app)/funnel/page.tsx`, `app/(app)/internal-dashboard/page.tsx` (data = live `posts`), and
- `app/(app)/historic-analytics/page.tsx` (data = `historic_posts` corpus).
They differ only by the `data` prop. So any change to these two components affects both surfaces.

---

## PHASE 1 — DONE (commit 88ef7c4), for context
Team-member row drawer on Funnel + Internal Dashboard.
- `features/team-rows/actions.ts` — `fetchTeamRows(team, source="historic"): TeamRow[]`. Reads `historic_posts` where `logged_by = team OR (logged_by IS NULL AND onboarded_by = team)`, newest first, cap 8000. Gated on `performance_view`. `TeamRow` = every Tracker field.
- `features/team-rows/team-rows-drawer.tsx` — client. `TeamRowsDrawer({ team, onClose })` fetches via the action, renders a search + stage-filter drawer of row cards (avatar, POST ID, campaign, stage badge, date, **Instagram "Preview"** button → live IG embed `https://www.instagram.com/p/{shortcode}/embed/captioned/`). Card click → `RowDetailModal` (Ad-Status-style, every Tracker field grouped + preview). Render pagination ("View more"). z-index: drawer 70, detail 80, lightbox 90.
- Wired into both page-clients: a `View rows` button (enabled when a team is selected) + `onViewRows` prop on their `FilterRow`.
- Reusable helpers already used: `proxyAvatarUrl` (`lib/formatters`), `extractShortcode` (`lib/instagram-shortcode`), `Avatar` (`@/components/ui`).

---

## PHASE 2 — make the row drawer source-aware (main Dashboard = LIVE posts)
Right now the drawer always reads `historic_posts`, so on the LIVE main-Dashboard Funnel/Internal it wrongly shows historic rows. Fix:
1. Thread a `source: "live" | "historic"` prop from each route through `FunnelBody` / `InternalDashboardBody` → `TeamRowsDrawer` → `fetchTeamRows(team, source)`.
   - `app/(app)/funnel/page.tsx` + `app/(app)/internal-dashboard/page.tsx` pass `source="live"`.
   - `app/(app)/historic-analytics/page.tsx` passes `source="historic"`.
2. Implement the `"live"` branch in `fetchTeamRows`: query `posts` for the team (same `logged_by ?? onboarded_by` OR-filter), then batch-join `creators` on `username` to fill `profile_pic, inf_name, followers, influencer_category, gender` (posts lacks these). Map into the same `TeamRow` shape so the card + modal are unchanged.
3. Keep the cap high enough to not truncate a team (use `.limit(50000)` — the live posts table already exceeds the old 2000 caps; see commit 94d4a67).
Verify: on `/funnel` (live) selecting a team → drawer shows that team's LIVE posts; on `/historic-analytics` it still shows historic.

## PHASE 3 — surface mismatch cases per team member (in the drawer + a tile)
The dashboards over/under-count vs the Tracker sheet because of duplicate reels + attribution drift. Surface them so a team member sees their own data-quality issues:
1. In `fetchTeamRows`, also compute per-row flags:
   - `duplicateReel`: the row's `post_link` shortcode appears on ANOTHER row (different `inf_id`/`username`) in the same source → the reel is shared (one link is wrong).
   - `junkPostLink`: `post_link` is non-empty but NOT a content URL (fails `isContentLink`) yet the row counts as posted.
2. In `TeamRowsDrawer`: add a "⚠ Data issues (N)" filter chip that shows only flagged rows; render a small red/amber badge on flagged row cards and a "Shared with @otheruser" line in the detail modal.
3. Optional: a compact "Data issues" count tile in the Funnel/Internal filter area when a team is selected.
Reference: the duplicate-reel export logic already exists (see `Duplicate_Reel_Links_by_Team.xlsx` in repo root; 9 cross-creator + 35 same-creator reels found in the Tracker). Cross-creator = definite wrong link.

## PHASE 4 — Historic Ad Status view (port of the main Dashboard Ad Status)
Add an "Ad Status" tab to Historic Analytics that mirrors the main Dashboard's Ad Status board + detail modal, but scoped to historic data.
- Main Ad Status lives in `features/ad-status/` — `AdStatusBoard` (`ad-board.tsx:1983`), list/grid (`AdRunCardsGrid`/`AdRunListTable`), detail (`AdStatusOverviewModal`:990), creative preview (`AdCreativeLightbox`:371), badges (`WhCategoryBadge`, `RowStatusBadge`), `AdVariantCards`:661. Data via `features/ad-status/queries.ts` (SIF-token matching against the Meta Ads warehouse, live + historic).
- The board already carries HISTORIC + RETIRED-ID chips and historic rows, so most of the data path exists. The task is a Historic Analytics tab/route that renders the same board filtered to historic posts (source flag), reusing the existing components — NOT a rewrite.
- Add it to `app/(app)/historic-analytics/page.tsx` + its `view-toggle.tsx` (currently Overview / Funnel View / Internal Dashboard → add "Ad Status").

---

## Reusable components (file:line)
- IG post preview lightbox pattern: `features/ad-status/ad-board.tsx:371` (`AdCreativeLightbox`) — iframe `instagram.com/p/{shortcode}/embed/captioned/`.
- `extractShortcode(url)` — `lib/instagram-shortcode.ts:41`.
- `proxyAvatarUrl(url, size)` — `lib/formatters.ts:96` (weserv proxy; returns null for null → Avatar falls back to initials; note fbcdn URLs often 403 even proxied).
- `Avatar` — `@/components/ui` (`components/ui/avatar.tsx:53`; props `src, username, name, size`).
- `isContentLink` — `lib/workflow.ts`.

## Conventions (every shippable change)
1. `npx tsc --noEmit` clean, then commit + push to `main`.
2. Commit trailer:
   ```
   Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01RGiwjvuZXSkBTxfkbDjrr9
   ```
3. Append a dated entry to `../CreatorHub-Changelog-AddOns.md` (outside the repo) and to the KB chapter under `docs/knowledge-base/` (ch07 analytics / ch06 stages), and update the view's Know More content in `features/know-more/content/`.
4. Do NOT write to the Meta Graph API (read-only `business_discovery` only). Do NOT reset SIF ids (they're data-derived).

## Parked (data, not code — separate)
- Migration tail: 84 Meta rate-limited + 38 personal/dead creator handles from the Influenza sheet + their ~43 reach-out posts (resume after Meta app-usage cooldown; scripts in the session scratchpad: `ingest_new_creators.py`, `build_posts.py`).
- 2 Lakshita project-side fixes (wrong reel on `parul_sharma31 SIF-2086-P2`; `rakshika12_ SIF-7631-P1` attribution Lakshita→Tanvi).
