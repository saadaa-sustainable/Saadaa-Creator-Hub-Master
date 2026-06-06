"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Calendar, Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/formatters";
import { SheetGrid } from "./sheet-grid";
import type { SheetRow, SheetTable } from "./types";

/**
 * Campaign Budget — month-grouped layout (legacy `appendBudgetBlock_`
 * parity). Top: sub-tab per month_label. Below: SheetGrid for that month's
 * rows + a TOTAL row pinned to the bottom (computed on the client).
 */
export function BudgetSheet({
  table,
  rows,
  canEdit,
}: {
  table: SheetTable;
  rows: SheetRow[];
  canEdit: boolean;
}) {
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const m = String(r.month_label ?? "").trim();
      if (m) set.add(m);
    }
    return [...set].sort(
      (a, b) => new Date(`${b} 01`).getTime() - new Date(`${a} 01`).getTime(),
    );
  }, [rows]);

  const defaultMonth = months[0] ?? "";
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [activeMonth, setActiveMonth] = useState<string>(defaultMonth);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (months.includes(selectedMonth)) return;
    setSelectedMonth(defaultMonth);
    setActiveMonth(defaultMonth);
  }, [defaultMonth, months, selectedMonth]);

  const monthRows = useMemo(
    () =>
      rows.filter((r) => String(r.month_label ?? "").trim() === activeMonth),
    [rows, activeMonth],
  );

  const totals = useMemo(() => {
    let creators = 0;
    let totalCost = 0;
    let totalWithGarments = 0;
    let estGarment = 0;
    for (const r of monthRows) {
      creators += Number(r.num_influencers ?? 0);
      totalCost += Number(r.total_cost ?? 0);
      totalWithGarments += Number(r.total_with_garments ?? 0);
      estGarment += Number(r.est_garment_cost ?? 0);
    }
    return { creators, totalCost, totalWithGarments, estGarment };
  }, [monthRows]);

  if (months.length === 0) {
    return (
      <section className="rounded-2xl bg-bg-white border border-border p-4">
        <p className="text-[0.7rem] text-text-tertiary">
          No budget rows yet. Submit a campaign with budget rows to seed this
          sheet.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Month sub-tabs */}
      <div className="rounded-2xl bg-bg-surface border border-border p-2 flex items-center gap-1 overflow-x-auto">
        {months.map((m) => {
          const isSelected = selectedMonth === m;
          const isPendingSelection =
            isPending && isSelected && activeMonth !== m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                setSelectedMonth(m);
                startTransition(() => setActiveMonth(m));
              }}
              data-pending={isPendingSelection ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[0.7rem] font-extrabold whitespace-nowrap transition-all",
                isPendingSelection && "submission-toggle-pending",
                isSelected
                  ? "bg-bg-white text-text-primary border border-[--accent] shadow-sm"
                  : "text-text-secondary hover:bg-bg-muted/60",
              )}
            >
              <Calendar size={11} aria-hidden /> {m}
            </button>
          );
        })}
      </div>

      {/* KPI strip per month — TOTAL row preview */}
      <div className="rounded-2xl bg-[#F0EAD6]/60 border border-[--accent]/30 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} aria-hidden className="text-warning" />
          <span className="text-[0.75rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
            {activeMonth} · TOTAL
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-4 sm:gap-6 text-[0.72rem]">
          <Stat label="Creators" value={String(totals.creators)} />
          <Stat
            label="Total Cost"
            value={formatRupees(totals.totalCost)}
            tone="text-success"
          />
          <Stat
            label="Est Garment"
            value={formatRupees(totals.estGarment)}
            tone="text-warning"
          />
          <Stat
            label="Total w/ Garments"
            value={formatRupees(totals.totalWithGarments)}
            tone="text-text-primary"
          />
        </div>
      </div>

      {/* Reuse the standard grid for the rows in this month */}
      <SheetGrid table={table} rows={monthRows} canEdit={canEdit} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-text-primary",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.55rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
        {label}
      </span>
      <span className={cn("font-extrabold tabular leading-none", tone)}>
        {value}
      </span>
    </div>
  );
}
