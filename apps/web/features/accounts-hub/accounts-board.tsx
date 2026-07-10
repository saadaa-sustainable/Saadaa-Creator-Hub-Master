"use client";
import { useState } from "react";
import { Grid3X3, List as ListIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { AccountsKanban } from "./accounts-kanban";
import { AccountsTable } from "./accounts-table";
import { AccountsExportBar } from "./export-bar";
import { InfOrdersButton } from "./inf-orders";
import type { AccountsRow } from "./types";

interface AccountsBoardProps {
  rows: AccountsRow[];
  initialView?: "kanban" | "list";
}

/**
 * View-toggle wrapper for Accounts Hub — Kanban (default, legacy parity) /
 * List. Both views work on mobile; the kanban CSS already stacks columns
 * vertically at ≤768px so the user can pick either layout. Payment submit +
 * export buttons live in the page-level header strip above the KPI cards
 * (matches legacy markup at Index.html:6611-6710).
 */
export function AccountsBoard({
  rows,
  initialView = "kanban",
}: AccountsBoardProps) {
  const [view, setView] = useState<"kanban" | "list">(initialView);
  // The "Partial Payment" export only appears when at least one collab carries
  // an outstanding balance (an installment paid but the agreed total not met).
  const hasPartial = rows.some((r) => r._isPartial);

  return (
    <>
      <div className="acc-toolbar">
        <AccountsExportBar variant="desktop" hasPartial={hasPartial} />
        <AccountsExportBar variant="mobile" hasPartial={hasPartial} />
        <InfOrdersButton />
        <div className="acc-toolbar__spacer" />
        <div className="ob-viewtoggle" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={view === "kanban"}
            className={cn(view === "kanban" && "active")}
            onClick={() => setView("kanban")}
          >
            <Grid3X3 size={12} aria-hidden />
            Kanban
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={cn(view === "list" && "active")}
            onClick={() => setView("list")}
          >
            <ListIcon size={12} aria-hidden />
            List
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <AccountsKanban rows={rows} />
      ) : (
        <AccountsTable rows={rows} />
      )}
    </>
  );
}
