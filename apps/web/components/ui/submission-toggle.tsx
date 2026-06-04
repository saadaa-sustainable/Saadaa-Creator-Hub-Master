"use client";
import { cn } from "@/lib/cn";

/**
 * Two-state segmented control for the workflow-stage pages (Onboarding,
 * Posting). Splits rows by whether that stage's form entry has been filled:
 *   - "Not Submitted" (default) → the work queue still awaiting the form.
 *   - "Submitted"               → rows whose form is already filled.
 *
 * Shared so both stages render an identical control (no per-view reinvention).
 * Submission state maps to a `workflow_status` set in each stage's queries.ts.
 */
export function SubmissionToggle({
  submittedYes,
  onChange,
  className,
}: {
  submittedYes: boolean;
  onChange: (submittedYes: boolean) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Form submission status"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-bg-surface p-0.5",
        className,
      )}
    >
      {(
        [
          { label: "Not Submitted", active: !submittedYes, value: false },
          { label: "Submitted", active: submittedYes, value: true },
        ] as const
      ).map((tab) => (
        <button
          key={tab.label}
          type="button"
          role="tab"
          aria-selected={tab.active}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            tab.active
              ? "bg-accent text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary",
          )}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
