"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Check,
  Columns3,
  Database,
  Download,
  Eye,
  EyeOff,
  Hash,
  History,
  Keyboard,
  ListChecks,
  Lock,
  MessageSquare as MessageSquareIcon,
  Pencil,
  Pin,
  PinOff,
  Rows3,
  Search,
  Sparkles,
  ToggleLeft,
  Type as TypeIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import {
  fetchCellComments,
  fetchRecentCellEdits,
  updateSheetCell,
  type CellCommentRow,
  type RecentEdit,
} from "./actions";
import { CellCommentThread } from "./cell-comment-thread";
import {
  mergeColumns,
  type ColDef,
  type ColType,
  type SheetRow,
  type SheetTable,
} from "./types";

interface Props {
  table: SheetTable;
  rows: SheetRow[];
  canEdit: boolean;
  currentUserEmail?: string | null;
}

type Density = "cozy" | "compact";

// Client-side resolvers for virtual columns — keyed on ColDef.key. The schema
// defines `virtual: true` but cannot ship a function over the RSC boundary.
const VIRTUAL_RESOLVERS: Record<string, (row: SheetRow) => unknown> = {
  __lineage: (r) => {
    const idx = r.deliverable_index as number | null | undefined;
    if (idx == null || Number(idx) === 1) return "Parent";
    return `Child ${idx}`;
  },
};

function resolveValue(col: ColDef, row: SheetRow): unknown {
  if (col.virtual) {
    const fn = VIRTUAL_RESOLVERS[col.key];
    return fn ? fn(row) : undefined;
  }
  return row[col.key];
}

const TYPE_ICON: Record<ColType, LucideIcon> = {
  text: TypeIcon,
  number: Hash,
  currency: Hash,
  date: Calendar,
  datetime: Calendar,
  bool: ToggleLeft,
  select: ListChecks,
  status: ListChecks,
};

