"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AtSign,
  CheckCircle2,
  Inbox,
  MessageSquare,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { CellCommentRow } from "./actions";

export interface FlatComment extends CellCommentRow {
  rowKey: string;
  column: string;
  columnLabel: string;
}

/**
 * All-comments panel for a Sheet View table — a table-wide roll-up of every cell
 * comment, split into Open / Resolved tabs (mirrors the DAM project). Each entry
 * shows its Row · Column, can be resolved/reopened in place, and clicking it
 * opens that cell's thread. Comments come from the grid's already-loaded map, so
 * no extra fetch.
 */
export function AllCommentsPanel({
  comments,
  currentUserEmail,
  pending,
  onResolveToggle,
  onOpenCell,
  onClose,
}: {
  comments: FlatComment[];
  currentUserEmail: string | null;
  pending: boolean;
  onResolveToggle: (c: FlatComment, resolved: boolean) => void;
  onOpenCell: (rowKey: string, column: string, label: string) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { open, resolved } = useMemo(() => {
    const byTime = (a: FlatComment, b: FlatComment) =>
      Date.parse(b.created_at) - Date.parse(a.created_at);
    return {
      open: comments.filter((c) => !c.resolved).sort(byTime),
      resolved: comments.filter((c) => c.resolved).sort(byTime),
    };
  }, [comments]);

  const shown = tab === "open" ? open : resolved;
  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding" onClick={onClose}>
      <div
        className="modal-panel modal-panel--onboarding ob-overview-modal"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={16} aria-hidden />
            <h2 className="font-semibold">All comments</h2>
            <span className="chip text-[10px] tabular">{comments.length}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="modal-body ob-overview-body" style={{ gap: 12 }}>
          {/* Open / Resolved tabs */}
          <div
            role="tablist"
            className="inline-flex gap-1 rounded-[9px] border border-border bg-bg-white p-0.5 self-start"
          >
            {(["open", "resolved"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "rounded-[7px] px-2.5 py-1 text-[0.72rem] font-semibold capitalize transition-colors",
                  tab === k
                    ? "bg-text-primary text-bg-white"
                    : "text-text-secondary hover:bg-bg-alt",
                )}
              >
                {k} {k === "open" ? open.length : resolved.length}
              </button>
            ))}
          </div>

          <div
            className="flex flex-col gap-2"
            style={{ maxHeight: 420, overflowY: "auto" }}
          >
            {shown.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-text-tertiary">
                <Inbox size={24} aria-hidden />
                <p className="text-[0.8rem] font-medium text-text-primary">
                  {tab === "open" ? "No open comments" : "No resolved comments"}
                </p>
              </div>
            ) : (
              shown.map((c) => (
                <CommentCard
                  key={c.id}
                  c={c}
                  currentUserEmail={currentUserEmail}
                  pending={pending}
                  onResolveToggle={onResolveToggle}
                  onOpen={() => onOpenCell(c.rowKey, c.column, c.columnLabel)}
                />
              ))
            )}
          </div>
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function CommentCard({
  c,
  currentUserEmail,
  pending,
  onResolveToggle,
  onOpen,
}: {
  c: FlatComment;
  currentUserEmail: string | null;
  pending: boolean;
  onResolveToggle: (c: FlatComment, resolved: boolean) => void;
  onOpen: () => void;
}) {
  const initial = (c.author_name ?? c.author_email).slice(0, 1).toUpperCase();
  return (
    <div className="rounded-[12px] border border-border bg-bg-white p-3 transition-colors hover:bg-bg-alt/40">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.66rem] font-extrabold"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #E0B41A 100%)",
              color: "var(--color-text-primary)",
            }}
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.76rem] font-bold text-text-primary">
              {c.author_name ?? c.author_email}
            </p>
            <p className="mt-0.5 truncate font-mono text-[0.62rem] text-text-tertiary">
              Row {c.rowKey} · {c.columnLabel}
            </p>
          </div>
        </button>
        <time className="shrink-0 text-[0.62rem] tabular text-text-tertiary">
          {formatRelative(c.created_at)}
        </time>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words pl-9 text-[0.78rem] leading-relaxed text-text-primary">
        {renderBody(c.body)}
      </p>

      <div className="mt-2 flex items-center gap-2 pl-9">
        {c.resolved ? (
          <>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold"
              style={{
                background: "rgba(79,124,77,0.16)",
                color: "var(--color-success-text, #4F7C4D)",
                border: "1px solid rgba(79,124,77,0.3)",
              }}
            >
              <CheckCircle2 size={9} aria-hidden /> Resolved
              {c.resolved_by && <span className="opacity-75">· {c.resolved_by}</span>}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => onResolveToggle(c, false)}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-bg-white px-2 py-1 text-[0.66rem] font-semibold text-text-secondary transition-colors hover:bg-bg-alt"
            >
              <RotateCcw size={10} aria-hidden /> Reopen
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => onResolveToggle(c, true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-bg-white px-2 py-1 text-[0.66rem] font-semibold text-success-text transition-colors hover:bg-success-bg/50"
          >
            <CheckCircle2 size={10} aria-hidden /> Resolve
          </button>
        )}
      </div>
    </div>
  );
}

function renderBody(body: string) {
  const re = /@([A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const parts: Array<string | { m: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push({ m: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <span
        key={i}
        className="inline-flex items-center gap-0.5 rounded px-1 font-bold"
        style={{ background: "rgba(240,198,30,0.16)", color: "var(--color-text-primary)" }}
      >
        <AtSign size={9} aria-hidden /> {p.m}
      </span>
    ),
  );
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(then).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
