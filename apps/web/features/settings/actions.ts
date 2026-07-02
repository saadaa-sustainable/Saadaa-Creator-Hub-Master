"use server";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/rbac.server";
import {
  TEST_MODE_SCOPES_KEY,
  CAMPAIGN_AUTO_CLOSE_KEY,
  SCOPE_TABLE,
  SCOPE_PREVIEW,
  TEST_SCOPE_LABELS,
  PURGE_ORDER,
  PREVIEW_ITEMS_CAP,
  isTestScope,
  type TestScope,
  type SaadaaTable,
  type TestEntriesPreview,
  type TestEntryPreviewGroup,
} from "./test-scopes";

// Admin-only gate for every config write/read here. `system_config` is admin-only
// (see lib/rbac.ts) and returns the actor (email recorded on archive rows).
const CONFIG_PERMISSION = "system_config" as const;

// Surfaces that read the four scoped entities — refreshed after a purge so test
// rows vanish/appear immediately.
const REVALIDATE_PATHS = [
  "/",
  "/dashboard",
  "/campaigns",
  "/creators",
  "/reach-out",
  "/onboarding",
  "/posting",
  "/order-status",
  "/orders",
  "/offboarding",
  "/accounts-hub",
  "/journey",
  "/sheets",
  "/settings",
];

// Cache tag for the Test Mode scopes read below. Invalidated by setTestMode so
// the (app)/layout banner flips immediately after an admin toggles a scope.
const TEST_MODE_SCOPES_TAG = "test-mode-scopes";

/**
 * Uncached DB read of the active Test Mode scopes. Stored as a JSON array string
 * in the TEXT `app_settings.value` column (e.g. '["creator"]'; '[]' = off).
 * GLOBAL data — no user/actor input — read via the service client (env-only, no
 * cookies) so it is safe inside `unstable_cache` and works in every context,
 * including create actions running under caller RLS.
 *
 * Used directly (bypassing the cache) by setTestMode/previewTestEntries, whose
 * current-vs-next diff decides what gets DESTRUCTIVELY purged — that decision
 * must never see a stale value.
 */
async function readTestModeScopesFromDb(): Promise<TestScope[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("app_settings")
    .select("value")
    .eq("key", TEST_MODE_SCOPES_KEY)
    .maybeSingle();
  const raw = (data as { value: unknown } | null)?.value;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is TestScope => typeof s === "string" && isTestScope(s),
    );
  } catch {
    return [];
  }
}

const getTestModeScopesCached = unstable_cache(
  readTestModeScopesFromDb,
  [TEST_MODE_SCOPES_TAG],
  { revalidate: 60, tags: [TEST_MODE_SCOPES_TAG] },
);

/**
 * Read the active Test Mode scopes — cached (60s TTL + tag invalidation) so the
 * (app)/layout banner no longer costs a DB round-trip on every navigation.
 * setTestMode revalidates the tag on every scope change, so the only staleness
 * window is the ≤60s TTL when nothing changed (i.e. never actually stale).
 */
export async function getTestModeScopes(): Promise<TestScope[]> {
  return getTestModeScopesCached();
}

/** Is a specific scope currently in Test Mode? Used by create paths to stamp is_test.
 * WRITE-PATH gate → reads the DB directly (uncached): a stale-OFF read here
 * would stamp a REAL row is_test=true and the next purge would delete it.
 * Latency is irrelevant on a submit; correctness isn't. */
export async function isScopeTest(scope: TestScope): Promise<boolean> {
  const scopes = await readTestModeScopesFromDb();
  return scopes.includes(scope);
}

export interface TestStamp {
  scope: TestScope;
  table: SaadaaTable;
  // The column to match the freshly-created rows by (e.g. "post_id", "inf_id",
  // "campaign_id", or the bigint "id").
  idColumn: string;
  ids: (string | number)[];
}

/**
 * Stamp newly-created rows as is_test=true when their scope is currently in Test
 * Mode. No-op (one cheap app_settings read) when no scope is active, so create
 * paths can call this unconditionally after a successful insert. Runs via the
 * service client so it works regardless of the caller's RLS.
 *
 * Each entity is stamped by ITS OWN scope (creators→creator, posts→collab,
 * campaigns→campaign, payments→payment) so the FK-safe purge on turn-off removes a
 * consistent set when scopes are toggled together (the normal admin flow).
 */
