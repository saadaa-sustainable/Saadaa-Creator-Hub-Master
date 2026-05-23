"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import { savePartnershipKey } from "@/features/posting/actions";
import { cn } from "@/lib/cn";

interface Props {
  postId: string;
  value: string | null | undefined;
  /** Passed when embedded in a click-through parent — stops the card opening */
  stopPropagation?: boolean;
  /** Tighter sizing for kanban cards */
  compact?: boolean;
  /**
   * False = row not yet posted; key can't be set yet.
   * Shows "Submission Pending" placeholder instead of editable "Set Key".
   * Defaults to true so accounts-hub callers (always posted) need no change.
   */
  isPosted?: boolean;
  /** Read-only mode — shows value/missing indicator but no edit controls. */
  readOnly?: boolean;
}

export function PartnershipKeyEdit({
  postId,
  value,
  stopPropagation,
  compact,
  isPosted = true,
  readOnly = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<string | null | undefined>(value);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when parent passes a fresh value after router.refresh() — useState
  // only reads the initializer once so stale optimistic stays without this.
  useEffect(() => {
    setOptimistic(value);
  }, [value]);

  function maybeStop(e: React.SyntheticEvent) {
    if (stopPropagation) e.stopPropagation();
  }

  function startEdit(e: React.MouseEvent) {
    maybeStop(e);
    setDraft(optimistic ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 16);
  }

  function cancel(e?: React.MouseEvent) {
    if (e) maybeStop(e);
    setEditing(false);
    setDraft("");
  }

  function save(e?: React.MouseEvent) {
    if (e) maybeStop(e);
    const trimmed = draft.trim();
    startTransition(async () => {
      const res = await savePartnershipKey(postId, trimmed);
      if (res.ok) setOptimistic(trimmed || null);
      setEditing(false);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  }

  const display = optimistic?.trim() || null;

  if (readOnly) {
    return display ? (
      <span className={cn("pk-edit__value tabular", compact && "pk-edit__value--compact")}>
        {display}
      </span>
    ) : (
      <span className="pk-edit__ro-missing">—</span>
    );
  }

  if (editing) {
    return (
      <div
        className="pk-edit pk-edit--active"
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      >
        <input
          ref={inputRef}
          type="text"
          className={cn("pk-edit__input", compact && "pk-edit__input--compact")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Meta partnership key"
          disabled={isPending}
          maxLength={100}
          aria-label="Partnership key"
        />
        <button
          type="button"
          className="pk-edit__btn pk-edit__btn--save"
          onClick={save}
          disabled={isPending}
          aria-label="Save"
        >
          <Check size={11} aria-hidden />
        </button>
        <button
          type="button"
          className="pk-edit__btn pk-edit__btn--cancel"
          onClick={cancel}
          disabled={isPending}
          aria-label="Cancel"
        >
          <X size={11} aria-hidden />
        </button>
      </div>
    );
  }

  if (display) {
    return (
      <div className="pk-edit pk-edit--set">
        <span className={cn("pk-edit__value tabular", compact && "pk-edit__value--compact")}>
          {display}
        </span>
        <button
          type="button"
          className="pk-edit__trigger"
          onClick={startEdit}
          aria-label="Edit partnership key"
        >
          <Pencil size={10} aria-hidden />
        </button>
      </div>
    );
  }

  if (!isPosted) {
    return (
      <span className={cn("pk-edit__pending", compact && "pk-edit__pending--compact")}>
        Submission Pending
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cn("pk-edit__unset pk-edit__unset--alert", compact && "pk-edit__unset--compact")}
      onClick={startEdit}
      aria-label="Set partnership key"
    >
      <AlertTriangle size={10} aria-hidden />
      Set Key
    </button>
  );
}