export function SheetGrid({
  table,
  rows,
  canEdit,
  currentUserEmail = null,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(
    table.defaultSort?.col ?? null,
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    table.defaultSort?.dir ?? "asc",
  );
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null,
  );
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(
    null,
  );
  const [flashed, setFlashed] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("cozy");
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [pinnedCols, setPinnedCols] = useState<string[]>([]); // ordered
  const [showColsMenu, setShowColsMenu] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Comments — keyed `${rowKey}::${columnKey}` → array of comments. Open
  // thread tracks the cell under view; null = drawer closed.
  const [commentsByCell, setCommentsByCell] = useState<
    Map<string, CellCommentRow[]>
  >(new Map());
  const [openCommentCell, setOpenCommentCell] = useState<{
    rowKey: string;
    column: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchCellComments({ tableId: table.id });
      if (cancelled || !res.ok) return;
      const next = new Map<string, CellCommentRow[]>();
      for (const c of res.comments) {
        const key = `${c.row_pk}::${c.column_key}`;
        if (!next.has(key)) next.set(key, []);
        next.get(key)!.push(c);
      }
      setCommentsByCell(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [table.id]);

  // Recent edits — keyed `${rowPk}::${columnKey}` → latest edit (last 7 days).
  // Drives the "edited" badge + tooltip; entries older than 7 days are never
  // returned by the action so the badge fades out automatically.
  const [recentEdits, setRecentEdits] = useState<Map<string, RecentEdit>>(
    new Map(),
  );

  const loadRecentEdits = useCallback(async () => {
    const res = await fetchRecentCellEdits({ tableId: table.id, withinDays: 7 });
    if (!res.ok) return;
    setRecentEdits(new Map(Object.entries(res.edits)));
  }, [table.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchRecentCellEdits({ tableId: table.id, withinDays: 7 });
      if (cancelled || !res.ok) return;
      setRecentEdits(new Map(Object.entries(res.edits)));
    })();
    return () => {
      cancelled = true;
    };
  }, [table.id]);

  const applyCommentChange = (
    rowKey: string,
    column: string,
    comments: CellCommentRow[],
  ) => {
    const key = `${rowKey}::${column}`;
    setCommentsByCell((prev) => {
      const next = new Map(prev);
      if (comments.length === 0) next.delete(key);
      else next.set(key, comments);
      return next;
    });
  };

  // Merge curated columns with extras discovered in row data so the sheet
  // reflects the full Supabase column set (incl. fields we didn't curate).
  const mergedAll = useMemo(
    () => mergeColumns(table.columns, rows),
    [table.columns, rows],
  );

  const allVisibleCols = useMemo(
    () => mergedAll.filter((c) => !c.hidden),
    [mergedAll],
  );

  // Drop columns that are entirely absent from data AND have no virtual fn —
  // schema-drift safety.
  const presentCols = useMemo(() => {
    if (rows.length === 0) return allVisibleCols;
    return allVisibleCols.filter(
      (c) =>
        c.virtual != null ||
        rows.some((r) => Object.prototype.hasOwnProperty.call(r, c.key)),
    );
  }, [allVisibleCols, rows]);

  // Reorder: pinned columns first (in pin order), then unpinned.
  const orderedCols = useMemo(() => {
    const byKey = new Map(presentCols.map((c) => [c.key, c]));
    const pinned = pinnedCols
      .map((k) => byKey.get(k))
      .filter((c): c is ColDef => !!c);
    const pinnedSet = new Set(pinnedCols);
    const rest = presentCols.filter((c) => !pinnedSet.has(c.key));
    return [...pinned, ...rest];
  }, [presentCols, pinnedCols]);

  const cols = useMemo(
    () => orderedCols.filter((c) => !hiddenCols.has(c.key)),
    [orderedCols, hiddenCols],
  );

  // Map col key → cumulative left offset for sticky positioning.
  const pinnedLeftOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let left = 0;
    for (const key of pinnedCols) {
      offsets.set(key, left);
      const col = mergedAll.find((c) => c.key === key);
      left += col?.width ?? 130;
    }
    return offsets;
  }, [pinnedCols, mergedAll]);

  const togglePin = (key: string) => {
    setPinnedCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const normalizedQuery = search.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((r) => {
      for (const c of cols) {
        const v = String(resolveValue(c, r) ?? "").toLowerCase();
        if (v.includes(normalizedQuery)) return true;
      }
      return false;
    });
  }, [rows, normalizedQuery, cols]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const dir = sortDir === "asc" ? 1 : -1;
    const col = cols.find((c) => c.key === sortKey);
    return [...filteredRows].sort((a, b) => {
      const av = col ? resolveValue(col, a) : a[sortKey];
      const bv = col ? resolveValue(col, b) : b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (col?.type === "number" || col?.type === "currency") {
        return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredRows, sortKey, sortDir, table.columns]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleExport = () => {
    const csv = toCsv(cols, sortedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${sortedRows.length} rows`);
  };

  const flashCell = (id: string) => {
    setFlashed(id);
    setTimeout(() => setFlashed(null), 1800);
  };

  const toggleColVisibility = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Keyboard navigation — arrows move selection, Enter enters edit, Esc cancels,
  // Cmd+C / Ctrl+C copies cell value to clipboard.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editing) return;
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (!selected) return;
      const lastRow = sortedRows.length - 1;
      const lastCol = cols.length - 1;
      let { row, col } = selected;
      if (e.key === "ArrowUp" && row > 0) {
        row -= 1;
      } else if (e.key === "ArrowDown" && row < lastRow) {
        row += 1;
      } else if (e.key === "ArrowLeft" && col > 0) {
        col -= 1;
      } else if (
        (e.key === "ArrowRight" || e.key === "Tab") &&
        col < lastCol
      ) {
        col += 1;
        if (e.key === "Tab") e.preventDefault();
      } else if (e.key === "Enter") {
        if (canEdit && cols[col]?.editable) {
          setEditing({ row, col });
          e.preventDefault();
        }
        return;
      } else if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        const r = sortedRows[row];
        const c = cols[col];
        if (r && c) {
          const v = String(resolveValue(c, r) ?? "");
          navigator.clipboard?.writeText(v);
          toast.success(`Copied "${v.slice(0, 24)}${v.length > 24 ? "…" : ""}"`);
        }
        return;
      } else {
        return;
      }
      e.preventDefault();
      setSelected({ row, col });
    },
    [editing, selected, sortedRows, cols, canEdit],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const editableCount = cols.filter((c) => c.editable).length;

  const rowPadY = density === "compact" ? "py-1" : "py-1.5";
  const cellTextSize = density === "compact" ? "text-[0.65rem]" : "text-[0.7rem]";

  return (
    <section className="rounded-2xl bg-bg-white border border-border flex flex-col min-w-0 overflow-hidden shadow-sm relative">
      {/* Toolbar */}
      <header className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-border flex-wrap bg-gradient-to-br from-bg-surface/60 via-bg-white to-bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-bg-surface border border-border text-text-secondary shadow-sm">
            <Database size={15} aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-[0.82rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
              {table.label}
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            </h3>
            {table.description && (
              <p className="text-[0.6rem] text-text-tertiary truncate">
                {table.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.55rem] font-extrabold border whitespace-nowrap transition-all",
              canEdit
                ? "bg-warning-bg text-warning border-warning/20"
                : "bg-bg-muted text-text-tertiary border-border",
            )}
          >
            {canEdit ? (
              <Pencil size={9} aria-hidden />
            ) : (
              <Lock size={9} aria-hidden />
            )}
            {canEdit ? "Edit mode" : "Read only"}
          </span>
          <label className="relative inline-flex items-center">
            <Search
              size={11}
              aria-hidden
              className="absolute left-2 text-text-tertiary pointer-events-none"
            />
            <input
              type="text"
              value={search}
              placeholder="Search…"
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 pr-2.5 rounded-lg border border-border bg-bg-white text-[0.72rem] font-bold text-text-primary min-w-[160px] focus:outline-none focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1 inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-text-primary"
              >
                <X size={10} aria-hidden />
              </button>
            )}
          </label>

          {/* Density toggle */}
          <button
            type="button"
            onClick={() =>
              setDensity((d) => (d === "compact" ? "cozy" : "compact"))
            }
            title={density === "compact" ? "Switch to cozy" : "Switch to compact"}
            className="inline-flex items-center gap-1 px-2 h-8 rounded-lg border border-border bg-bg-white text-text-secondary text-[0.62rem] font-extrabold hover:bg-bg-muted/40 hover:border-[--accent]/40 transition-colors"
          >
            <Rows3 size={11} aria-hidden /> {density === "compact" ? "Cozy" : "Compact"}
          </button>

          {/* Column visibility menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColsMenu((s) => !s)}
              className="inline-flex items-center gap-1 px-2 h-8 rounded-lg border border-border bg-bg-white text-text-secondary text-[0.62rem] font-extrabold hover:bg-bg-muted/40 hover:border-[--accent]/40 transition-colors"
            >
              <Columns3 size={11} aria-hidden /> {presentCols.length - hiddenCols.size}/{presentCols.length}
            </button>
            {showColsMenu && (
              <div className="absolute right-0 top-9 z-30 w-56 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-bg-white shadow-xl p-1 text-[0.7rem]">
                <div className="px-2 py-1.5 text-[0.55rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary border-b border-border mb-1">
                  Toggle columns
                </div>
                {presentCols.map((c) => {
                  const hidden = hiddenCols.has(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleColVisibility(c.key)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-muted/50 text-left"
                    >
                      {hidden ? (
                        <EyeOff size={11} className="text-text-tertiary" aria-hidden />
                      ) : (
                        <Eye size={11} className="text-success" aria-hidden />
                      )}
                      <span
                        className={cn(
                          "flex-1 truncate font-bold",
                          hidden ? "text-text-tertiary" : "text-text-primary",
                        )}
                      >
                        {c.label}
                      </span>
                      <ColIcon type={c.type} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-border bg-bg-white text-text-primary text-[0.65rem] font-extrabold hover:bg-bg-muted/40 hover:border-[--accent] transition-colors"
          >
            <Download size={11} aria-hidden /> CSV
          </button>
        </div>
      </header>

      {/* Stats strip */}
      <div className="px-3 sm:px-4 py-1.5 border-b border-border bg-bg-surface/40 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary flex-wrap">
        <span>
          <span className="text-text-primary tabular">{sortedRows.length}</span>{" "}
          / {rows.length} rows
        </span>
        <span>·</span>
        <span>
          <span className="text-text-primary tabular">{cols.length}</span> /{" "}
          {presentCols.length} columns
        </span>
        {canEdit && (
          <>
            <span>·</span>
            <span>
              <span className="text-warning tabular">{editableCount}</span> editable
            </span>
          </>
        )}
        {sortKey && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-text-secondary">
              Sort
              {sortDir === "asc" ? (
                <ArrowUp size={9} aria-hidden />
              ) : (
                <ArrowDown size={9} aria-hidden />
              )}
              {cols.find((c) => c.key === sortKey)?.label ?? sortKey}
              <button
                type="button"
                onClick={() => setSortKey(null)}
                className="ml-0.5 text-text-tertiary hover:text-text-primary"
              >
                <X size={9} aria-hidden />
              </button>
            </span>
          </>
        )}
        {hiddenCols.size > 0 && (
          <>
            <span>·</span>
            <button
              type="button"
              onClick={() => setHiddenCols(new Set())}
              className="text-[--accent] hover:underline"
            >
              Show all columns
            </button>
          </>
        )}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className="overflow-auto max-h-[calc(100vh-340px)] relative"
      >
        {sortedRows.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-[0.7rem] sm:text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-bg-surface shadow-[0_1px_0_var(--color-border)]">
              <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.55rem] font-extrabold">
                <th
                  className={cn(
                    "bg-bg-surface text-center px-2 py-2 border-r border-border w-10 min-w-[40px]",
                    pinnedCols.length > 0 && "shadow-[2px_0_0_var(--accent)_inset]",
                  )}
                  style={
                    pinnedCols.length > 0
                      ? { position: "sticky", left: 0, zIndex: 26 }
                      : undefined
                  }
                >
                  #
                </th>
                {cols.map((c, idx) => {
                  const isPinned = pinnedCols.includes(c.key);
                  const stickyLeft = pinnedLeftOffsets.get(c.key);
                  const stickyStyle: CSSProperties = isPinned
                    ? {
                        position: "sticky",
                        left: (stickyLeft ?? 0) + 40,
                        zIndex: 25,
                      }
                    : {};
                  return (
                    <th
                      key={c.key}
                      style={{
                        width: c.width,
                        minWidth: c.width,
                        ...stickyStyle,
                      }}
                      className={cn(
                        "text-left px-2 py-2 select-none whitespace-nowrap border-r border-border/40 last:border-r-0 group transition-colors",
                        isPinned
                          ? "bg-[#FAF5E0] shadow-[2px_0_0_var(--accent)_inset]"
                          : "bg-bg-surface hover:bg-bg-muted/60",
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 w-full">
                        <span className="text-text-tertiary text-[0.5rem] font-bold opacity-60 group-hover:opacity-100">
                          {colLetter(idx)}
                        </span>
                        <ColIcon type={c.type} />
                        <span
                          className="cursor-pointer flex-1 min-w-0 truncate"
                          onClick={() => handleSort(c.key)}
                          title="Sort by this column"
                        >
                          {c.label}
                        </span>
                        {sortKey === c.key &&
                          (sortDir === "asc" ? (
                            <ArrowUp
                              size={9}
                              aria-hidden
                              className="text-[--accent] shrink-0"
                            />
                          ) : (
                            <ArrowDown
                              size={9}
                              aria-hidden
                              className="text-[--accent] shrink-0"
                            />
                          ))}
                        {c.editable && canEdit && (
                          <Pencil
                            size={8}
                            aria-hidden
                            className="text-warning opacity-50 group-hover:opacity-100 shrink-0"
                          />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePin(c.key);
                          }}
                          aria-label={
                            isPinned
                              ? `Unfreeze ${c.label}`
                              : `Freeze ${c.label} column`
                          }
                          title={
                            isPinned
                              ? "Unfreeze column"
                              : "Freeze column to the left"
                          }
                          className={cn(
                            "shrink-0 inline-flex items-center justify-center w-4 h-4 rounded transition-all",
                            isPinned
                              ? "text-[--accent] bg-[--accent]/15 opacity-100"
                              : "text-text-tertiary opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-bg-muted",
                          )}
                        >
                          {isPinned ? (
                            <PinOff size={9} aria-hidden />
                          ) : (
                            <Pin size={9} aria-hidden />
                          )}
                        </button>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIdx) => {
                const rowKey = String(row[table.pk] ?? rowIdx);
                const isRowSelected = selected?.row === rowIdx;
                return (
                  <tr
                    key={`${rowKey}-${rowIdx}`}
                    className={cn(
                      "transition-colors border-b border-border/50 last:border-b-0 group",
                      rowIdx % 2 === 0
                        ? "bg-bg-white"
                        : "bg-bg-surface/20",
                      isRowSelected
                        ? "!bg-[--accent]/10"
                        : "hover:bg-bg-muted/40",
                    )}
                  >
                    <td
                      className={cn(
                        "text-center px-2 border-r border-border text-text-tertiary text-[0.62rem] font-extrabold tabular select-none cursor-pointer transition-colors",
                        rowPadY,
                        rowIdx % 2 === 0
                          ? "bg-bg-white"
                          : "bg-bg-surface/20",
                        isRowSelected && "!bg-[--accent]/15 text-text-primary",
                        "group-hover:bg-bg-muted/40",
                        pinnedCols.length > 0 &&
                          "shadow-[2px_0_0_var(--accent)_inset]",
                      )}
                      style={
                        pinnedCols.length > 0
                          ? { position: "sticky", left: 0, zIndex: 16 }
                          : undefined
                      }
                      onClick={() =>
                        setSelected({ row: rowIdx, col: -1 })
                      }
                    >
                      {rowIdx + 1}
                    </td>
                    {cols.map((c, colIdx) => {
                      const cellId = `${rowKey}::${c.key}`;
                      const isSelected =
                        selected?.row === rowIdx && selected?.col === colIdx;
                      const isEditing =
                        editing?.row === rowIdx && editing?.col === colIdx;
                      const isPinned = pinnedCols.includes(c.key);
                      const pinnedLeft = pinnedLeftOffsets.get(c.key);
                      const cellCommentKey = `${rowKey}::${c.key}`;
                      const cellComments =
                        commentsByCell.get(cellCommentKey) ?? [];
                      const recentEdit = recentEdits.get(cellCommentKey);
                      return (
                        <Cell
                          key={c.key}
                          col={c}
                          value={resolveValue(c, row)}
                          rowKey={rowKey}
                          tableId={table.id}
                          canEdit={canEdit && c.editable === true}
                          isSelected={isSelected}
                          isFlashed={flashed === cellId}
                          isEditing={isEditing}
                          padY={rowPadY}
                          textSize={cellTextSize}
                          search={normalizedQuery}
                          recentEdit={recentEdit}
                          isPinned={isPinned}
                          pinnedLeft={
                            isPinned ? (pinnedLeft ?? 0) + 40 : undefined
                          }
                          rowStripeBg={
                            rowIdx % 2 === 0 ? "bg-bg-white" : "bg-bg-surface/20"
                          }
                          commentCount={cellComments.length}
                          openComments={
                            canEdit
                              ? () =>
                                  setOpenCommentCell({
                                    rowKey,
                                    column: c.key,
                                    label: `${c.label} · ${String(row[table.pk] ?? rowIdx + 1)}`,
                                  })
                              : undefined
                          }
                          onSelect={() =>
                            setSelected({ row: rowIdx, col: colIdx })
                          }
                          onStartEdit={() =>
                            setEditing({ row: rowIdx, col: colIdx })
                          }
                          onStopEdit={() => setEditing(null)}
                          onSaved={() => {
                            flashCell(cellId);
                            void loadRecentEdits();
                            router.refresh();
                          }}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <footer className="px-3 sm:px-4 py-2 border-t border-border text-[0.6rem] text-text-tertiary flex items-center justify-between gap-2 bg-bg-surface/30">
        <div className="flex items-center gap-3 flex-wrap">
          {selected && selected.col >= 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[--accent]/15 text-text-primary font-extrabold border border-[--accent]/30 tabular">
              <Sparkles size={9} aria-hidden /> R{selected.row + 1} ·{" "}
              {colLetter(selected.col)} ·{" "}
              {cols[selected.col]?.label}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 text-[0.58rem]">
          <Keyboard size={9} aria-hidden />
          <kbd className="font-mono">↑↓←→</kbd> nav · <kbd className="font-mono">Enter</kbd> edit · <kbd className="font-mono">⌘C</kbd> copy · <kbd className="font-mono">Esc</kbd> close
        </span>
      </footer>

      {openCommentCell && (
        <CellCommentThread
          tableId={table.id}
          rowKey={openCommentCell.rowKey}
          column={openCommentCell.column}
          cellLabel={openCommentCell.label}
          currentUserEmail={currentUserEmail}
          initialComments={
            commentsByCell.get(
              `${openCommentCell.rowKey}::${openCommentCell.column}`,
            ) ?? []
          }
          onClose={() => setOpenCommentCell(null)}
          onChange={(next) =>
            applyCommentChange(
              openCommentCell.rowKey,
              openCommentCell.column,
              next,
            )
          }
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ColIcon({ type }: { type: ColType }) {
  const Icon = TYPE_ICON[type] ?? TypeIcon;
  return (
    <Icon
      size={9}
      aria-hidden
      className="text-text-tertiary opacity-70"
    />
  );
}

function Cell({
  col,
  value,
  rowKey,
  tableId,
  canEdit,
  isSelected,
  isFlashed,
  isEditing,
  padY,
  textSize,
  search,
  recentEdit,
  isPinned,
  pinnedLeft,
  rowStripeBg,
  commentCount,
  openComments,
  onSelect,
  onStartEdit,
  onStopEdit,
  onSaved,
}: {
  col: ColDef;
  value: unknown;
  rowKey: string;
  tableId: string;
  canEdit: boolean;
  isSelected: boolean;
  isFlashed: boolean;
  isEditing: boolean;
  padY: string;
  textSize: string;
  search: string;
  recentEdit?: RecentEdit;
  isPinned?: boolean;
  pinnedLeft?: number;
  rowStripeBg?: string;
  commentCount?: number;
  openComments?: () => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(() => rawString(value, col));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!isEditing) setDraft(rawString(value, col));
  }, [value, col, isEditing]);

  const submit = () => {
    if (draft === rawString(value, col)) {
      onStopEdit();
      return;
    }
    startTransition(async () => {
      const res = await updateSheetCell({
        tableId,
        rowKey,
        column: col.key,
        value: draft,
      });
      if (res.ok) {
        toast.success(`${col.label} updated`, {
          icon: "✓",
        });
        onStopEdit();
        onSaved();
      } else {
        toast.error(res.error ?? "Save failed");
      }
    });
  };

  const cancel = () => {
    setDraft(rawString(value, col));
    onStopEdit();
  };

  const onKey = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
    e.stopPropagation();
  };

  const baseCell = cn(
    "px-2 whitespace-nowrap truncate border-r border-border/30 last:border-r-0 transition-all relative",
    padY,
    textSize,
    canEdit && !isEditing && "cursor-pointer",
    isSelected && "ring-2 ring-[--accent] ring-inset z-[5]",
    isFlashed && "bg-success-bg/70",
    isPinned &&
      "shadow-[2px_0_0_var(--accent)_inset]",
    isPinned && (rowStripeBg ?? "bg-bg-white"),
  );

  const pinnedStyle: CSSProperties | undefined = isPinned
    ? { position: "sticky", left: pinnedLeft, zIndex: 15 }
    : undefined;

  if (isEditing) {
    if (col.type === "select" || col.type === "status") {
      return (
        <td className={baseCell} style={pinnedStyle}>
          <select
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submit}
            onKeyDown={onKey}
            className="h-7 w-full rounded border-2 border-warning bg-bg-white text-[0.72rem] font-bold text-text-primary px-1 focus:outline-none focus:ring-2 focus:ring-warning/30"
            disabled={pending}
          >
            <option value="">—</option>
            {(col.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </td>
      );
    }
    return (
      <td className={baseCell} style={pinnedStyle}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={onKey}
          type={
            col.type === "number" || col.type === "currency"
              ? "number"
              : col.type === "date"
                ? "date"
                : "text"
          }
          className="h-7 w-full rounded border-2 border-warning bg-bg-white text-[0.72rem] font-bold text-text-primary px-1 focus:outline-none focus:ring-2 focus:ring-warning/30"
          disabled={pending}
        />
        {pending && (
          <span className="absolute inset-y-0 right-1 inline-flex items-center text-warning">
            <Sparkles size={10} className="animate-spin" aria-hidden />
          </span>
        )}
      </td>
    );
  }

  return (
    <td
      className={cn(baseCell, "group/cell")}
      style={pinnedStyle}
      onClick={onSelect}
      onDoubleClick={() => canEdit && onStartEdit()}
      title={canEdit ? "Double-click to edit" : undefined}
    >
      {isFlashed && (
        <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center text-success">
          <CheckCircle2 size={10} aria-hidden />
        </span>
      )}
      {renderValue(value, col, search)}
      {openComments && (commentCount ?? 0) > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openComments();
          }}
          className="absolute top-0 right-0 inline-flex items-center gap-0.5 px-1 h-4 text-[0.55rem] font-extrabold rounded-bl-md bg-[--accent]/95 text-text-primary border-l border-b border-[--accent] hover:brightness-95 transition"
          title={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
        >
          <MessageSquareIcon size={8} aria-hidden />
          {commentCount}
        </button>
      )}
      {openComments && (commentCount ?? 0) === 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openComments();
          }}
          className="absolute top-0.5 right-0.5 inline-flex items-center justify-center w-4 h-4 rounded text-text-tertiary opacity-0 group-hover/cell:opacity-100 hover:bg-bg-muted hover:text-text-primary transition"
          title="Add comment"
        >
          <MessageSquareIcon size={9} aria-hidden />
        </button>
      )}
      {recentEdit && <EditedBadge edit={recentEdit} />}
    </td>
  );
}

/**
 * "edited" indicator — shown on cells changed within the last 7 days. The
 * server action only returns edits inside that window, so the badge fades out
 * on its own once the edit ages past 7 days. Tooltip shows editor + timestamp.
 */
function EditedBadge({ edit }: { edit: RecentEdit }) {
  const when = (() => {
    const d = new Date(edit.editedAt);
    if (Number.isNaN(d.getTime())) return edit.editedAt;
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  })();
  const who = edit.editedBy ?? "unknown";
  return (
    <span
      className="absolute bottom-0 left-0 inline-flex items-center gap-0.5 px-1 h-3.5 text-[0.5rem] font-extrabold rounded-tr-md bg-warning-bg text-warning border-t border-r border-warning/25 select-none"
      title={`Edited by ${who} · ${when}`}
    >
      <History size={7} aria-hidden />
      edited
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
      <div className="relative">
        <span className="absolute inset-0 rounded-full bg-[--accent]/20 blur-2xl animate-pulse" />
        <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-bg-surface border border-border">
          <Database size={22} className="text-text-secondary" aria-hidden />
        </span>
      </div>
      <h4 className="text-sm font-extrabold text-text-primary">No rows here yet</h4>
      <p className="text-[0.7rem] text-text-tertiary text-center max-w-xs">
        Either the table is empty, the column you searched doesn't match, or the
        schema migration hasn't applied yet on this environment.
      </p>
    </div>
  );
}

function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function rawString(value: unknown, col: ColDef): string {
  if (value == null) return "";
  if (col.type === "bool") return value ? "true" : "false";
  if (col.type === "date") {
    const v = String(value);
    return v.slice(0, 10);
  }
  return String(value);
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[--accent]/40 text-text-primary rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function renderValue(
  value: unknown,
  col: ColDef,
  search: string,
): React.ReactNode {
  if (value == null || value === "") {
    return <span className="text-text-tertiary">—</span>;
  }
  if (col.type === "number") {
    return (
      <span className="tabular text-text-primary">
        {Number(value).toLocaleString()}
      </span>
    );
  }
  if (col.type === "currency") {
    return (
      <span className="tabular text-text-primary font-bold">
        {formatRupees(Number(value))}
      </span>
    );
  }
  if (col.type === "date") {
    return (
      <span className="tabular text-text-secondary">
        {formatDate(String(value)) ?? "—"}
      </span>
    );
  }
  if (col.type === "datetime") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return <span>—</span>;
    return (
      <span className="tabular text-text-secondary text-[0.62rem]">
        {d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    );
  }
  if (col.type === "bool") {
    return value ? (
      <Check size={12} className="text-success inline" aria-hidden />
    ) : (
      <X size={12} className="text-text-tertiary inline" aria-hidden />
    );
  }
  if (col.type === "status") {
    const text = String(value);
    const tone = statusTone(text);
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-full text-[0.55rem] font-extrabold border whitespace-nowrap",
          tone,
        )}
      >
        {highlight(text, search)}
      </span>
    );
  }
  const text = String(value);
  if (/^https?:\/\//.test(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#3B6FD4] underline truncate inline-block max-w-[220px] hover:text-[#2c5db3]"
        onClick={(e) => e.stopPropagation()}
      >
        {highlight(text, search)}
      </a>
    );
  }
  return <span className="text-text-primary">{highlight(text, search)}</span>;
}

function statusTone(s: string): string {
  const t = s.toLowerCase();
  if (t.includes("reach out"))
    return "bg-warning-bg text-warning border-warning/20";
  if (t.includes("on board") || t.includes("order sent"))
    return "bg-[#E8EEFB] text-[#3B6FD4] border-[#3B6FD4]/15";
  if (t === "posted") return "bg-[#E2F1FA] text-[#06B6D4] border-[#06B6D4]/20";
  if (t === "delivered" || t === "done")
    return "bg-success-bg text-success border-success/20";
  if (t === "rto" || t.includes("cancel"))
    return "bg-danger-bg text-danger border-danger/20";
  if (t === "due") return "bg-warning-bg text-warning border-warning/20";
  if (t === "not due") return "bg-bg-muted text-text-tertiary border-border";
  return "bg-bg-muted text-text-secondary border-border";
}

function toCsv(cols: ColDef[], rows: SheetRow[]): string {
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = cols.map((c) => escape(c.label)).join(",");
  const lines = rows.map((r) =>
    cols.map((c) => escape(resolveValue(c, r))).join(","),
  );
  return [header, ...lines].join("\n");
}
