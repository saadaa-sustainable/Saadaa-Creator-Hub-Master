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
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
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
  RotateCcw,
  Rows3,
  Search,
  Sparkles,
  ToggleLeft,
  Trash2,
  Type as TypeIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  deleteSheetRows,
  fetchCellComments,
  fetchRecentCellEdits,
  fetchRecentDeletions,
  resolveCellComment,
  restoreDeletedRows,
  updateSheetCell,
  type CellCommentRow,
  type DeletionLogRow,
  type RecentEdit,
} from "./actions";
import { CellCommentThread } from "./cell-comment-thread";
import { AllCommentsPanel, type FlatComment } from "./all-comments-panel";
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
  /** Global-Admin-only row delete. Independent of canEdit. */
  canDelete?: boolean;
  currentUserEmail?: string | null;
}

type Density = "cozy" | "compact";

// Client-side resolvers for virtual columns — keyed on ColDef.key. The schema
// defines `virtual: true` but cannot ship a function over the RSC boundary.
// (The parent/child Lineage column was retired with the collab-id model.)
const VIRTUAL_RESOLVERS: Record<string, (row: SheetRow) => unknown> = {};

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
  canDelete = false,
  currentUserEmail = null,
}: Props) {
  const router = useRouter();
  // Row delete is gated on BOTH the table opting in AND the actor being a
  // Global Admin (canDelete). Edit permission is intentionally not enough.
  const rowsDeletable = canDelete && table.deletable === true;
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

  // ── Row delete (Global-Admin only) ────────────────────────────────────────
  // Selection is keyed by primary-key value so it survives sort/filter.
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, startDeleting] = useTransition();
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletions, setDeletions] = useState<DeletionLogRow[]>([]);
  const [loadingDeletions, setLoadingDeletions] = useState(false);
  const [restoring, startRestoring] = useTransition();

  // Reset selection + close panels whenever the active tab changes.
  useEffect(() => {
    setSelectedRows(new Set());
    setConfirmOpen(false);
    setConfirmText("");
    setShowDeleted(false);
  }, [table.id]);

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
  const [showAllComments, setShowAllComments] = useState(false);

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
    const res = await fetchRecentCellEdits({
      tableId: table.id,
      withinDays: 7,
    });
    if (!res.ok) return;
    setRecentEdits(new Map(Object.entries(res.edits)));
  }, [table.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchRecentCellEdits({
        tableId: table.id,
        withinDays: 7,
      });
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

  // Flatten every cell comment for the "All comments" roll-up panel, stamping
  // each with its row key + a human column label.
  const flatComments = useMemo<FlatComment[]>(() => {
    const labelOf = new Map(mergedAll.map((c) => [c.key, c.label]));
    const out: FlatComment[] = [];
    for (const [key, list] of commentsByCell) {
      const [rowKey, column] = key.split("::");
      for (const c of list) {
        out.push({
          ...c,
          rowKey,
          column,
          columnLabel: labelOf.get(column) ?? column,
        });
      }
    }
    return out;
  }, [commentsByCell, mergedAll]);
  const openCommentCount = useMemo(
    () => flatComments.filter((c) => !c.resolved).length,
    [flatComments],
  );

  // Resolve / reopen from the All-comments panel — writes via the action, then
  // mirrors the change into the grid's comment map so badges update everywhere.
  const handlePanelResolveToggle = (c: FlatComment, resolved: boolean) => {
    void (async () => {
      const res = await resolveCellComment({ id: c.id, resolved });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const key = `${c.rowKey}::${c.column}`;
      const cur = commentsByCell.get(key) ?? [];
      applyCommentChange(
        c.rowKey,
        c.column,
        cur.map((x) =>
          x.id === c.id
            ? {
                ...x,
                resolved,
                resolved_by: resolved ? currentUserEmail : null,
                resolved_at: resolved ? new Date().toISOString() : null,
              }
            : x,
        ),
      );
    })();
  };

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

  // ── Selection + delete helpers ────────────────────────────────────────────
  const visibleRowKeys = useMemo(
    () => sortedRows.map((r) => String(r[table.pk] ?? "")).filter(Boolean),
    [sortedRows, table.pk],
  );
  const allVisibleSelected =
    visibleRowKeys.length > 0 && visibleRowKeys.every((k) => selectedRows.has(k));
  const selectedCount = selectedRows.size;
  const BULK_CONFIRM_THRESHOLD = 10;
  const needsTypedConfirm = selectedCount >= BULK_CONFIRM_THRESHOLD;

  const toggleRow = (rowKey: string) => {
    if (!rowKey) return;
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedRows((prev) => {
      if (visibleRowKeys.length > 0 && visibleRowKeys.every((k) => prev.has(k))) {
        const next = new Set(prev);
        for (const k of visibleRowKeys) next.delete(k);
        return next;
      }
      return new Set([...prev, ...visibleRowKeys]);
    });
  };

  const undoDelete = (deletionIds: number[]) => {
    if (deletionIds.length === 0) return;
    startRestoring(async () => {
      const r = await restoreDeletedRows({ deletionIds });
      if (r.ok) {
        toast.success(`Restored ${r.restored} row${r.restored === 1 ? "" : "s"}`);
        router.refresh();
      } else {
        toast.error(r.error ?? "Restore failed");
      }
    });
  };

  const runDelete = () => {
    if (selectedCount === 0) return;
    if (needsTypedConfirm && confirmText.trim().toUpperCase() !== "DELETE") return;
    const rowKeys = Array.from(selectedRows);
    startDeleting(async () => {
      const res = await deleteSheetRows({ tableId: table.id, rowKeys });
      if (!res.ok && res.error && res.deleted.length === 0) {
        toast.error(res.error);
        return;
      }
      if (res.deleted.length > 0) {
        toast.success(
          res.blocked.length > 0
            ? `Deleted ${res.deleted.length} · ${res.blocked.length} blocked`
            : `Deleted ${res.deleted.length} row${res.deleted.length === 1 ? "" : "s"}`,
          res.deletionIds.length > 0
            ? {
                duration: 8000,
                action: {
                  label: "Undo",
                  onClick: () => undoDelete(res.deletionIds),
                },
              }
            : undefined,
        );
      }
      if (res.blocked.length > 0) {
        const first = res.blocked[0];
        toast.error(
          res.blocked.length === 1
            ? `${first.rowKey}: ${first.reason}`
            : `${res.blocked.length} rows blocked — ${first.reason}`,
          { duration: 6000 },
        );
      }
      setSelectedRows(new Set());
      setConfirmOpen(false);
      setConfirmText("");
      router.refresh();
    });
  };

  const openHistory = () => {
    setShowDeleted(true);
    setLoadingDeletions(true);
    void (async () => {
      const res = await fetchRecentDeletions({ tableId: table.id, withinDays: 30 });
      setLoadingDeletions(false);
      if (res.ok) setDeletions(res.deletions);
    })();
  };

  const restoreFromHistory = (id: number) => {
    startRestoring(async () => {
      const r = await restoreDeletedRows({ deletionIds: [id] });
      if (r.ok) {
        toast.success("Row restored");
        setDeletions((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, restoredAt: new Date().toISOString() } : d,
          ),
        );
        router.refresh();
      } else {
        toast.error(r.error ?? "Restore failed");
      }
    });
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
      } else if ((e.key === "ArrowRight" || e.key === "Tab") && col < lastCol) {
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
          toast.success(
            `Copied "${v.slice(0, 24)}${v.length > 24 ? "…" : ""}"`,
          );
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
  const cellTextSize =
    density === "compact" ? "text-[0.65rem]" : "text-[0.7rem]";

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
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
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
          <label className="relative inline-flex flex-1 items-center min-w-[180px] sm:flex-none">
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
              className="h-8 w-full pl-8 pr-2.5 rounded-lg border border-border bg-bg-white text-[0.72rem] font-bold text-text-primary min-w-0 sm:min-w-[160px] focus:outline-none focus:border-[--accent] focus:ring-2 focus:ring-[--accent]/20 transition-all"
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
            title={
              density === "compact" ? "Switch to cozy" : "Switch to compact"
            }
            className="inline-flex items-center gap-1 px-2 h-8 rounded-lg border border-border bg-bg-white text-text-secondary text-[0.62rem] font-extrabold hover:bg-bg-muted/40 hover:border-[--accent]/40 transition-colors"
          >
            <Rows3 size={11} aria-hidden />{" "}
            {density === "compact" ? "Cozy" : "Compact"}
          </button>

          {/* Column visibility menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColsMenu((s) => !s)}
              className="inline-flex items-center gap-1 px-2 h-8 rounded-lg border border-border bg-bg-white text-text-secondary text-[0.62rem] font-extrabold hover:bg-bg-muted/40 hover:border-[--accent]/40 transition-colors"
            >
              <Columns3 size={11} aria-hidden />{" "}
              {presentCols.length - hiddenCols.size}/{presentCols.length}
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
                        <EyeOff
                          size={11}
                          className="text-text-tertiary"
                          aria-hidden
                        />
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

          <button
            type="button"
            onClick={() => setShowAllComments(true)}
            title="All comments on this table (open + resolved)"
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-border bg-bg-white text-text-secondary text-[0.65rem] font-extrabold hover:bg-bg-muted/40 hover:border-[--accent] transition-colors"
          >
            <MessageSquareIcon size={11} aria-hidden /> Comments
            {openCommentCount > 0 && (
              <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[--accent] px-1 text-[0.6rem] font-extrabold text-text-primary tabular">
                {openCommentCount}
              </span>
            )}
          </button>

          {rowsDeletable && (
            <>
              <button
                type="button"
                onClick={openHistory}
                title="Recently deleted rows (restore)"
                className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-border bg-bg-white text-text-secondary text-[0.65rem] font-extrabold hover:bg-bg-muted/40 hover:border-[--accent] transition-colors"
              >
                <RotateCcw size={11} aria-hidden /> Trash
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={selectedCount === 0 || deleting}
                title={
                  selectedCount === 0
                    ? "Select rows to delete"
                    : `Delete ${selectedCount} selected`
                }
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[0.65rem] font-extrabold transition-colors",
                  selectedCount === 0 || deleting
                    ? "border-border bg-bg-muted/40 text-text-tertiary cursor-not-allowed"
                    : "border-danger/30 bg-danger-bg text-danger hover:brightness-95",
                )}
              >
                <Trash2 size={11} aria-hidden />
                {selectedCount > 0 ? `Delete ${selectedCount}` : "Delete"}
              </button>
            </>
          )}
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
              <span className="text-warning tabular">{editableCount}</span>{" "}
              editable
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
                    "bg-bg-surface text-center px-2 py-2 border-r border-border",
                    rowsDeletable ? "w-14 min-w-[56px]" : "w-10 min-w-[40px]",
                    pinnedCols.length > 0 &&
                      "shadow-[2px_0_0_var(--accent)_inset]",
                  )}
                  style={
                    pinnedCols.length > 0
                      ? { position: "sticky", left: 0, zIndex: 26 }
                      : undefined
                  }
                >
                  {rowsDeletable ? (
                    <input
                      type="checkbox"
                      aria-label="Select all visible rows"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            !allVisibleSelected &&
                            visibleRowKeys.some((k) => selectedRows.has(k));
                      }}
                      onChange={toggleAllVisible}
                      className="h-3.5 w-3.5 cursor-pointer align-middle accent-[--accent]"
                    />
                  ) : (
                    "#"
                  )}
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
                const selectKey =
                  row[table.pk] == null ? "" : String(row[table.pk]);
                const isChecked = selectKey !== "" && selectedRows.has(selectKey);
                const isRowSelected = selected?.row === rowIdx;
                return (
                  <tr
                    key={`${rowKey}-${rowIdx}`}
                    className={cn(
                      "transition-colors border-b border-border/50 last:border-b-0 group",
                      rowIdx % 2 === 0 ? "bg-bg-white" : "bg-bg-surface/20",
                      isChecked
                        ? "!bg-danger-bg/50"
                        : isRowSelected
                          ? "!bg-[--accent]/10"
                          : "hover:bg-bg-muted/40",
                    )}
                  >
                    <td
                      className={cn(
                        "text-center px-2 border-r border-border text-text-tertiary text-[0.62rem] font-extrabold tabular select-none transition-colors",
                        rowPadY,
                        rowIdx % 2 === 0 ? "bg-bg-white" : "bg-bg-surface/20",
                        isChecked && "!bg-danger-bg/60",
                        !isChecked &&
                          isRowSelected &&
                          "!bg-[--accent]/15 text-text-primary",
                        "group-hover:bg-bg-muted/40",
                        pinnedCols.length > 0 &&
                          "shadow-[2px_0_0_var(--accent)_inset]",
                      )}
                      style={
                        pinnedCols.length > 0
                          ? { position: "sticky", left: 0, zIndex: 16 }
                          : undefined
                      }
                    >
                      {rowsDeletable ? (
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Select row ${rowIdx + 1}`}
                            checked={isChecked}
                            disabled={selectKey === ""}
                            onChange={() => toggleRow(selectKey)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 cursor-pointer align-middle accent-[--accent]"
                          />
                          <button
                            type="button"
                            onClick={() => setSelected({ row: rowIdx, col: -1 })}
                            className="tabular cursor-pointer hover:text-text-primary"
                          >
                            {rowIdx + 1}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelected({ row: rowIdx, col: -1 })}
                          className="tabular cursor-pointer"
                        >
                          {rowIdx + 1}
                        </button>
                      )}
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
                            rowIdx % 2 === 0
                              ? "bg-bg-white"
                              : "bg-bg-surface/20"
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
              {colLetter(selected.col)} · {cols[selected.col]?.label}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 text-[0.58rem]">
          <Keyboard size={9} aria-hidden />
          <kbd className="font-mono">↑↓←→</kbd> nav ·{" "}
          <kbd className="font-mono">Enter</kbd> edit ·{" "}
          <kbd className="font-mono">⌘C</kbd> copy ·{" "}
          <kbd className="font-mono">Esc</kbd> close
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

      {showAllComments && (
        <AllCommentsPanel
          comments={flatComments}
          currentUserEmail={currentUserEmail}
          pending={false}
          onResolveToggle={handlePanelResolveToggle}
          onOpenCell={(rowKey, column, label) => {
            setShowAllComments(false);
            setOpenCommentCell({ rowKey, column, label });
          }}
          onClose={() => setShowAllComments(false)}
        />
      )}

      {confirmOpen && (
        <DeleteConfirm
          tableLabel={table.label}
          selectedKeys={Array.from(selectedRows)}
          needsTypedConfirm={needsTypedConfirm}
          confirmText={confirmText}
          onConfirmText={setConfirmText}
          deleting={deleting}
          onCancel={() => {
            setConfirmOpen(false);
            setConfirmText("");
          }}
          onConfirm={runDelete}
        />
      )}

      {showDeleted && (
        <DeletedHistory
          tableLabel={table.label}
          deletions={deletions}
          loading={loadingDeletions}
          restoring={restoring}
          onRestore={restoreFromHistory}
          onClose={() => setShowDeleted(false)}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders children inside a full-viewport modal backdrop, portaled to
 * document.body. Portaling is required — the grid lives inside an
 * overflow-hidden section, so an in-tree `fixed` overlay gets clipped to the
 * card instead of covering the page. Uses the shared `.modal-backdrop` (z-240,
 * blur, fade-in) so it sits above the sidebar like every other app modal.
 * Locks body scroll and closes on Escape / backdrop click.
 */
function ModalPortal({
  onClose,
  ariaLabel,
  children,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}

const MODAL_PANEL_ANIM = "modalPanelIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)";

function DeleteConfirm({
  tableLabel,
  selectedKeys,
  needsTypedConfirm,
  confirmText,
  onConfirmText,
  deleting,
  onCancel,
  onConfirm,
}: {
  tableLabel: string;
  selectedKeys: string[];
  needsTypedConfirm: boolean;
  confirmText: string;
  onConfirmText: (v: string) => void;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const count = selectedKeys.length;
  const preview = selectedKeys.slice(0, 8);
  const confirmReady =
    !deleting && count > 0 && (!needsTypedConfirm || confirmText.trim().toUpperCase() === "DELETE");

  return (
    <ModalPortal onClose={onCancel} ariaLabel="Confirm delete">
      <div
        className="w-full max-w-md rounded-2xl bg-bg-white border border-border shadow-[0_30px_80px_-36px_rgba(22,21,19,0.55)] p-5 sm:p-6"
        style={{ animation: MODAL_PANEL_ANIM }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger border border-danger/20">
            <AlertTriangle size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-text-primary">
              Delete {count} row{count === 1 ? "" : "s"} from {tableLabel}?
            </h3>
            <p className="mt-1 text-[0.72rem] text-text-secondary leading-relaxed">
              This permanently removes the row{count === 1 ? "" : "s"} from the
              live table. A snapshot is kept in the deletion log, so you can
              restore from <strong>Trash</strong> if needed. Rows still
              referenced elsewhere are blocked automatically.
            </p>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-border bg-bg-surface/50 p-2 text-[0.65rem] font-mono text-text-secondary">
            {preview.map((k) => (
              <div key={k} className="truncate">
                {k}
              </div>
            ))}
            {count > preview.length && (
              <div className="text-text-tertiary">+{count - preview.length} more</div>
            )}
          </div>
        )}

        {needsTypedConfirm && (
          <label className="mt-3 block">
            <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
              Type DELETE to confirm
            </span>
            <input
              autoFocus
              type="text"
              value={confirmText}
              onChange={(e) => onConfirmText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmReady) onConfirm();
              }}
              placeholder="DELETE"
              className="mt-1 h-9 w-full rounded-lg border border-border bg-bg-white px-2.5 text-[0.78rem] font-bold text-text-primary focus:outline-none focus:border-danger focus:ring-2 focus:ring-danger/20"
            />
          </label>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="inline-flex items-center px-3 h-9 rounded-lg border border-border bg-bg-white text-[0.72rem] font-extrabold text-text-secondary hover:bg-bg-muted/40 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmReady}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border text-[0.72rem] font-extrabold transition-colors",
              confirmReady
                ? "border-danger/30 bg-danger text-white hover:brightness-95"
                : "border-border bg-bg-muted/50 text-text-tertiary cursor-not-allowed",
            )}
          >
            {deleting ? (
              <Sparkles size={12} className="animate-spin" aria-hidden />
            ) : (
              <Trash2 size={12} aria-hidden />
            )}
            {deleting ? "Deleting…" : `Delete ${count}`}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

function DeletedHistory({
  tableLabel,
  deletions,
  loading,
  restoring,
  onRestore,
  onClose,
}: {
  tableLabel: string;
  deletions: DeletionLogRow[];
  loading: boolean;
  restoring: boolean;
  onRestore: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <ModalPortal onClose={onClose} ariaLabel="Recently deleted rows">
      <div
        className="w-full max-w-lg rounded-2xl bg-bg-white border border-border shadow-[0_30px_80px_-36px_rgba(22,21,19,0.55)] flex flex-col max-h-[80vh]"
        style={{ animation: MODAL_PANEL_ANIM }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-bg-surface border border-border text-text-secondary">
              <RotateCcw size={14} aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-text-primary truncate">
                Recently deleted · {tableLabel}
              </h3>
              <p className="text-[0.6rem] text-text-tertiary">Last 30 days · restore any row</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-bg-muted hover:text-text-primary"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="overflow-y-auto p-2">
          {loading ? (
            <div className="py-10 text-center text-[0.72rem] text-text-tertiary">
              Loading…
            </div>
          ) : deletions.length === 0 ? (
            <div className="py-10 text-center text-[0.72rem] text-text-tertiary">
              No deletions in the last 30 days.
            </div>
          ) : (
            deletions.map((d) => {
              const restored = !!d.restoredAt;
              const when = (() => {
                const dt = new Date(d.deletedAt);
                return Number.isNaN(dt.getTime())
                  ? d.deletedAt
                  : dt.toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
              })();
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="text-[0.72rem] font-bold text-text-primary truncate font-mono">
                      {d.preview}
                    </div>
                    <div className="text-[0.6rem] text-text-tertiary truncate">
                      {when} · {d.deletedBy}
                    </div>
                  </div>
                  {restored ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.55rem] font-extrabold bg-success-bg text-success border border-success/20 whitespace-nowrap">
                      <Check size={9} aria-hidden /> Restored
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRestore(d.id)}
                      disabled={restoring}
                      className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg border border-border bg-bg-white text-[0.62rem] font-extrabold text-text-primary hover:border-[--accent] hover:bg-bg-muted/40 disabled:opacity-60 whitespace-nowrap"
                    >
                      <RotateCcw size={10} aria-hidden /> Restore
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ColIcon({ type }: { type: ColType }) {
  const Icon = TYPE_ICON[type] ?? TypeIcon;
  return (
    <Icon size={9} aria-hidden className="text-text-tertiary opacity-70" />
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

  const submitValue = (next: string) => {
    if (next === rawString(value, col)) {
      onStopEdit();
      return;
    }
    startTransition(async () => {
      const res = await updateSheetCell({
        tableId,
        rowKey,
        column: col.key,
        value: next,
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

  const submit = () => submitValue(draft);

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
    isPinned && "shadow-[2px_0_0_var(--accent)_inset]",
    isPinned && (rowStripeBg ?? "bg-bg-white"),
  );

  const pinnedStyle: CSSProperties | undefined = isPinned
    ? { position: "sticky", left: pinnedLeft, zIndex: 15 }
    : undefined;

  if (isEditing) {
    if (col.type === "select" || col.type === "status") {
      return (
        <td className={baseCell} style={pinnedStyle}>
          <SearchableSelect
            value={draft}
            onChange={(v) => {
              setDraft(v);
              submitValue(v);
            }}
            options={[
              { value: "", label: "—" },
              ...(col.options ?? []).map((o) => ({ value: o, label: o })),
            ]}
            clearable
            disabled={pending}
            placeholder="—"
            searchPlaceholder="Search…"
            className="h-7 border-2 border-warning"
          />
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
      <h4 className="text-sm font-extrabold text-text-primary">
        No rows here yet
      </h4>
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
