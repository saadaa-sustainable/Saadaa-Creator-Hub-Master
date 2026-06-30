
### Creator deactivation + "Deactivated" badge everywhere (2026-06-30)
- **`creators.is_active`** (+ `deactivated_reason`, `deactivated_at`). Deactivated = dead/mangled IG handle (null `profile_id`) or Meta "Invalid user id". **280 creators with null profile_id deactivated** (reason `no_profile_id`); history kept.
- **Shared `DeactivatedBadge`** (`components/ui/status-pill.tsx`) shown wherever a creator renders: Creator Analytics card + table row, historic reach-out picker, onboarding / posting / accounts-hub cells, journey card. Threaded `is_active` through `creator_analytics_page` + `list_historic_creators` RPCs and every `creator:creators(...)` select. Migration `2026_06_30_creators_is_active_deactivation.sql`.

### Bulk-assign reach-outs to a campaign + historic-creator ingest (2026-06-30)
- **Data ingest** — migrated 252 reach-out `posts` rows (243 historic creators) from the team's "Influenza data to migrate" sheet. All `workflow_status='Reach Out'`, `campaign_id=NULL` (assigned later via the tool below), inf_id = each creator's existing clean SIF (FK-safe). Skipped 7 already in `posts`, 2 sheet dups, all blank-handle UGC rows. Source/rollback logged in `sheet-ingest/INGEST_LOG.md`.
- **Campaigns stage — bulk campaign-assign tool** — new panel under the campaign list: lists `posts` with `campaign_id IS NULL` at Reach Out stage, filter + select-all + pick a live campaign + assign in one write. `campaign_edit`-gated; only moves still-unassigned rows (never reassigns). Files: `features/campaigns/bulk-assign-{queries,actions,panel}.tsx`, wired into `/campaigns`. Know More (campaigns slug) updated.

### Faster Reach Out fetch — media.limit 12→6 (2026-06-24)
- Reduced Meta `business_discovery` `media.limit(12)` → `media.limit(6)` in `lib/meta-graph.ts`. The media pull dominates the per-fetch latency, so ~halves the single-fetch time (the user-reported 4-5s). ER/avg_likes now computed over the 6 most-recent posts — still representative. Applies to both single + batch fetches.
