"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { sendMail } from "@/lib/email";
import { logSystemError } from "@/lib/system-errors";
import { createServiceClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env.server";
import { fetchSheetPage, getSheetTableById, fetchSheetColumnOptions } from "./queries";
import {
  mergeColumns,
  type ColDef,
  type ColType,
  type SheetRow,
  type SheetTable,
} from "./types";

/**
 * Columns whose change is material enough to notify the creator + the
 * assigned/onboarding team member with a "revised details" email. Keyed on
 * the Supabase column key (matches across the posts / payments / creators
 * sheets). Non-critical edits get the "edited" badge only — no email.
 */
const CRITICAL_COLUMNS = new Set<string>([
  "order_status",
  "delivery_date",
  "est_delivery",
  "delivered_date",
  "commercial_amount",
  "email",
  "bank_name",
  "bank_number",
  "ifsc",
  "order_id",
]);

/**
 * Server action — writes a single cell back to Supabase. Admin-only.
 * Type-coerces the incoming string per the column definition (number,
 * date, bool, currency). Values that don't parse are rejected.
 */

function coerce(raw: string, type: ColType): unknown {
  const v = raw?.toString().trim() ?? "";
  if (v === "") return null;

  if (type === "number" || type === "currency") {
    const n = Number(v.replace(/[,\s₹$]/g, ""));
    return Number.isFinite(n) ? n : { error: "Invalid number" };
  }
  if (type === "bool") {
    if (v.toLowerCase() === "true" || v === "1") return true;
    if (v.toLowerCase() === "false" || v === "0") return false;
    return { error: "Use true/false" };
  }
  if (type === "date") {
    // accept YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: "Use YYYY-MM-DD" };
    return v;
  }
  if (type === "datetime") {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return { error: "Invalid datetime" };
    return d.toISOString();
  }
  // text / select / status — pass through
  return v;
}

export async function updateSheetCell(args: {
  tableId: string;
  rowKey: string;
  column: string;
  value: string;
}) {
  const actor = await assertPermission("admin");

  const tbl = getSheetTableById(args.tableId);
  if (!tbl) return { ok: false, error: "Unknown table" };

  const col = tbl.columns.find((c) => c.key === args.column);
  if (!col || col.editable !== true) {
    return { ok: false, error: "Column not editable" };
  }

  const coerced = coerce(args.value, col.type);
  if (coerced && typeof coerced === "object" && "error" in coerced) {
    return { ok: false, error: (coerced as { error: string }).error };
  }

  if (!args.rowKey) return { ok: false, error: "Row key missing" };

  const supabase = createServiceClient();

  // Snapshot the prior value (best-effort) so we can log the before/after and
  // skip a no-op email when nothing actually changed.
  let oldValue: unknown = null;
  try {
    const { data: before } = await (supabase as any)
      .from(tbl.table)
      .select(args.column)
      .eq(tbl.pk, args.rowKey)
      .maybeSingle();
    oldValue = before ? (before as Record<string, unknown>)[args.column] : null;
  } catch {
    // ignore — the edit still proceeds, we just won't have an old value
  }

  const payload: Record<string, unknown> = { [args.column]: coerced };

  const { error } = await (supabase as any)
    .from(tbl.table)
    .update(payload)
    .eq(tbl.pk, args.rowKey);

  if (error) {
    console.error(`[sheets] update ${tbl.table}.${args.column}:`, error);
    return { ok: false, error: error.message };
  }

  const changed = String(oldValue ?? "") !== String(coerced ?? "");

  // Record the edit for the "edited" badge. Fails soft — if the cell_edits
  // table doesn't exist yet (migration not applied), we log + swallow so the
  // cell write still succeeds.
  if (changed) {
    await recordCellEdit({
      sheetKey: args.tableId,
      tableName: tbl.table,
      rowPk: args.rowKey,
      columnKey: args.column,
      oldValue,
      newValue: coerced,
      editedBy: actor.email,
    });
  }

  // Revised-details email — only for critical columns that actually changed.
  // Fired non-blocking via after() so the cell update stays fast.
  if (changed && CRITICAL_COLUMNS.has(args.column)) {
    const editorName = actor.name ?? actor.email;
    const editorEmail = actor.email;
    after(async () => {
      await sendRevisedDetailsEmail({
        tbl,
        rowKey: args.rowKey,
        column: args.column,
        columnLabel: col.label,
        oldValue,
        newValue: coerced,
        editorName,
        editorEmail,
      });
    });
  }

  revalidatePath("/sheets");
  return { ok: true, value: coerced };
}

/**
 * Insert one audit row into cell_edits. Wrapped so a missing table (migration
 * not yet applied) or any insert error never throws into the edit path.
 */
async function recordCellEdit(args: {
  sheetKey: string;
  tableName: string;
  rowPk: string;
  columnKey: string;
  oldValue: unknown;
  newValue: unknown;
  editedBy: string;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const toText = (v: unknown) =>
      v == null ? null : typeof v === "string" ? v : String(v);
    const { error } = await (supabase as any).from("cell_edits").insert({
      sheet_key: args.sheetKey,
      table_name: args.tableName,
      row_pk: args.rowPk,
      column_key: args.columnKey,
      old_value: toText(args.oldValue),
      new_value: toText(args.newValue),
      edited_by: args.editedBy,
    });
    if (error) {
      // 42P01 = undefined_table (migration not applied) — silent, expected.
      if (error.code !== "42P01") {
        console.warn(`[sheets] cell_edits insert soft-failed:`, error.message);
      }
    }
  } catch (err) {
    console.warn(
      `[sheets] cell_edits insert threw:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Recent edits (default last 7 days) for a sheet, keyed `${rowPk}::${column}`.
 * Returns the LATEST edit per cell. Fails soft to an empty map when the table
 * is missing — the grid simply shows no badges.
 */
export interface RecentEdit {
  rowPk: string;
  columnKey: string;
  editedBy: string | null;
  editedAt: string;
}

export async function fetchRecentCellEdits(args: {
  tableId: string;
  withinDays?: number;
}): Promise<{ ok: true; edits: Record<string, RecentEdit> } | { ok: false; error: string }> {
  await assertPermission("admin");
  const days = args.withinDays ?? 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = createServiceClient();
    const { data, error } = await (supabase as any)
      .from("cell_edits")
      .select("row_pk, column_key, edited_by, edited_at")
      .eq("sheet_key", args.tableId)
      .gte("edited_at", since)
      .order("edited_at", { ascending: false });

    if (error) {
      // Missing table or any read error → no badges, app keeps working.
      return { ok: true, edits: {} };
    }

    const out: Record<string, RecentEdit> = {};
    for (const r of (data ?? []) as Array<{
      row_pk: string;
      column_key: string;
      edited_by: string | null;
      edited_at: string;
    }>) {
      const key = `${r.row_pk}::${r.column_key}`;
      // First seen wins because the query is ordered newest-first.
      if (!out[key]) {
        out[key] = {
          rowPk: r.row_pk,
          columnKey: r.column_key,
          editedBy: r.edited_by,
          editedAt: r.edited_at,
        };
      }
    }
    return { ok: true, edits: out };
  } catch {
    return { ok: true, edits: {} };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-mode CSV export — big tables never hold the full set client-side, so
// the export walks the FULL filtered/sorted set in Postgres (reusing the same
// sanitised search + whitelisted sort as fetchSheetPage) and returns the CSV
// string for the client to download. Admin-gated like every other action here.
// ─────────────────────────────────────────────────────────────────────────────

const EXPORT_PAGE_SIZE = 1000;
const EXPORT_MAX_ROWS = 50_000;

export async function exportSheetCsv(args: {
  tableId: string;
  q?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}): Promise<
  { ok: true; csv: string; rowCount: number } | { ok: false; error: string }
> {
  await assertPermission("admin");

  const tbl = getSheetTableById(args.tableId);
  if (!tbl) return { ok: false, error: "Unknown table" };

  const rows: SheetRow[] = [];
  let page = 0;
  for (;;) {
    const res = await fetchSheetPage(tbl.id, {
      q: args.q,
      sortKey: args.sortKey,
      sortDir: args.sortDir,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    });
    rows.push(...res.rows);
    if (res.rows.length < EXPORT_PAGE_SIZE) break;
    if (rows.length >= Math.min(res.rowCount, EXPORT_MAX_ROWS)) break;
    page += 1;
  }
  if (rows.length > EXPORT_MAX_ROWS) rows.length = EXPORT_MAX_ROWS;

  // Same column set the grid renders by default: curated + discovered extras,
  // minus hidden and virtual (virtual values only resolve client-side).
  const cols = mergeColumns(tbl.columns, rows).filter(
    (c) => !c.hidden && !c.virtual,
  );
  return { ok: true, csv: buildCsv(cols, rows), rowCount: rows.length };
}

/** Mirrors the client-side toCsv escaping (sheet-grid.tsx). */
function buildCsv(cols: ColDef[], rows: SheetRow[]): string {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = cols.map((c) => esc(c.label)).join(",");
  const lines = rows.map((r) => cols.map((c) => esc(r[c.key])).join(","));
  return [header, ...lines].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Row delete + restore — Global-Admin only, hard delete with a recoverable
// snapshot written to `row_deletions`. Postgres FK constraints are the
// integrity guardrail: a delete that would orphan data throws 23503 and is
// surfaced as a friendly "still referenced by …" message instead of cascading.
// ─────────────────────────────────────────────────────────────────────────────

/** Generated columns that cannot be written back on restore (stripped). */
const NON_RESTORABLE_COLUMNS: Record<string, string[]> = {
  campaign_budget: ["est_garment_cost", "total_cost", "total_with_garments"],
};

/** Friendly labels for child tables surfaced in FK-violation messages. */
const CHILD_TABLE_LABELS: Record<string, string> = {
  posts: "posts",
  payments: "payments",
  campaign_budget: "budget rows",
  cell_comments: "cell comments",
};

function friendlyDeleteError(error: {
  code?: string;
  message?: string;
  details?: string;
}): string {
  if (error?.code === "23503") {
    const m = (error.details ?? "").match(/referenced from table "([^"]+)"/);
    const child = m?.[1];
    const label = child ? (CHILD_TABLE_LABELS[child] ?? child) : null;
    return label
      ? `Still referenced by ${label} — delete those first.`
      : "Still referenced by other rows — delete those first.";
  }
  return error?.message ?? "Delete failed";
}

export interface DeleteRowsResult {
  ok: boolean;
  deleted: string[];
  /** Deletion-log ids for the rows just removed (drives the Undo toast). */
  deletionIds: number[];
  blocked: Array<{ rowKey: string; reason: string }>;
  error?: string;
}

/**
 * Hard-delete one or more rows by primary key. Global-Admin only. Each row is
 * snapshotted to `row_deletions` before removal so it can be restored. Rows
 * blocked by FK constraints are reported per-row, never aborting the batch.
 */
export async function deleteSheetRows(args: {
  tableId: string;
  rowKeys: string[];
}): Promise<DeleteRowsResult> {
  const actor = await assertPermission("admin");

  const tbl = getSheetTableById(args.tableId);
  if (!tbl) {
    return { ok: false, deleted: [], deletionIds: [], blocked: [], error: "Unknown table" };
  }
  if (!tbl.deletable) {
    return {
      ok: false,
      deleted: [],
      deletionIds: [],
      blocked: [],
      error: "Deleting rows is not allowed on this tab",
    };
  }

  const keys = Array.from(
    new Set((args.rowKeys ?? []).map((k) => String(k)).filter((k) => k.length > 0)),
  );
  if (keys.length === 0) {
    return { ok: false, deleted: [], deletionIds: [], blocked: [], error: "No rows selected" };
  }
  if (keys.length > 500) {
    return {
      ok: false,
      deleted: [],
      deletionIds: [],
      blocked: [],
      error: "Too many rows in one delete (max 500)",
    };
  }

  const supabase = createServiceClient();
  const deleted: string[] = [];
  const deletionIds: number[] = [];
  const blocked: DeleteRowsResult["blocked"] = [];

  for (const rowKey of keys) {
    // Snapshot first so we can restore, and so a vanished row is reported
    // rather than silently "succeeding".
    let snapshot: Record<string, unknown> | null = null;
    try {
      const { data } = await (supabase as any)
        .from(tbl.table)
        .select("*")
        .eq(tbl.pk, rowKey)
        .maybeSingle();
      snapshot = (data ?? null) as Record<string, unknown> | null;
    } catch {
      // fall through — delete still attempted, just without a snapshot
    }

    if (!snapshot) {
      blocked.push({ rowKey, reason: "Row no longer exists" });
      continue;
    }

    const { error } = await (supabase as any)
      .from(tbl.table)
      .delete()
      .eq(tbl.pk, rowKey);

    if (error) {
      blocked.push({ rowKey, reason: friendlyDeleteError(error) });
      continue;
    }

    deleted.push(rowKey);

    // Write the restore log. Best-effort: a log failure never un-deletes, but
    // we surface it so a missing audit row is noticed.
    try {
      const { data: logRow, error: logErr } = await (supabase as any)
        .from("row_deletions")
        .insert({
          sheet_key: tbl.id,
          table_name: tbl.table,
          row_pk: rowKey,
          pk_column: tbl.pk,
          row_data: snapshot,
          deleted_by: actor.email,
        })
        .select("id")
        .single();
      if (logErr) {
        console.warn(`[sheets] row_deletions log failed for ${tbl.table}.${rowKey}:`, logErr.message);
      } else if (logRow?.id != null) {
        deletionIds.push(Number(logRow.id));
      }
    } catch (err) {
      console.warn(
        `[sheets] row_deletions log threw for ${tbl.table}.${rowKey}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  revalidatePath("/sheets");
  return { ok: deleted.length > 0, deleted, deletionIds, blocked };
}

export interface DeletionLogRow {
  id: number;
  sheetKey: string;
  rowPk: string;
  deletedBy: string;
  deletedAt: string;
  restoredAt: string | null;
  /** A human label for the row — best-guess from common identifier columns. */
  preview: string;
}

/**
 * Recent deletions for a tab (default last 30 days), newest first. Powers the
 * "Recently deleted" history popover. Restored entries are included but flagged.
 */
export async function fetchRecentDeletions(args: {
  tableId: string;
  withinDays?: number;
}): Promise<{ ok: true; deletions: DeletionLogRow[] } | { ok: false; error: string }> {
  await assertPermission("admin");
  const days = args.withinDays ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = createServiceClient();
    const { data, error } = await (supabase as any)
      .from("row_deletions")
      .select("id, sheet_key, row_pk, row_data, deleted_by, deleted_at, restored_at")
      .eq("sheet_key", args.tableId)
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false })
      .limit(200);

    if (error) return { ok: true, deletions: [] };

    const deletions: DeletionLogRow[] = ((data ?? []) as Array<{
      id: number;
      sheet_key: string;
      row_pk: string;
      row_data: Record<string, unknown>;
      deleted_by: string;
      deleted_at: string;
      restored_at: string | null;
    }>).map((r) => ({
      id: Number(r.id),
      sheetKey: r.sheet_key,
      rowPk: r.row_pk,
      deletedBy: r.deleted_by,
      deletedAt: r.deleted_at,
      restoredAt: r.restored_at,
      preview: previewFromSnapshot(r.row_data, r.row_pk),
    }));
    return { ok: true, deletions };
  } catch {
    return { ok: true, deletions: [] };
  }
}

