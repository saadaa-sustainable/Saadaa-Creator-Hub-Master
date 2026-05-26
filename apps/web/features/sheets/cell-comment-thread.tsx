"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AtSign,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import {
  deleteCellComment,
  fetchMentionCandidates,
  postCellComment,
  resolveCellComment,
  type CellCommentRow,
} from "./actions";

interface Props {
  tableId: string;
  rowKey: string;
  column: string;
  cellLabel: string;
  currentUserEmail: string | null;
  initialComments: CellCommentRow[];
  onClose: () => void;
  onChange?: (comments: CellCommentRow[]) => void;
}

export function CellCommentThread({
  tableId,
  rowKey,
  column,
  cellLabel,
  currentUserEmail,
  initialComments,
  onClose,
  onChange,
}: Props) {
  const [comments, setComments] = useState<CellCommentRow[]>(initialComments);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCandidates, setMentionCandidates] = useState<
    Array<{ email: string; name: string | null; role: string | null }>
  >([]);
  const [mentionAnchor, setMentionAnchor] = useState(0);

  useEffect(() => setMounted(true), []);

  // Lock body scroll while open (matches accounts-overview-modal pattern).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Sync from props once on mount only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setComments(initialComments), []);

  // Notify parent only on real local changes — ref-stored callback so a new
  // parent closure on every render doesn't trigger an infinite update loop.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onChangeRef.current?.(comments);
  }, [comments]);

  useEffect(() => {
    if (!mentionOpen) return;
    let cancelled = false;
    (async () => {
      const res = await fetchMentionCandidates({ query: mentionQuery });
      if (cancelled || !res.ok) return;
      setMentionCandidates(res.users);
    })();
    return () => {
      cancelled = true;
    };
  }, [mentionOpen, mentionQuery]);

  const onDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft(value);
    const caret = event.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const atMatch = /(?:^|\s)@([A-Za-z0-9_.+@-]*)$/.exec(before);
    if (atMatch) {
      setMentionAnchor(caret - atMatch[1].length);
      setMentionQuery(atMatch[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (email: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const before = draft.slice(0, mentionAnchor);
    const afterAnchor = draft.slice(mentionAnchor);
    const restMatch = /^[A-Za-z0-9_.+@-]*/.exec(afterAnchor);
    const consumed = restMatch ? restMatch[0].length : 0;
    const after = afterAnchor.slice(consumed);
    const next = `${before}${email} ${after}`;
    setDraft(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      const caret = before.length + email.length + 1;
      el.setSelectionRange(caret, caret);
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await postCellComment({ tableId, rowKey, column, body });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setComments((prev) => [...prev, res.comment]);
      setDraft("");
      setMentionOpen(false);
    });
  };

  const toggleResolved = (comment: CellCommentRow) => {
    startTransition(async () => {
      const res = await resolveCellComment({
        id: comment.id,
        resolved: !comment.resolved,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                resolved: !comment.resolved,
                resolved_by: !comment.resolved
                  ? (currentUserEmail ?? c.resolved_by)
                  : null,
                resolved_at: !comment.resolved
                  ? new Date().toISOString()
                  : null,
              }
            : c,
        ),
      );
    });
  };

  const removeComment = (comment: CellCommentRow) => {
    if (!window.confirm("Delete this comment?")) return;
    startTransition(async () => {
      const res = await deleteCellComment({ id: comment.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    });
  };

  const sorted = useMemo(
    () =>
      [...comments].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [comments],
  );

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding" onClick={onClose}>
      <form
        className="modal-panel modal-panel--onboarding ob-overview-modal"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={16} aria-hidden />
            <h2 className="font-semibold">Comments</h2>
            {sorted.length > 0 && (
              <span className="chip text-[10px] tabular">
                {sorted.length}
              </span>
            )}
            <span className="chip text-[10px] tabular truncate max-w-[200px]">
              {cellLabel}
            </span>
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

        <div className="modal-body ob-overview-body" style={{ gap: 14 }}>
          <p className="text-[0.62rem] text-text-tertiary tabular truncate">
            <code className="font-mono bg-bg-muted px-1.5 py-0.5 rounded">
              {rowKey}
            </code>
            <span className="opacity-60 mx-1">·</span>
            <code className="font-mono bg-bg-muted px-1.5 py-0.5 rounded">
              {column}
            </code>
          </p>

          {/* Thread list */}
          <div className="space-y-3" style={{ maxHeight: 340, overflowY: "auto" }}>
            {sorted.length === 0 && (
              <div className="text-center py-8 px-4">
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border mb-3"
                  style={{
                    background: "rgba(240,198,30,0.12)",
                    borderColor: "rgba(240,198,30,0.35)",
                  }}
                >
                  <MessageSquare
                    size={18}
                    className="text-[--accent]"
                    aria-hidden
                  />
                </span>
                <p className="text-[0.85rem] font-extrabold text-text-primary mb-1">
                  Start a thread
                </p>
                <p className="text-[0.7rem] text-text-tertiary leading-relaxed max-w-[280px] mx-auto">
                  Leave a note, ask a question, or tag a teammate with{" "}
                  <code className="font-mono bg-bg-muted px-1 rounded">@email</code>
                  . Mentioned users get an email.
                </p>
              </div>
            )}
            {sorted.map((c) => (
              <CommentBubble
                key={c.id}
                comment={c}
                currentUserEmail={currentUserEmail}
                onToggleResolved={() => toggleResolved(c)}
                onDelete={() => removeComment(c)}
                pending={pending}
              />
            ))}
          </div>

          {/* Composer — sits inside body so footer stays buttons-only */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={3}
              value={draft}
              onChange={onDraftChange}
              placeholder="Add a comment… Use @ to tag a user."
              className="form-control"
              style={{ resize: "none", lineHeight: 1.5 }}
              disabled={pending}
            />
            <p className="text-[0.62rem] text-text-tertiary inline-flex items-center gap-1 mt-1.5">
              <AtSign size={10} aria-hidden />
              Type <span className="font-bold text-text-secondary">@</span> to
              tag users from User Access
            </p>
            {mentionOpen && mentionCandidates.length > 0 && (
              <div
                className="absolute left-0 right-0 max-h-52 overflow-y-auto rounded-xl z-20"
                style={{
                  bottom: "calc(100% + 4px)",
                  background: "var(--color-bg-white, #FFFFFF)",
                  border: "1px solid var(--color-border)",
                  boxShadow:
                    "0 16px 40px -12px rgba(22,21,19,0.28), 0 0 0 1px rgba(240,198,30,0.18)",
                }}
              >
                <div
                  className="sticky top-0 px-3 py-1.5 text-[0.55rem] uppercase tracking-[0.1em] font-extrabold text-text-tertiary inline-flex items-center gap-1.5 w-full"
                  style={{
                    background: "var(--color-bg-surface)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <AtSign size={9} aria-hidden /> Tag a teammate
                </div>
                {mentionCandidates.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(u.email);
                    }}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-[0.74rem] border-b border-border/40 last:border-b-0 transition-colors hover:bg-[#FAF1DC] focus:bg-[#FAF1DC] focus:outline-none"
                  >
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[0.66rem] font-extrabold shrink-0"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--accent) 0%, #E0B41A 100%)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold text-text-primary truncate">
                        {u.name ?? u.email}
                      </span>
                      <span className="block text-[0.62rem] text-text-tertiary truncate">
                        {u.email}
                        {u.role ? ` · ${u.role}` : ""}
                      </span>
                    </span>
                    <AtSign
                      size={11}
                      aria-hidden
                      className="text-text-tertiary shrink-0 opacity-50"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Close
          </button>
          <button
            type="submit"
            className={cn("btn-primary-cta", pending && "is-loading")}
            disabled={pending || !draft.trim()}
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} aria-hidden />
            )}
            <span>Comment</span>
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function CommentBubble({
  comment,
  currentUserEmail,
  onToggleResolved,
  onDelete,
  pending,
}: {
  comment: CellCommentRow;
  currentUserEmail: string | null;
  onToggleResolved: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const isAuthor =
    !!currentUserEmail &&
    comment.author_email.toLowerCase() === currentUserEmail.toLowerCase();

  const initial = (comment.author_name ?? comment.author_email)
    .slice(0, 1)
    .toUpperCase();

  return (
    <article
      className={cn(
        "group relative rounded-xl p-3 transition-all",
        isAuthor && !comment.resolved && "ring-1 ring-[--accent]/25",
      )}
      style={{
        background: comment.resolved
          ? "rgba(236,241,233,0.6)"
          : "var(--color-bg-white, #FFFFFF)",
        border: comment.resolved
          ? "1px solid rgba(79,124,77,0.35)"
          : "1px solid var(--color-border)",
        boxShadow: comment.resolved
          ? "none"
          : "0 1px 0 rgba(22,21,19,0.04)",
      }}
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[0.66rem] font-extrabold shrink-0"
            style={{
              background:
                "linear-gradient(135deg, var(--accent) 0%, #E0B41A 100%)",
              color: "var(--color-text-primary)",
            }}
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-[0.76rem] font-extrabold text-text-primary truncate leading-tight">
              {comment.author_name ?? comment.author_email}
              {isAuthor && (
                <span className="ml-1.5 text-[0.55rem] font-extrabold uppercase tracking-[0.08em] text-text-tertiary">
                  You
                </span>
              )}
            </p>
            <time className="block text-[0.6rem] text-text-tertiary tabular mt-0.5">
              {formatRelative(comment.created_at)}
            </time>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center w-7 h-7 rounded-md transition active:scale-95",
              comment.resolved
                ? "text-success-text hover:bg-success-bg/60"
                : "text-text-tertiary hover:bg-success-bg/60 hover:text-success-text",
            )}
            title={comment.resolved ? "Re-open thread" : "Resolve thread"}
            onClick={onToggleResolved}
            disabled={pending}
          >
            {comment.resolved ? (
              <RotateCcw size={12} aria-hidden />
            ) : (
              <CheckCircle2 size={12} aria-hidden />
            )}
          </button>
          {isAuthor && (
            <button
              type="button"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-text-tertiary hover:bg-danger-bg hover:text-danger-text transition active:scale-95"
              title="Delete comment"
              onClick={onDelete}
              disabled={pending}
            >
              <Trash2 size={12} aria-hidden />
            </button>
          )}
        </div>
      </header>
      <p className="text-[0.8rem] text-text-primary whitespace-pre-wrap break-words leading-relaxed pl-9">
        {renderBody(comment.body)}
      </p>
      {comment.mentions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-9">
          {comment.mentions.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.6rem] font-bold"
              style={{
                background: "rgba(240,198,30,0.16)",
                color: "var(--color-text-primary)",
                border: "1px solid rgba(240,198,30,0.35)",
              }}
            >
              <AtSign size={9} aria-hidden /> {m}
            </span>
          ))}
        </div>
      )}
      {comment.resolved && (
        <div
          className="mt-2 ml-9 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] font-extrabold"
          style={{
            background: "rgba(79,124,77,0.16)",
            color: "var(--color-success-text, #4F7C4D)",
            border: "1px solid rgba(79,124,77,0.3)",
          }}
        >
          <CheckCircle2 size={9} aria-hidden /> Resolved
          {comment.resolved_by && (
            <span className="opacity-75">· {comment.resolved_by}</span>
          )}
        </div>
      )}
    </article>
  );
}

function renderBody(body: string) {
  const parts: Array<string | { mention: string }> = [];
  const re = /@([A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIdx) parts.push(body.slice(lastIdx, m.index));
    parts.push({ mention: m[1] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < body.length) parts.push(body.slice(lastIdx));
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <span
        key={i}
        className="inline-flex items-center gap-0.5 px-1 rounded font-bold"
        style={{
          background: "rgba(240,198,30,0.16)",
          color: "var(--color-text-primary)",
        }}
      >
        <AtSign size={9} aria-hidden /> {p.mention}
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
  return new Date(then).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}
