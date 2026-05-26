"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ClipboardPaste, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { bulkInviteUsers, type BulkInviteResult } from "./actions";

interface ParsedRow {
  email: string;
  name?: string;
  role?: string;
  notes?: string;
}

function parsePaste(input: string): ParsedRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  // Optional header: detect by first cell containing "email"
  const first = lines[0].toLowerCase();
  const hasHeader = /(^|,|\t)email(,|\t|$)/.test(first);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .map((line) => {
      const cells = line.split(/\t|,/).map((c) => c.trim());
      const [email = "", name = "", role = "", notes = ""] = cells;
      return { email, name, role, notes };
    })
    .filter((r) => r.email);
}

export function CsvInviteModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkInviteResult | null>(null);

  const parsed = parsePaste(text);
  const previewRows = parsed.slice(0, 8);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed.length === 0) {
      toast.error("Paste rows first.");
      return;
    }
    startTransition(async () => {
      const res = await bulkInviteUsers({ rows: parsed });
      setResult(res);
      if (res.invited + res.updated > 0) {
        toast.success(
          `Invited ${res.invited}, updated ${res.updated}, failed ${res.failures.length}.`,
        );
      } else if (res.failures.length > 0) {
        toast.error(`All ${res.failures.length} rows failed.`);
      } else {
        toast.error(res.error ?? "No rows processed");
      }
    });
  };

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
            <UploadCloud size={16} aria-hidden />
            <h2 className="font-semibold">Bulk invite users</h2>
            <span className="chip text-[10px] tabular">
              {parsed.length} row{parsed.length === 1 ? "" : "s"} parsed
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
          <p className="text-[0.7rem] text-text-secondary leading-relaxed">
            Paste rows from Excel / Google Sheets. Columns:{" "}
            <code className="font-mono bg-bg-muted px-1 rounded">email</code>,{" "}
            <code className="font-mono bg-bg-muted px-1 rounded">name</code>,{" "}
            <code className="font-mono bg-bg-muted px-1 rounded">role</code>,{" "}
            <code className="font-mono bg-bg-muted px-1 rounded">notes</code>.
            Tab or comma separated. First line can be a header (auto-detected).
            Role accepts <em>Global Admin / User / Accounts Team</em> (or
            aliases admin / member / accounts).
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary inline-flex items-center gap-1">
              <ClipboardPaste size={11} aria-hidden /> Roster
            </span>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "email,name,role,notes\njane@saadaa.in,Jane Doe,User,Pilot batch\nbilling@saadaa.in,Billing Bot,Accounts Team,"
              }
              className="form-control"
              style={{ resize: "vertical", lineHeight: 1.5, minHeight: 160 }}
              disabled={pending}
            />
          </label>

          {previewRows.length > 0 && (
            <div className="rounded-xl border border-border bg-bg-white overflow-hidden">
              <table className="w-full text-[0.74rem]">
                <thead className="bg-bg-surface text-text-tertiary text-[0.6rem] uppercase tracking-[0.08em] font-extrabold">
                  <tr>
                    <th className="text-left px-3 py-1.5">Email</th>
                    <th className="text-left px-3 py-1.5">Name</th>
                    <th className="text-left px-3 py-1.5">Role</th>
                    <th className="text-left px-3 py-1.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-1.5 tabular">{r.email}</td>
                      <td className="px-3 py-1.5">{r.name || "—"}</td>
                      <td className="px-3 py-1.5">{r.role || "User"}</td>
                      <td className="px-3 py-1.5 text-text-tertiary truncate max-w-[180px]">
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))}
                  {parsed.length > previewRows.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 text-center text-text-tertiary"
                      >
                        + {parsed.length - previewRows.length} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <div
              className="rounded-xl border p-3 text-[0.72rem] leading-snug"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border)",
              }}
            >
              <strong className="block text-text-primary text-[0.8rem] mb-1">
                Batch result
              </strong>
              <p className="text-text-secondary">
                Invited <strong>{result.invited}</strong> · Updated{" "}
                <strong>{result.updated}</strong> · Failed{" "}
                <strong>{result.failures.length}</strong>
              </p>
              {result.failures.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.failures.slice(0, 6).map((f, i) => (
                    <li
                      key={i}
                      className="text-[0.66rem] text-danger-text tabular"
                    >
                      {f.email} — {f.error}
                    </li>
                  ))}
                  {result.failures.length > 6 && (
                    <li className="text-[0.62rem] text-text-tertiary">
                      + {result.failures.length - 6} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
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
            disabled={pending || parsed.length === 0}
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UploadCloud size={14} aria-hidden />
            )}
            <span>
              {pending
                ? "Inviting…"
                : `Invite ${parsed.length || ""}`.trim()}
            </span>
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