function previewFromSnapshot(
  row: Record<string, unknown> | null,
  fallback: string,
): string {
  if (!row) return fallback;
  const pick = (k: string) => {
    const v = row[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const name = pick("username") ?? pick("campaign_name") ?? pick("inf_name") ?? pick("name");
  return name ? `${fallback} · ${name}` : fallback;
}

/**
 * Restore previously deleted rows from the log by re-inserting the snapshot.
 * Generated columns are stripped. Idempotent — already-restored entries skip.
 */
export async function restoreDeletedRows(args: {
  deletionIds: number[];
}): Promise<{ ok: boolean; restored: number; failed: number; error?: string }> {
  const actor = await assertPermission("admin");

  const ids = Array.from(
    new Set((args.deletionIds ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n))),
  );
  if (ids.length === 0) return { ok: false, restored: 0, failed: 0, error: "Nothing to restore" };

  const supabase = createServiceClient();
  const { data: logs, error } = await (supabase as any)
    .from("row_deletions")
    .select("id, table_name, row_data, restored_at")
    .in("id", ids);

  if (error) return { ok: false, restored: 0, failed: 0, error: error.message };

  let restored = 0;
  let failed = 0;

  for (const log of (logs ?? []) as Array<{
    id: number;
    table_name: string;
    row_data: Record<string, unknown>;
    restored_at: string | null;
  }>) {
    if (log.restored_at) continue; // already restored — skip

    const strip = NON_RESTORABLE_COLUMNS[log.table_name] ?? [];
    const payload: Record<string, unknown> = { ...log.row_data };
    for (const k of strip) delete payload[k];

    // upsert so re-creating the original pk is tolerant of a row that came back
    const { error: insErr } = await (supabase as any)
      .from(log.table_name)
      .upsert(payload);

    if (insErr) {
      console.warn(`[sheets] restore failed for deletion ${log.id}:`, insErr.message);
      failed++;
      continue;
    }

    await (supabase as any)
      .from("row_deletions")
      .update({ restored_at: new Date().toISOString(), restored_by: actor.email })
      .eq("id", log.id);
    restored++;
  }

  revalidatePath("/sheets");
  return { ok: restored > 0, restored, failed };
}

/**
 * Resolve recipients + send the "revised details" email. Recipients are the
 * creator's email and the post's onboarded_by user. Both are best-effort: a
 * missing recipient is skipped, never fatal. Reuses the same sendMail Gmail
 * SMTP path as the comment-mention fanout and logs to email_logs.
 */
async function sendRevisedDetailsEmail(args: {
  tbl: SheetTable;
  rowKey: string;
  column: string;
  columnLabel: string;
  oldValue: unknown;
  newValue: unknown;
  editorName: string;
  editorEmail: string;
}): Promise<void> {
  const source = `sheets/${args.tbl.id}/${args.rowKey}/${args.column}`;

  if (!serverEnv.EMAIL_USER || !serverEnv.EMAIL_PASS) {
    await logSystemError({
      type: "sheet_revision_email",
      key: args.rowKey,
      message: "EMAIL_USER/EMAIL_PASS not configured — revised-details email skipped",
      source,
    });
    return;
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return;
  }

  // Resolve the underlying row to find the creator + assigned user. The link
  // path depends on which sheet was edited; we read whatever identifiers the
  // row carries (username / inf_id / onboarded_by) and look up the creator.
  let creatorEmail: string | null = null;
  let assignedEmail: string | null = null;
  let creatorName: string | null = null;
  let postId: string | null = null;
  let collabId: string | null = null;

  try {
    const { data: row } = await (supabase as any)
      .from(args.tbl.table)
      .select("*")
      .eq(args.tbl.pk, args.rowKey)
      .maybeSingle();

    const r = (row ?? {}) as Record<string, unknown>;
    const asStr = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    // Direct email column (creators sheet, or any row carrying email).
    creatorEmail = asStr(r["email"]);
    assignedEmail = asStr(r["onboarded_by"]);
    postId = asStr(r["post_id"]);
    collabId = asStr(r["partnership_id"]);

    // If no direct email, resolve the creator via username / inf_id.
    if (!creatorEmail || !creatorName) {
      const username = asStr(r["username"]);
      const infId = asStr(r["inf_id"]);
      if (username || infId) {
        let cq = (supabase as any).from("creators").select("email, inf_name");
        cq = username ? cq.eq("username", username) : cq.eq("inf_id", infId);
        const { data: creator } = await cq.maybeSingle();
        const cr = (creator ?? {}) as Record<string, unknown>;
        creatorEmail = creatorEmail ?? asStr(cr["email"]);
        creatorName = asStr(cr["inf_name"]);
      }
    }
  } catch {
    // best-effort — fall through with whatever we resolved
  }

  const recipients = Array.from(
    new Set(
      [creatorEmail, assignedEmail]
        .filter((e): e is string => !!e && e.includes("@"))
        .map((e) => e.toLowerCase()),
    ),
  );

  if (recipients.length === 0) {
    await logSystemError({
      type: "sheet_revision_email",
      key: args.rowKey,
      message: `No resolvable recipient for revised ${args.column} on ${args.tbl.id}`,
      source,
    });
    return;
  }

  const subject = `Updated details · ${args.columnLabel}${
    collabId ? ` · ${collabId}` : postId ? ` · ${postId}` : ""
  }`;
  const linkPath = `/sheets?tab=${encodeURIComponent(args.tbl.id)}`;
  const safeLabel = escapeHtml(args.columnLabel);
  const safeOld = escapeHtml(String(args.oldValue ?? "—"));
  const safeNew = escapeHtml(String(args.newValue ?? "—"));
  const safeEditor = escapeHtml(args.editorName);
  const safeGreeting = escapeHtml(creatorName ?? "there");

  const htmlBody = `
    <div style="font-family:Inter,Arial,sans-serif;color:#161513;background:#FAF8F5;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E2D2;border-radius:14px;padding:24px;">
        <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9A9384;font-weight:800;">
          Revised Details
        </p>
        <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:800;color:#161513;">
          Hi ${safeGreeting}, a detail on your collaboration was updated
        </h2>
        <p style="margin:0 0 12px 0;font-size:14px;color:#6E695E;">
          The following has been revised by our team:
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px 0;">
          <tr>
            <td style="padding:8px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-radius:8px 0 0 8px;font-weight:800;color:#161513;width:40%;">
              ${safeLabel}
            </td>
            <td style="padding:8px 10px;border:1px solid #E7E2D2;border-left:0;border-radius:0 8px 8px 0;color:#161513;">
              <span style="color:#9A9384;text-decoration:line-through;">${safeOld}</span>
              &nbsp;→&nbsp;
              <strong style="color:#4F7C4D;">${safeNew}</strong>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0 0;font-size:12px;color:#9A9384;">
          Updated by ${safeEditor}. If this looks wrong, just reply to this email.
        </p>
        <p style="margin:14px 0 0 0;font-size:11px;color:#9A9384;">
          CreatorHub Sheet View · path
          <code style="background:#F5F1EC;padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;">${linkPath}</code>
        </p>
      </div>
    </div>
  `;

  const plainBody =
    `Hi ${creatorName ?? "there"},\n\n` +
    `A detail on your collaboration was revised by our team:\n\n` +
    `${args.columnLabel}: ${String(args.oldValue ?? "—")} -> ${String(args.newValue ?? "—")}\n\n` +
    `Updated by ${args.editorName}. If this looks wrong, just reply to this email.`;

  await Promise.all(
    recipients.map(async (to) => {
      try {
        const res = await sendMail({
          to,
          subject,
          htmlBody,
          plainBody,
          replyTo: args.editorEmail,
        });
        await (supabase as any).from("email_logs").insert({
          post_id: postId,
          collab_id: collabId,
          sent_to: to,
          subject,
          email_type: "sheet_revision",
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : (res.error ?? "unknown"),
        });
        if (!res.ok) {
          await logSystemError({
            type: "sheet_revision_email",
            key: to,
            message: res.error ?? "sendMail returned ok:false",
            source,
          });
        }
      } catch (err) {
        await logSystemError({
          type: "sheet_revision_email",
          key: to,
          message: err instanceof Error ? err.message : String(err),
          source,
        });
      }
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell comments — Google Sheets style threads with @-mentions
// ─────────────────────────────────────────────────────────────────────────────

export interface CellCommentRow {
  id: number;
  table_id: string;
  row_pk: string;
  column_key: string;
  body: string;
  mentions: string[];
  author_email: string;
  author_name: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const MENTION_RE = /@([A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function extractMentions(body: string): string[] {
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body)) !== null) {
    seen.add(m[1].toLowerCase());
  }
  return Array.from(seen);
}

export async function fetchCellComments(args: {
  tableId: string;
  cells?: Array<{ rowKey: string; column: string }>;
}): Promise<{ ok: true; comments: CellCommentRow[] } | { ok: false; error: string }> {
  await assertPermission("admin");
  const supabase = createServiceClient();

  let q = (supabase as any)
    .from("cell_comments")
    .select(
      "id, table_id, row_pk, column_key, body, mentions, author_email, resolved, resolved_by, resolved_at, created_at, updated_at",
    )
    .eq("table_id", args.tableId)
    .order("created_at", { ascending: true });

  if (args.cells && args.cells.length > 0) {
    const rowKeys = Array.from(new Set(args.cells.map((c) => c.rowKey)));
    const colKeys = Array.from(new Set(args.cells.map((c) => c.column)));
    q = q.in("row_pk", rowKeys).in("column_key", colKeys);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const authors = Array.from(
    new Set(((data ?? []) as Array<{ author_email: string }>).map((c) => c.author_email)),
  );
  const nameByEmail = new Map<string, string>();
  if (authors.length > 0) {
    const { data: users } = await (supabase as any)
      .from("user_access")
      .select("email, name")
      .in("email", authors);
    for (const u of (users ?? []) as Array<{ email: string; name: string | null }>) {
      nameByEmail.set(u.email.toLowerCase(), u.name ?? "");
    }
  }

  const comments = ((data ?? []) as Array<Omit<CellCommentRow, "author_name">>).map(
    (c) => ({ ...c, author_name: nameByEmail.get(c.author_email.toLowerCase()) ?? null }),
  );
  return { ok: true, comments };
}

export async function postCellComment(args: {
  tableId: string;
  rowKey: string;
  column: string;
  body: string;
}): Promise<{ ok: true; comment: CellCommentRow } | { ok: false; error: string }> {
  const actor = await assertPermission("admin");

  const body = args.body.trim();
  if (!body) return { ok: false, error: "Comment cannot be empty" };
  if (body.length > 2000) return { ok: false, error: "Comment too long (max 2000)" };

  const tbl = getSheetTableById(args.tableId);
  if (!tbl) return { ok: false, error: "Unknown table" };

  const mentions = extractMentions(body);
  const supabase = createServiceClient();

  // Reject mentions that don't resolve to active users so we don't pile up
  // dead references. Silent drop is friendlier than hard-fail.
  let validMentions: string[] = [];
  if (mentions.length > 0) {
    const { data: known } = await (supabase as any)
      .from("user_access")
      .select("email")
      .in("email", mentions);
    validMentions = ((known ?? []) as Array<{ email: string }>).map((r) =>
      r.email.toLowerCase(),
    );
  }

  const { data, error } = await (supabase as any)
    .from("cell_comments")
    .insert({
      table_id: args.tableId,
      row_pk: args.rowKey,
      column_key: args.column,
      body,
      mentions: validMentions,
      author_email: actor.email,
    })
    .select(
      "id, table_id, row_pk, column_key, body, mentions, author_email, resolved, resolved_by, resolved_at, created_at, updated_at",
    )
    .single();

  if (error) return { ok: false, error: error.message };

  // @-mention email fanout via the same Gmail SMTP path used by
  // sendCollabEmail. We INCLUDE self-mentions (so authors can test their
  // own setup). Awaiting (not fire-and-forget) so errors surface in
  // system_errors and the function doesn't get reaped before the SMTP
  // socket completes in serverless runtimes.
  if (validMentions.length > 0) {
    if (!serverEnv.EMAIL_USER || !serverEnv.EMAIL_PASS) {
      await logSystemError({
        type: "comment_mention_email",
        key: validMentions.join(","),
        message: "EMAIL_USER/EMAIL_PASS not configured — mention email skipped",
        source: `sheets/${args.tableId}/${args.rowKey}/${args.column}`,
      });
    } else {
      await sendMentionEmails({
        recipients: validMentions,
        authorName: actor.name ?? actor.email,
        authorEmail: actor.email,
        tableId: args.tableId,
        rowKey: args.rowKey,
        column: args.column,
        body,
      });
    }
  }

  revalidatePath("/sheets");
  return {
    ok: true,
    comment: { ...(data as Omit<CellCommentRow, "author_name">), author_name: actor.name ?? null },
  };
}

async function sendMentionEmails(args: {
  recipients: string[];
  authorName: string;
  authorEmail: string;
  tableId: string;
  rowKey: string;
  column: string;
  body: string;
}): Promise<void> {
  const tab = args.tableId;
  const linkPath = `/sheets?tab=${encodeURIComponent(tab)}`;
  const subject = `${args.authorName} mentioned you in Sheet View · ${tab}`;
  const safeBody = escapeHtml(args.body).replace(/\n/g, "<br/>");
  const safeAuthor = escapeHtml(args.authorName);
  const safeRow = escapeHtml(args.rowKey);
  const safeCol = escapeHtml(args.column);
  const safeTab = escapeHtml(tab);

  const htmlBody = `
    <div style="font-family:Inter,Arial,sans-serif;color:#161513;background:#FAF8F5;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E2D2;border-radius:14px;padding:24px;">
        <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9A9384;font-weight:800;">
          Sheet View · ${safeTab}
        </p>
        <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:800;color:#161513;">
          ${safeAuthor} tagged you in a comment
        </h2>
        <p style="margin:0 0 6px 0;font-size:13px;color:#6E695E;">
          <strong>Row:</strong> ${safeRow}<br/>
          <strong>Column:</strong> ${safeCol}
        </p>
        <blockquote style="margin:14px 0;padding:12px 14px;border-left:3px solid #F0C61E;background:#FAF1DC;border-radius:8px;font-size:14px;color:#161513;">
          ${safeBody}
        </blockquote>
        <p style="margin:14px 0 0 0;font-size:12px;color:#9A9384;">
          Open CreatorHub → Sheet View tab "${safeTab}" to reply. Path:
          <code style="background:#F5F1EC;padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;">${linkPath}</code>
        </p>
        <p style="margin:24px 0 0 0;font-size:11px;color:#9A9384;">
          You're receiving this because ${safeAuthor} (${escapeHtml(args.authorEmail)}) tagged your email in a Sheet View comment.
        </p>
      </div>
    </div>
  `;

  const plainBody =
    `${args.authorName} tagged you in a Sheet View comment.\n\n` +
    `Sheet: ${tab}\nRow: ${args.rowKey}\nColumn: ${args.column}\n\n` +
    `Comment:\n${args.body}\n\n` +
    `Open CreatorHub → Sheet View tab "${tab}" to reply.`;

  await Promise.all(
    args.recipients.map(async (to) => {
      try {
        const res = await sendMail({
          to,
          subject,
          htmlBody,
          plainBody,
          replyTo: args.authorEmail,
        });
        if (!res.ok) {
          await logSystemError({
            type: "comment_mention_email",
            key: to,
            message: res.error ?? "sendMail returned ok:false",
            source: `sheets/${tab}/${args.rowKey}/${args.column}`,
          });
        }
      } catch (err) {
        await logSystemError({
          type: "comment_mention_email",
          key: to,
          message: err instanceof Error ? err.message : String(err),
          source: `sheets/${tab}/${args.rowKey}/${args.column}`,
        });
      }
    }),
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function resolveCellComment(args: {
  id: number;
  resolved: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await assertPermission("admin");
  const supabase = createServiceClient();

  const patch: Record<string, unknown> = {
    resolved: args.resolved,
    resolved_by: args.resolved ? actor.email : null,
    resolved_at: args.resolved ? new Date().toISOString() : null,
  };

  const { error } = await (supabase as any)
    .from("cell_comments")
    .update(patch)
    .eq("id", args.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/sheets");
  return { ok: true };
}

export async function deleteCellComment(args: {
  id: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await assertPermission("admin");
  const supabase = createServiceClient();

  // Only the author can delete their own comment.
  const { data: existing } = await (supabase as any)
    .from("cell_comments")
    .select("author_email")
    .eq("id", args.id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Comment not found" };
  if ((existing.author_email as string).toLowerCase() !== actor.email.toLowerCase()) {
    return { ok: false, error: "Only the author can delete this comment" };
  }

  const { error } = await (supabase as any)
    .from("cell_comments")
    .delete()
    .eq("id", args.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/sheets");
  return { ok: true };
}

export async function fetchMentionCandidates(args: {
  query?: string;
}): Promise<{ ok: true; users: Array<{ email: string; name: string | null; role: string | null }> } | { ok: false; error: string }> {
  await assertPermission("admin");
  const supabase = createServiceClient();

  let q = (supabase as any)
    .from("user_access")
    .select("email, name, role, active")
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(50);

  if (args.query && args.query.trim()) {
    const needle = args.query.trim().replace(/[%_]/g, "");
    q = q.or(`email.ilike.%${needle}%,name.ilike.%${needle}%`);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    users: ((data ?? []) as Array<{ email: string; name: string | null; role: string | null; active: boolean }>).map(
      (u) => ({ email: u.email, name: u.name, role: u.role }),
    ),
  };
}

/** Whole-table distinct values for one column — funnel menu on server tabs. */
export async function sheetColumnOptions(
  tableId: string,
  colKey: string,
  opts: { q?: string; filters?: string; tint?: string } = {},
): Promise<Array<{ value: string; count: number }>> {
  await assertPermission("sheet_view");
  return fetchSheetColumnOptions(tableId, colKey, opts);
}
