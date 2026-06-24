// Test Mode scope constants/types — a PLAIN module (no 'use server'). Value + type
// exports a server-action file may not re-export, so these live here and
// features/settings/actions.ts imports from them.
//
// Saadaa entities carry an `is_test boolean` flag. When a scope is ON, new rows in
// that entity are stamped is_test=true (admin sandbox); turning the scope OFF purges
// (archive→delete) every is_test row of its table. Unlike Workflow Optimizer there
// is NO id_counters table — Saadaa IDs (SIF inf_id, post/collab number, IFC{NNN})
// are derived max+1 from the data on the fly, so a purge auto-resets the next id
// with no reset RPC needed.

// One of the four Saadaa tables that carry an is_test flag.
export type SaadaaTable = "campaigns" | "posts" | "creators" | "payments";

// app_settings keys (mirror Workflow Optimizer for parity / muscle memory).
export const TEST_MODE_SCOPES_KEY = "test_mode_scopes";
export const CAMPAIGN_AUTO_CLOSE_KEY = "campaign_auto_close_enabled";

// The 4 Saadaa test scopes. UI/display order (campaign → creator → collab → payment,
// the natural workflow order). Purge order is FK-safe and different — see PURGE_ORDER.
export const TEST_SCOPES = [
  "campaign",
  "creator",
  "collab",
  "payment",
] as const;

export type TestScope = (typeof TEST_SCOPES)[number];

// Friendly labels for banner / toggle UI (one source of truth).
export const TEST_SCOPE_LABELS: Record<TestScope, string> = {
  campaign: "Campaigns",
  creator: "Creators",
  collab: "Collabs",
  payment: "Payments",
};

// Short helper copy shown under each toggle.
export const TEST_SCOPE_DESCRIPTIONS: Record<TestScope, string> = {
  campaign: "Test campaigns created while this scope is on.",
  creator: "Test creator profiles (reach-out / onboarding).",
  collab: "Test collabs / posts and their order + posting data.",
  payment: "Test payment ledger entries.",
};

// Scope → the single table whose is_test rows it owns.
export const SCOPE_TABLE: Record<TestScope, SaadaaTable> = {
  campaign: "campaigns",
  creator: "creators",
  collab: "posts",
  payment: "payments",
};

// FK-safe delete order (children before parents). FKs:
//   posts.inf_id → creators (RESTRICT), payments.inf_id → creators,
//   payments.post_id → posts. So purge payments → posts → creators → campaigns.
// setTestMode sorts the turned-off scopes by this order before purging.
export const PURGE_ORDER: readonly TestScope[] = [
  "payment",
  "collab",
  "creator",
  "campaign",
];

export function isTestScope(s: string): s is TestScope {
  return (TEST_SCOPES as readonly string[]).includes(s);
}

// ── Test-entry preview (delete-confirmation popup) ──────────────────────────────

// Cap how many individual items we list per scope in the confirm popup; any extra
// are summarised as "+N more".
export const PREVIEW_ITEMS_CAP = 100;

// A single test row that will be deleted, surfaced in the confirm popup.
export interface TestEntryPreviewItem {
  // Stable row identifier (the bigint PK as string) — React key.
  id: string;
  // Human-readable label, e.g. "IFC012 — Diwali Push" or "SIF-128 — devesh".
  label: string;
}

// All the test rows for one scope, grouped for the popup.
export interface TestEntryPreviewGroup {
  scope: TestScope;
  label: string; // friendly scope label (TEST_SCOPE_LABELS)
  count: number; // total test rows in this scope (may exceed items.length when capped)
  items: TestEntryPreviewItem[]; // capped at PREVIEW_ITEMS_CAP
}

// Full preview payload returned by previewTestEntries().
export interface TestEntriesPreview {
  groups: TestEntryPreviewGroup[];
  total: number; // grand total across all scopes being turned off
}

// Per-scope display config: which table to read and which columns to pull, plus how
// to build the row label. All tables share `id` (bigint) as the PK / preview key.
export interface ScopePreviewConfig {
  table: SaadaaTable;
  // Columns to select (besides id). Order matters for labelling.
  columns: readonly string[];
  // Column to order the preview by (stable, recent-first handled in the action).
  orderBy: string;
  // Build a human label from a selected row.
  label: (row: Record<string, unknown>) => string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const join = (primary: unknown, secondary: unknown): string => {
  const a = str(primary).trim();
  const b = str(secondary).trim();
  if (a && b) return `${a} — ${b}`;
  return a || b || "(untitled)";
};

export const SCOPE_PREVIEW: Record<TestScope, ScopePreviewConfig> = {
  campaign: {
    table: "campaigns",
    columns: ["campaign_id", "campaign_name"],
    orderBy: "created_at",
    label: (r) => join(r.campaign_id, r.campaign_name),
  },
  creator: {
    table: "creators",
    columns: ["inf_id", "username"],
    orderBy: "created_at",
    label: (r) => join(r.inf_id, r.username),
  },
  collab: {
    table: "posts",
    columns: ["post_id", "username"],
    orderBy: "created_at",
    label: (r) => join(r.post_id, r.username),
  },
  payment: {
    table: "payments",
    columns: ["inf_id", "amount"],
    orderBy: "created_at",
    label: (r) => {
      const who = str(r.inf_id).trim();
      const amt = r.amount == null ? "" : `₹${str(r.amount).trim()}`;
      return join(who, amt);
    },
  },
};
