# 09 · Changelog & Maintenance

> Part of the CreatorHub KB. This chapter explains where the change history lives and the rule for keeping the brain current. Last verified 2026-06-07.

## Where the changelog lives

The authoritative, human-readable change history is the external file:

```
Influencer Project/CreatorHub-Changelog-AddOns.md
```

It is intentionally **outside the git repo** (the user maintains external product docs from it). It is large (~150 KB) and append-only, newest entries at the bottom, grouped by `### <Title> (YYYY-MM-DD)`. **Do not duplicate its full contents here** — this chapter is the pointer + the protocol + a milestone digest.

## The update protocol (mandatory, every shippable change)

Every change that ships does THREE things in the same commit:

1. **Append** a dated entry to `CreatorHub-Changelog-AddOns.md` describing what changed and why.
2. **Update** the affected KB chapter here (`docs/knowledge-base/NN-*.md`) so the brain stays accurate. If a `file:line` reference moved, fix it.
3. **Update** the view's **Know More** content (`features/know-more/content/<slug>.tsx`) if user-facing behavior or layout changed.

Plus the standing engineering rules:
- Push completed work straight to `main` (Vercel auto-deploys main → prod). `gh` is not installed.
- Supabase is the sole source of truth — never write to Google Sheets.
- Never set/echo secrets (SMTP creds, `CRON_SECRET`, Shopify/Apify edge secrets are the user's to set in Vercel / Supabase).
- Run `npx tsc --noEmit` before committing.

## Recent milestone digest (2026-06)

Newest first. Full detail is in the external changelog + the chapter each touches.

| Date | Milestone | KB chapter |
|------|-----------|------------|
| 2026-06-10 | **Accounts Hub Phase 1:** Collab-ID log form + creator name on select; Payment Done kanban lane; Profile URL in CSV exports; CSV template download + upload; monthly payable digest email (12th/27th → Accounts + Admins, full bank sheet) | 07 |
| 2026-06-09 | **Sheet View row delete + bulk delete** (Global-Admin only; `deletable` operational tabs; hard delete + `row_deletions` restore log; Undo + Trash; FK-guarded) | 04, 07 |
| 2026-06-07 | **Knowledge base created** (this `docs/knowledge-base/` — the project brain) | all |
| 2026-06-07 | **Repo reorg:** deleted dead `creatorhub/` (1.9 GB Expo prototype), `Old gas project files/`, `gh-pages-wrapper/`, `config/`; consolidated supabase (42 migrations + `scrape-pending-apify` + `config.toml`) into the repo | 03, 04, 05 |
| 2026-06-07 | **Full test-data wipe:** `TRUNCATE … RESTART IDENTITY CASCADE` on operational tables (fresh IDs IFC001 / INF-001 / SIF-1); preserved RBAC, users, `shopify_orders` | 04 |
| 2026-06-07 | **Dashboard Inbound vs Outbound channel analytics** (Overview Row E2) + `ChannelStats` | 07 |
| 2026-06-07 | **"Content Code" → "Content Type"** relabel across reach-out (field key `contentCode` unchanged) | 06 |
| 2026-06-07 | **Campaign Start/End dates required** (red `*` + validation on create & edit) | 06 |
| 2026-06-07 | **Offboarding:** click-to-open detail overlay + deliverables "1P:1R"; status renamed `Offboarding` → `Offboarded` | 06 |
| 2026-06-07 | **Reach-out creator-cap slots** shown in the form; deliverables "P : R" format | 06 |
| 2026-06-07 | **Onboarding live Shopify order check** on a sync miss (Option B, requires `inf` tag) | 05, 06 |
| 2026-06-07 | **Shopify influencer tag corrected** system-wide: `inf` (not IFAD) | 05 |
| 2026-06-06 | **Campaign Owner role** + campaign lifecycle (auto-close / reopen) + creator cap at reach-out | 06, 08 |
| 2026-06-06 | **User-invitation email** (event-driven, Google-OAuth-only) | 07 |
| 2026-06-06 | **Confirmation emails** show full form detail + correct stage labels | 08 |
| 2026-06-06 | **Collab ID restructure** (post_id = short id, collab_id groups deliverables) + **partial payments** | 04, 06 |

## How to regenerate / re-verify this KB

When the codebase changes substantially, re-run a multi-agent sweep (one agent per subsystem: stack/arch/config, DB schema, edge functions, workflow features, analytics features, shared lib/conventions), each reading the real files and returning a chapter, then reconcile against the chapters here. The chapters are written to be diff-friendly — update the changed sections rather than rewriting whole files.

> This KB supersedes the older GAS-era knowledge base at `Influencer Project/docs/knowledge-base/` (00–11), which documents the legacy Apps Script app. Keep that as legacy reference; this `docs/knowledge-base/` in the repo is the current brain.
