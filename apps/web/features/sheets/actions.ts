"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { sendMail } from "@/lib/email";
import { logSystemError } from "@/lib/system-errors";
import { createServiceClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env.server";
import { getSheetTableById } from "./queries";
import type { ColType } from "./types";

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
  await assertPermission("admin");

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
  const payload: Record<string, unknown> = { [args.column]: coerced };

  const { error } = await (supabase as any)
    .from(tbl.table)
    .update(payload)
    .eq(tbl.pk, args.rowKey);

  if (error) {
    console.error(`[sheets] update ${tbl.table}.${args.column}:`, error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/sheets");
  return { ok: true, value: coerced };
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
