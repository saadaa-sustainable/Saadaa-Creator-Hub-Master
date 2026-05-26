"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Red required-fields alert shown directly above the submit button on every
 * stage form. Renders nothing when the field list is empty so callers can
 * always mount it — only the data drives visibility.
 *
 * Caller passes friendly column labels (e.g. "Campaign ID", "Reach Out
 * Date"), NOT field keys, since the alert is user-facing. ALL missing
 * fields are listed (deduped) — caller should pass the full set.
 */
export interface MissingFieldsAlertProps {
  fields: string[];
  className?: string;
  /** Override the default copy. Receives the formatted column list. */
  message?: (columns: string) => string;
}

export function MissingFieldsAlert({
  fields,
  className,
  message,
}: MissingFieldsAlertProps) {
  if (!fields.length) return null;
  const unique = Array.from(new Set(fields.map((f) => f.trim()).filter(Boolean)));
  if (!unique.length) return null;

  const columns = formatColumnList(unique);
  const body = message
    ? message(columns)
    : `Kindly fill the ${columns} ${unique.length > 1 ? "columns" : "column"} to submit the form.`;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-4 py-3",
        "bg-[#FEE2E2] border-2 border-[#DC2626]",
        "text-[0.82rem] sm:text-[0.85rem] font-semibold leading-snug",
        "text-[#991B1B] shadow-[0_2px_8px_-2px_rgba(220,38,38,0.25)]",
        "animate-[fadeIn_180ms_ease-out]",
        className,
      )}
    >
      <AlertTriangle
        size={16}
        aria-hidden
        className="mt-0.5 shrink-0 text-[#DC2626]"
      />
      <div className="min-w-0">
        <p className="m-0">{body}</p>
      </div>
    </div>
  );
}

function formatColumnList(items: string[]): string {
  const quoted = items.map((s) => `"${s}"`);
  if (quoted.length === 1) return quoted[0];
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted[quoted.length - 1]}`;
}
