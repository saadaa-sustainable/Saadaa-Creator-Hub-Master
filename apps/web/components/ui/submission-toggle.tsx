"use client";
import { useEffect, useState } from "react";
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
  const [optimisticValue, setOptimisticValue] = useState(submittedYes);

  useEffect(() => {
    setOptimisticValue(submittedYes);
  }, [submittedYes]);

  const choose = (next: boolean) => {
    setOptimisticValue(next);
    onChange(next);
  };

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
          { label: "Not Submitted", value: false },
          { label: "Submitted", value: true },
        ] as const
      ).map((tab) => {
        const active = tab.value === optimisticValue;
        const pending = optimisticValue !== submittedYes && active;
        return (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={active}
            data-pending={pending ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-[background,color,box-shadow,transform] duration-150 active:translate-y-px",
              active
                ? "bg-accent text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
              pending && "submission-toggle-pending",
            )}
            onClick={() => choose(tab.value)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