export async function stampTestRows(stamps: TestStamp[]): Promise<void> {
  const withIds = stamps.filter((s) => s.ids.length > 0);
  if (withIds.length === 0) return;
  // Uncached read — same reasoning as isScopeTest: a stale-ON here would mark
  // a real row for deletion by the next purge. Only the layout banner may
  // tolerate the 60s cache.
  const active = await readTestModeScopesFromDb();
  const toStamp = withIds.filter((s) => active.includes(s.scope));
  if (toStamp.length === 0) return;
  const svc = createServiceClient();
  for (const s of toStamp) {
    await svc
      .from(s.table)
      .update({ is_test: true })
      .in(s.idColumn, s.ids as never[]);
  }
}

/**
 * Preview the test entries that WOULD be deleted if the requested scope set were
 * saved (admin only — same gate as setTestMode). Read-only: deletes nothing. The UI
 * calls this first and shows an itemised confirm popup before the destructive save.
 *
 * "Turned off" = in the CURRENT active set but not in the requested `scopes`. For
 * each such scope we read its is_test=true rows (service client, bypassing RLS) and
 * build a label per row. Items capped at PREVIEW_ITEMS_CAP per scope; `count` is the
 * true total (cheap COUNT(*)) so the UI can show "+N more".
 */
export async function previewTestEntries(
  scopes: string[],
): Promise<TestEntriesPreview> {
  await assertPermission(CONFIG_PERMISSION);

  const next = Array.from(
    new Set((scopes ?? []).filter(isTestScope)),
  ) as TestScope[];
  // Uncached read: the preview must itemise exactly what setTestMode will purge.
  const current = await readTestModeScopesFromDb();
  const turnedOff = current.filter((s) => !next.includes(s));

  if (turnedOff.length === 0) return { groups: [], total: 0 };

  const svc = createServiceClient();
  const groups: TestEntryPreviewGroup[] = [];
  let total = 0;

  for (const scope of turnedOff) {
    const cfg = SCOPE_PREVIEW[scope];
    const { data, error } = await svc
      .from(cfg.table)
      .select(["id", ...cfg.columns].join(","))
      .eq("is_test", true)
      .order(cfg.orderBy, { ascending: true })
      .limit(PREVIEW_ITEMS_CAP);

    if (error) {
      throw new Error(`Failed to read ${cfg.table}: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const items = rows.map((row) => ({
      id: String(row.id),
      label: cfg.label(row),
    }));

    // Exact count (cheap head COUNT) so "+N more" is accurate when capped.
    const { count } = await svc
      .from(cfg.table)
      .select("id", { count: "exact", head: true })
      .eq("is_test", true);
    const trueCount = typeof count === "number" ? count : items.length;

    groups.push({
      scope,
      label: TEST_SCOPE_LABELS[scope],
      count: trueCount,
      items,
    });
    total += trueCount;
  }

  return { groups, total };
}

export interface SetTestModeResult {
  success: boolean;
  error?: string;
  scopes?: TestScope[];
  // Per-table count of test rows deleted (only for scopes turned OFF this call).
  deleted?: Record<string, number>;
  deletedTotal?: number;
}

/**
 * Set the active Test Mode scopes (admin only — enforced here AND in the UI).
 *
 * Diff against the current scopes:
 *  - scope turned ON  → just enabled; subsequent admin creates in that view get
 *    is_test=true.
 *  - scope turned OFF → DESTRUCTIVE: archive then delete every is_test row of that
 *    scope's table via purge_test_rows() (SECURITY DEFINER: copies each row into
 *    test_mode_archive as jsonb, then deletes; archive→delete order keeps source
 *    data intact if archiving breaks). Purges in FK-safe order (PURGE_ORDER:
 *    payments → posts → creators → campaigns) so child rows go before parents.
 *
 * No id-counter reset: Saadaa IDs are derived max+1 from the data, so the next id
 * auto-continues from the remaining real rows after a purge.
 */
export async function setTestMode(
  scopes: string[],
): Promise<SetTestModeResult> {
  const actor = await assertPermission(CONFIG_PERMISSION);
  // RPC param p_deleted_by is non-null in the generated types; actor.email is always
  // present (requireActor), so coerce to "" defensively rather than null.
  const deletedBy: string = actor.email ?? "";

  const next = Array.from(
    new Set((scopes ?? []).filter(isTestScope)),
  ) as TestScope[];

  const svc = createServiceClient();
  // Uncached read: the current-vs-next diff decides what gets destructively
  // purged, so it must reflect the DB, never a cache entry.
  const current = await readTestModeScopesFromDb();

  // 1. Persist the new scope set FIRST so no fresh test rows can be created in a
  //    scope we are about to clean up.
  const { error: flagErr } = await svc.from("app_settings").upsert(
    {
      key: TEST_MODE_SCOPES_KEY,
      value: JSON.stringify(next),
      updated_at: new Date().toISOString(),
      updated_by: deletedBy,
    },
    { onConflict: "key" },
  );
  if (flagErr) return { success: false, error: flagErr.message };

  // Flag persisted — drop the cached scopes NOW (before the purge loop, which can
  // fail-and-return early) so the layout banner and create-gates pick up the new
  // set immediately instead of waiting out the 60s TTL.
  revalidateTag(TEST_MODE_SCOPES_TAG);

  // 2. Scopes turned OFF (in old, not in new) are purged — in FK-safe order.
  const turnedOff = current.filter((s) => !next.includes(s));
  let deleted: Record<string, number> | undefined;
  let deletedTotal = 0;

  if (turnedOff.length > 0) {
    deleted = {};
    const ordered = PURGE_ORDER.filter((s) => turnedOff.includes(s));
    for (const scope of ordered) {
      const table = SCOPE_TABLE[scope];
      const { data, error } = await svc.rpc("purge_test_rows", {
        p_source_table: table,
        p_scope: scope,
        p_deleted_by: deletedBy,
      });
      if (error) {
        return {
          success: false,
          error: `Failed to purge ${table}: ${error.message}`,
        };
      }
      const n = typeof data === "number" ? data : 0;
      deleted[table] = (deleted[table] ?? 0) + n;
      deletedTotal += n;
    }
  }

  // 3. Refresh every surface that reads the scoped entities. revalidatePath
  // alone does NOT drop unstable_cache Data-Cache entries, so also bust the
  // entity tags the purge just mutated (filter-options caches etc.).
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
  if (deletedTotal > 0) {
    for (const tag of ["posts", "campaigns", "creators", "payments"]) {
      revalidateTag(tag);
    }
  }

  return { success: true, scopes: next, deleted, deletedTotal };
}

// ── Campaign auto-close toggle ───────────────────────────────────────────────────
// Saadaa runs a daily cron that auto-closes campaigns past their end. This flag lets
// an admin pause that automation (stored as 'true'/'false' string in app_settings).

// Cache tag for app_settings reads below. setCampaignAutoCloseEnabled
// revalidates it, so the only staleness window is the ≤60s TTL when nothing
// changed (i.e. never actually stale).
const APP_SETTINGS_TAG = "app-settings";

/** Uncached DB read of the campaign auto-close flag (default ON when unset).
 * GLOBAL data — no user/actor input — read via the service client (env-only,
 * no cookies) so it is safe inside `unstable_cache`. */
async function readCampaignAutoCloseFromDb(): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("app_settings")
    .select("value")
    .eq("key", CAMPAIGN_AUTO_CLOSE_KEY)
    .maybeSingle();
  const raw = (data as { value: unknown } | null)?.value;
  // Default ON: only an explicit 'false' disables it.
  if (typeof raw !== "string") return true;
  return raw.trim().toLowerCase() !== "false";
}

const getCampaignAutoCloseCached = unstable_cache(
  readCampaignAutoCloseFromDb,
  ["campaign-auto-close"],
  { revalidate: 60, tags: [APP_SETTINGS_TAG] },
);

/** Read the campaign auto-close flag — cached (60s TTL + tag invalidation). */
export async function getCampaignAutoCloseEnabled(): Promise<boolean> {
  return getCampaignAutoCloseCached();
}

/** Toggle campaign auto-close (admin only). */
export async function setCampaignAutoCloseEnabled(
  enabled: boolean,
): Promise<{ success: boolean; error?: string; enabled?: boolean }> {
  const actor = await assertPermission(CONFIG_PERMISSION);
  const svc = createServiceClient();
  const { error } = await svc.from("app_settings").upsert(
    {
      key: CAMPAIGN_AUTO_CLOSE_KEY,
      value: enabled ? "true" : "false",
      updated_at: new Date().toISOString(),
      updated_by: actor.email ?? null,
    },
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  // Bust the unstable_cache entry — revalidatePath alone does NOT drop
  // Data-Cache entries, so the toggle must reflect immediately everywhere.
  revalidateTag(APP_SETTINGS_TAG);
  revalidatePath("/campaigns");
  revalidatePath("/settings");
  return { success: true, enabled };
}
