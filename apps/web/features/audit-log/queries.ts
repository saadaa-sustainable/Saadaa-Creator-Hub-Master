import { createServiceClient } from "@/lib/supabase/server";
import type { AuditEntry, AuditLogData, AuditSource } from "./types";

/**
 * Audit Log data — merges CreatorHub's existing audit tables into one
 * reverse-chronological stream. Each source table is capped at PER_SOURCE rows
 * (well under the PostgREST cap) and merged in JS, newest first. Read-only.
 */

const PER_SOURCE = 500;

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const trim = (v: unknown, n = 120): string => {
  const s = str(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

/** "old → new", each side truncated, blanks shown as ∅. */
function diff(oldV: unknown, newV: unknown): string {
  const o = str(oldV).trim() || "∅";
  const n = str(newV).trim() || "∅";
  return `${o.length > 48 ? `${o.slice(0, 48)}…` : o} → ${n.length > 48 ? `${n.slice(0, 48)}…` : n}`;
}

/** Humanise a snake/camel action token: "role_change" → "Role change". */
function humanize(action: string): string {
  const s = action.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Changed";
}

export async function fetchAuditLogData(): Promise<AuditLogData> {
  const svc = createServiceClient() as any;

  const [cellEdits, comments, deletions, userLog, sysErrors, approvalLogs] =
    await Promise.all([
      svc
        .from("cell_edits")
        .select(
          "id, table_name, row_pk, column_key, old_value, new_value, edited_by, edited_at",
        )
        .order("edited_at", { ascending: false })
        .limit(PER_SOURCE),
      svc
        .from("cell_comments")
        .select(
          "id, table_id, row_pk, column_key, body, author_email, resolved, resolved_by, resolved_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE),
      svc
        .from("row_deletions")
        .select(
          "id, table_name, row_pk, deleted_by, deleted_at, restored_at, restored_by",
        )
        .order("deleted_at", { ascending: false })
        .limit(PER_SOURCE),
      svc
        .from("user_audit_log")
        .select(
          "id, actor_email, target_email, action, before_json, after_json, notes, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE),
      svc
        .from("system_errors")
        .select(
          "id, type, key, message, source, resolved, resolved_at, resolved_by, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE),
      svc
        .from("approval_logs")
        .select(
          "id, action_type, action, entity_id, version_id, admin_email, admin_name, notes, timestamp",
        )
        .order("timestamp", { ascending: false })
        .limit(PER_SOURCE),
    ]);

  const entries: AuditEntry[] = [];

  for (const r of (cellEdits.data ?? []) as Raw[]) {
    entries.push({
      id: `ce-${str(r.id)}`,
      source: "Sheet",
      at: (r.edited_at as string | null) ?? null,
      actor: str(r.edited_by) || "Someone",
      action: "Edited cell",
      target: `${str(r.table_name)} · ${str(r.column_key)}`,
      detail: diff(r.old_value, r.new_value),
      tone: "change",
    });
  }

  for (const r of (comments.data ?? []) as Raw[]) {
    const resolved = r.resolved === true || r.resolved_at != null;
    entries.push({
      id: `cc-${str(r.id)}`,
      source: "Sheet",
      at: ((resolved ? r.resolved_at : r.created_at) as string | null) ?? null,
      actor: str(resolved ? r.resolved_by : r.author_email) || "Someone",
      action: resolved ? "Resolved comment" : "Commented",
      target: `${str(r.table_id)} · ${str(r.column_key)}`,
      detail: trim(r.body),
      tone: resolved ? "resolve" : "neutral",
    });
  }

  for (const r of (deletions.data ?? []) as Raw[]) {
    const restored = r.restored_at != null;
    entries.push({
      id: `rd-${str(r.id)}`,
      source: "Sheet",
      at: ((restored ? r.restored_at : r.deleted_at) as string | null) ?? null,
      actor: str(restored ? r.restored_by : r.deleted_by) || "Someone",
      action: restored ? "Restored row" : "Deleted row",
      target: `${str(r.table_name)} · ${str(r.row_pk)}`,
      detail: restored ? "Row restored" : "Row soft-deleted",
      tone: restored ? "neutral" : "delete",
    });
  }

  for (const r of (userLog.data ?? []) as Raw[]) {
    const action = str(r.action);
    const lc = action.toLowerCase();
    const tone =
      lc.includes("deactivat") || lc.includes("remove") || lc.includes("revoke")
        ? "delete"
        : lc.includes("invit") || lc.includes("creat") || lc.includes("add")
          ? "create"
          : "change";
    entries.push({
      id: `usr-${str(r.id)}`,
      source: "User",
      at: (r.created_at as string | null) ?? null,
      actor: str(r.actor_email) || "Admin",
      action: humanize(action),
      target: str(r.target_email) || "—",
      detail: trim(r.notes) || jsonDelta(r.before_json, r.after_json),
      tone,
    });
  }

  for (const r of (sysErrors.data ?? []) as Raw[]) {
    const resolved = r.resolved === true;
    const type = str(r.type).toLowerCase();
    entries.push({
      id: `se-${str(r.id)}`,
      source: "System",
      at: ((resolved ? r.resolved_at : r.created_at) as string | null) ?? null,
      actor: str(r.source) || "System",
      action: resolved
        ? `Resolved ${str(r.type) || "error"}`
        : str(r.type) || "Error",
      target: str(r.key) || "—",
      detail: trim(r.message),
      tone: resolved ? "resolve" : type.includes("info") ? "neutral" : "delete",
    });
  }

  for (const r of (approvalLogs.data ?? []) as Raw[]) {
    const action = str(r.action);
    const lc = action.toLowerCase();
    const tone =
      lc.includes("reject") || lc.includes("close")
        ? "delete"
        : lc.includes("approv") || lc.includes("reopen")
          ? "resolve"
          : lc.includes("submit") || lc.includes("create")
            ? "create"
            : "change";
    entries.push({
      id: `ap-${str(r.id)}`,
      source: "Approval",
      at: (r.timestamp as string | null) ?? null,
      actor: str(r.admin_name) || str(r.admin_email) || "Admin",
      action: `${action} ${str(r.action_type) || "item"}`,
      target: str(r.entity_id) || "—",
      detail:
        trim(r.notes) || (r.version_id ? `Request #${str(r.version_id)}` : ""),
      tone,
    });
  }

  // Newest first across every source.
  entries.sort((a, b) => {
    const ta = a.at ? Date.parse(a.at) : 0;
    const tb = b.at ? Date.parse(b.at) : 0;
    return tb - ta;
  });

  const counts: Record<AuditSource, number> = {
    Sheet: 0,
    User: 0,
    System: 0,
    Approval: 0,
  };
  for (const e of entries) counts[e.source] += 1;

  return { entries, counts, total: entries.length };
}

/** Compact "k: a→b" summary of the first differing key between two json blobs. */
function jsonDelta(before: unknown, after: unknown): string {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  if (typeof a !== "object" || typeof b !== "object") return "";
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (str(a[k]) !== str(b[k])) return `${k}: ${diff(a[k], b[k])}`;
  }
  return "";
}
