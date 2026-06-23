"use client";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "../ui/empty-state";

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  /** Render override per row on `<md` viewport. If absent, table stays as-is. */
  mobileCard?: (row: TData) => React.ReactNode;
  /** Optional className per data row. */
  rowClassName?: (row: TData) => string | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
  rowLabel?: string;
  className?: string;
}

/**
 * Dense table mirroring legacy Onboarding/Posting/Order Status density.
 * Headers: 0.7rem uppercase 0.04em tracking text-secondary.
 * Cells: 0.78-0.84rem, padding 6-10px.
 * Auto-converts to stacked cards on small viewports when mobileCard is provided.
 */
export function DataTable<TData>({
  data,
  columns,
  mobileCard,
  rowClassName,
  emptyTitle = "No rows yet",
  emptyDescription,
  rowLabel = "rows",
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const visibleCols = useMemo(
    () => table.getVisibleFlatColumns().length,
    [table],
  );

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[0.82rem] text-text-secondary">
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#F0EAD6] px-1.5 text-[0.72rem] font-semibold tabular-nums text-[#161513]">
            {rows.length.toLocaleString("en-IN")}
          </span>
          {rowLabel}
        </span>
        {sorting.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F1EC] px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-wide text-text-tertiary">
            Sorted
          </span>
        )}
      </div>
      {mobileCard && (
        <div className="grid gap-2 md:hidden">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-[var(--radius)] border border-border bg-bg-white p-3 shadow-sm transition-[border-color,box-shadow,transform] duration-150 active:translate-y-px"
            >
              {mobileCard(r.original)}
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "hidden md:block overflow-auto rounded-[var(--radius)] border border-border bg-bg-white shadow-sm",
          !mobileCard && "block",
          className,
        )}
      >
        <table className="w-full min-w-[760px] border-collapse text-[0.82rem]">
          <thead className="sticky top-0 z-[1] bg-bg-ecru">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      data-column-id={h.column.id}
                      className={cn(
                        "border-b border-border px-2.5 py-2.5 text-left text-[0.7rem] font-bold uppercase tracking-[0.04em] text-text-secondary",
                        sortable &&
                          "cursor-pointer select-none transition-colors hover:bg-accent-warm focus-visible:bg-accent-warm",
                      )}
                      tabIndex={sortable ? 0 : undefined}
                      onClick={
                        sortable
                          ? h.column.getToggleSortingHandler()
                          : undefined
                      }
                      onKeyDown={
                        sortable
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                h.column.toggleSorting();
                              }
                            }
                          : undefined
                      }
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortable &&
                          (sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowUpDown
                              className="h-3 w-3 opacity-40"
                              aria-hidden
                            />
                          ))}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.id}
                className={cn(
                  "border-b border-border-soft last:border-0",
                  idx % 2 === 1 && "bg-bg-alt/50",
                  "transition-colors hover:bg-bg-alt",
                  rowClassName?.(r.original as TData),
                )}
              >
                {r.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    data-column-id={cell.column.id}
                    className="px-2.5 py-1.5 align-middle"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sr-only">
          Showing {rows.length} {rowLabel} across {visibleCols} columns
        </div>
      </div>
    </>
  );
}
