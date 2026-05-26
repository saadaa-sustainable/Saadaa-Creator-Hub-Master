"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Shield,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_KEYS,
  type PermissionKey,
} from "@/lib/rbac";
import { createRole, updateRole } from "./roles-actions";
import type { AccessRoleSummary } from "./types";

const COLOR_SUGGESTIONS = [
  "#F0C61E",
  "#7B4FBF",
  "#B54F7A",
  "#3B6FD4",
  "#0F766E",
  "#4F7C4D",
  "#C0392B",
];

export function RoleEditorModal({
  role,
  onClose,
  onSaved,
}: {
  role: AccessRoleSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;
  const isSystem = role?.is_system ?? false;

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? "#7B4FBF");
  const [scopes, setScopes] = useState<Set<string>>(
    new Set(role?.scopes ?? []),
  );
  const [pending, startTransition] = useTransition();

  const grantedCount = scopes.size;
  const allChecked = grantedCount === PERMISSION_KEYS.length;
  const noneChecked = grantedCount === 0;

  const toggle = (key: PermissionKey) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () =>
    setScopes(new Set<string>(PERMISSION_KEYS as readonly string[]));
  const clearAll = () => setScopes(new Set());

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSystem && !name.trim()) {
      toast.error("Role name is required");
      return;
    }
    startTransition(async () => {
      const payload = {
        id: role?.id,
        name: isSystem ? role!.name : name,
        description,
        color,
        scopes: Array.from(scopes),
      };
      const res = isEdit ? await updateRole(payload) : await createRole(payload);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save role");
        return;
      }
      toast.success(
        isEdit
          ? `Updated role "${payload.name}"`
          : `Created role "${payload.name}"`,
      );
      onSaved();
    });
  };

  const headline = isEdit
    ? isSystem
      ? "Edit system role"
      : "Edit role"
    : "Create new role";

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding" onClick={onClose}>
      <form
        className="modal-panel modal-panel--onboarding ob-overview-modal"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            {isEdit ? (
              <Pencil size={15} aria-hidden />
            ) : (
              <ShieldCheck size={15} aria-hidden />
            )}
            <h2 className="font-semibold">{headline}</h2>
            {isSystem && (
              <span className="chip text-[10px] tabular bg-warning-bg text-warning border border-warning/30">
                System
              </span>
            )}
            {isEdit && role && (
              <span className="chip text-[10px] tabular truncate max-w-[160px]">
                {role.user_count} user{role.user_count === 1 ? "" : "s"}
              </span>
            )}
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
          {isSystem && (
            <div
              className="rounded-xl border px-3 py-2 flex items-start gap-2 text-[0.7rem] leading-relaxed"
              style={{
                background: "rgba(240,198,30,0.12)",
                borderColor: "rgba(240,198,30,0.3)",
                color: "var(--color-text-primary)",
              }}
            >
              <AlertTriangle
                size={13}
                className="mt-0.5 text-warning shrink-0"
                aria-hidden
              />
              <div>
                <strong>System role.</strong> Name is locked, but permissions
                can still be tuned. Changes apply to every assigned user
                immediately.
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Role name *
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSystem}
              placeholder="e.g. Junior Onboarder"
              className="form-control"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Description
            </span>
            <input
              type="text"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line summary of what this role does"
              className="form-control"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Badge color
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_SUGGESTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-transform active:scale-95",
                    color === c
                      ? "border-text-primary scale-110"
                      : "border-border hover:scale-105",
                  )}
                  style={{ background: c }}
                  aria-label={`Use color ${c}`}
                />
              ))}
              <input
                type="text"
                value={color ?? ""}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#hex"
                className="form-control w-24 text-[0.72rem] tabular"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary inline-flex items-center gap-1">
                <Shield size={11} aria-hidden /> Permissions ·{" "}
                <strong className="text-text-primary">{grantedCount}</strong>/
                {PERMISSION_KEYS.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={allChecked}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded-full text-[0.6rem] font-extrabold border border-border bg-bg-white text-text-secondary hover:bg-bg-muted disabled:opacity-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={noneChecked}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded-full text-[0.6rem] font-extrabold border border-border bg-bg-white text-text-secondary hover:bg-bg-muted disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PERMISSION_KEYS.map((key) => {
                const checked = scopes.has(key);
                const isAdminScope = key === "admin";
                return (
                  <label
                    key={key}
                    className={cn(
                      "rounded-xl border p-2.5 flex items-start gap-2 cursor-pointer transition-all",
                      checked
                        ? "border-[--accent]/45 bg-[--accent]/8"
                        : "border-border bg-bg-white hover:border-text-tertiary/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[--accent] cursor-pointer"
                      checked={checked}
                      onChange={() => toggle(key)}
                    />
                    <div className="min-w-0">
                      <div className="text-[0.72rem] font-extrabold text-text-primary inline-flex items-center gap-1.5">
                        {key}
                        {isAdminScope && (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[0.5rem] font-extrabold bg-warning-bg text-warning border border-warning/25">
                            <Sparkles size={8} aria-hidden /> Power
                          </span>
                        )}
                      </div>
                      <div className="text-[0.6rem] text-text-tertiary leading-snug mt-0.5">
                        {PERMISSION_DESCRIPTIONS[key]}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={cn("btn-primary-cta", pending && "is-loading")}
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ShieldCheck size={14} aria-hidden />
            )}
            <span>{isEdit ? "Save Changes" : "Create Role"}</span>
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

export function useScopesPreview(scopes: string[]): string {
  return useMemo(() => {
    if (!scopes.length) return "No permissions";
    if (scopes.length <= 3) return scopes.join(" · ");
    return `${scopes.slice(0, 3).join(" · ")} +${scopes.length - 3}`;
  }, [scopes]);
}
