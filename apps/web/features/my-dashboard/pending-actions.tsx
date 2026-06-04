import { TriangleAlert } from "lucide-react";
import { formatDate, workflowStatusLabel } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { PendingAction } from "./types";

export function PendingActionsSection({
  actions,
}: {
  actions: PendingAction[];
}) {
  return (
    <section aria-labelledby="pending-actions-heading">
      <div className="flex items-center gap-2 mb-3 mt-6">
        <TriangleAlert
          size={15}
          className="text-[--warning-text] shrink-0"
          aria-hidden
        />
        <h2
          id="pending-actions-heading"
          className="text-[0.875rem] font-semibold text-[--text-primary]"
        >
          Needs Attention
        </h2>
        {actions.length > 0 && (
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-[--danger-bg] text-[--danger-text] text-[0.7rem] font-bold px-2 py-0.5 tabular-nums">
            {actions.length}
          </span>
        )}
      </div>

      {actions.length === 0 ? (
        <div className="text-center py-8 text-sm text-[--text-tertiary]">
          All caught up
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-[var(--radius)] border border-[--border]">
            <table className="w-full text-[0.8rem]">
              <thead>
                <tr className="border-b border-[--border] bg-[--bg-surface]">
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary] w-[180px]">
                    Creator
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                    Campaign
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                    Flag
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-[--text-secondary]">
                    Days Overdue
                  </th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => (
                  <PendingRow key={a.post_id ?? i} action={a} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {actions.map((a, i) => (
              <PendingCard key={a.post_id ?? i} action={a} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function statusChipClass(status: string | null): string {
  const s = status ?? "";
  if (["Posted", "Delivered"].includes(s))
    return "bg-[--success-bg] text-[--success-text]";
  if (["On Board", "Order Sent"].includes(s))
    return "bg-[--warning-bg] text-[--warning-text]";
  if (["RTO", "Cancelled", "RTO - Reverse Picked", "RTO - Delivered"].includes(s))
    return "bg-[--danger-bg] text-[--danger-text]";
  return "bg-[--bg-surface] text-[--text-secondary]";
}

function PendingRow({ action: a }: { action: PendingAction }) {
  const isOverdue = a.label === "Overdue delivery";
  return (
    <tr className="border-b border-[--border] last:border-0 hover:bg-[--bg-surface] transition-colors">
      <td className="px-3 py-2">
        <div className="font-medium text-[--text-primary] leading-tight truncate max-w-[160px]">
          {a.inf_name ?? "—"}
        </div>
        {a.username && (
          <div className="text-[0.72rem] text-[--text-tertiary]">
            @{a.username}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-[--text-secondary] tabular">
        {a.campaign_id ?? "—"}
      </td>
      <td className="px-3 py-2">
        <span
          className={cn(
            "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[0.7rem] font-medium",
            isOverdue
              ? "bg-[--danger-bg] text-[--danger-text]"
              : statusChipClass(a.workflow_status),
          )}
        >
          {workflowStatusLabel(a.workflow_status)}
        </span>
      </td>
      <td className="px-3 py-2">
        <span
          className={cn(
            "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[0.7rem] font-medium",
            isOverdue
              ? "bg-[--danger-bg] text-[--danger-text]"
              : "bg-[--warning-bg] text-[--warning-text]",
          )}
        >
          {a.label}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular text-[--text-secondary]">
        {a.daysOverdue > 0 ? (
          <span className="text-[--danger-text] font-semibold">
            {a.daysOverdue}d
          </span>
        ) : (
          <span className="text-[--text-tertiary]">today</span>
        )}
      </td>
    </tr>
  );
}

function PendingCard({ action: a }: { action: PendingAction }) {
  const isOverdue = a.label === "Overdue delivery";
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border px-3 py-2.5 bg-[--bg-white]",
        isOverdue ? "border-[--danger-bg]" : "border-[--warning-bg]",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div className="font-semibold text-[0.82rem] text-[--text-primary] truncate">
            {a.inf_name ?? "—"}
          </div>
          {a.username && (
            <div className="text-[0.72rem] text-[--text-tertiary]">
              @{a.username}
            </div>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-[6px] px-2 py-0.5 text-[0.7rem] font-medium",
            isOverdue
              ? "bg-[--danger-bg] text-[--danger-text]"
              : "bg-[--warning-bg] text-[--warning-text]",
          )}
        >
          {a.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.75rem] text-[--text-secondary]">
        <span>
          Campaign:{" "}
          <span className="font-medium tabular">{a.campaign_id ?? "—"}</span>
        </span>
        <span>
          Est. delivery:{" "}
          <span className="font-medium tabular">
            {formatDate(a.est_delivery)}
          </span>
        </span>
        {a.daysOverdue > 0 && (
          <span className="text-[--danger-text] font-semibold">
            {a.daysOverdue}d overdue
          </span>
        )}
      </div>
    </div>
  );
}
