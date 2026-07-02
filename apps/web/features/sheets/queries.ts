import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import {
  SHEET_TABLES,
  type ColType,
  type SheetData,
  type SheetTable,
} from "./types";

export function getSheetTableById(id: string): SheetTable | null {
  return SHEET_TABLES.find((t) => t.id === id) ?? null;
}

/**
 * Lightweight count fetch for tab badges. Runs all 10 tables in parallel
 * using `head: true` so PostgREST returns only the COUNT header — no rows
 * shipped. Cached 60s (global data, service client, no cookies) so switching
 * sheet tabs doesn't re-count 10 tables per navigation; badge counts
 * tolerate a minute's staleness.
 */
export const fetchTabCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const supabase = createServiceClient();
    const out: Record<string, number> = {};
    await Promise.all(
      SHEET_TABLES.map(async (t) => {
        try {
          const { count, error } = await (supabase as any)
            .from(t.table)
            .select("*", { count: "exact", head: true });
          out[t.id] = error ? 0 : (count ?? 0);
        } catch {
          out[t.id] = 0;
        }
      }),
    );
    return out;
  },
  ["sheets-tab-counts"],
  { revalidate: 60, tags: ["posts", "creators", "campaigns", "payments"] },
);

/**
 * PostgREST caps each response at 1000 rows. To return the full table we
 * page through with `.range(start, end)` until an empty/short page comes
 * back. A safety ceiling of `MAX_ROWS` prevents runaway memory on truly
 * huge tables (`posts` could approach 100k once at scale).
 */
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;

export async function fetchSheetData(tableId: string): Promise<SheetData> {
  const tbl = getSheetTableById(tableId);
  if (!tbl) return { rows: [], rowCount: 0, tableId };

  const supabase = createServiceClient();
  const ceiling = Math.min(tbl.rowLimit ?? MAX_ROWS, MAX_ROWS);

  const allRows: Array<Record<string, unknown>> = [];
  let from = 0;
  let totalCount = 0;
  let firstError: { message?: string } | null = null;

  while (from < ceiling) {
    const to = Math.min(from + PAGE_SIZE - 1, ceiling - 1);
    let q = (supabase as any)
      .from(tbl.table)
      .select("*", { count: "exact" })
      .range(from, to);
    if (tbl.defaultSort) {
      q = q.order(tbl.defaultSort.col, {
        ascending: tbl.defaultSort.dir === "asc",
      });
    }
    const res = await q;
    if (res.error) {
      firstError = res.error;
      break;
    }
    const page = (res.data ?? []) as Array<Record<string, unknown>>;
    totalCount = (res.count ?? totalCount) as number;
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break; // last page reached
    from += PAGE_SIZE;
  }

  if (firstError && allRows.length === 0) {
    const msg =
      firstError.message ?? JSON.stringify(firstError) ?? "unknown";
    console.warn(`[sheets] ${tableId} query soft-failed:`, msg);
    return { rows: [], rowCount: 0, tableId };
  }

  return {
    rows: allRows,
    rowCount: totalCount || allRows.length,
    tableId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server mode — big tables (row count above the threshold) never ship the
// whole table to the client. Search + sort + pagination run in Postgres and
// `fetchSheetPage` returns exactly one page plus the exact filtered count.
// ─────────────────────────────────────────────────────────────────────────────

/** Row-count threshold above which a tab switches to server mode. */
export const SERVER_MODE_ROW_THRESHOLD = 2000;

/** Server page size — matches the grid's render page size. */
export const SERVER_PAGE_SIZE = 100;

/** Column types that participate in the ilike search fan-out. */
const SEARCHABLE_TYPES: ReadonlySet<ColType> = new Set([
  "text",
  "select",
  "status",
]);

/**
 * The ilike VALUE is embedded double-quoted (`col.ilike."*term*"`), which
 * PostgREST treats as a literal — commas, parens and dots inside it are safe
 * (verified against the live API: `*its.me*` matches its.me.himaniiii).
 * Only the quote/backslash (would terminate the quoted literal) and the
 * LIKE/PostgREST wildcards `%` `*` are stripped. `_` (single-char wildcard)
 * is kept: half the creator handles contain it, and matching "any one char"
 * there is strictly better than not matching at all.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/["\\%*]/g, "").trim();
}

/** Columns that hold URLs/blobs — searching them matches everything via
 * substrings like "https" or "jpg", so they sit out of the fan-out. */
const SEARCH_EXCLUDED_KEY = /(_link|_url|_pic|_dump|_json)$|^(profile_pic|raw_dump)$/i;

/**
 * The curated ColDefs deliberately list columns that may not exist on the
 * live table yet (the grid drops absent ones at render time) — but a single
 * missing column inside `.or()`/`.order()` 400s the WHOLE query (42703).
 * One cached 1-row probe per table yields the real column set to intersect
 * against. Empty table → null (callers fall back to the curated list).
 */
const getLiveColumnKeys = unstable_cache(
  async (tableName: string): Promise<string[] | null> => {
    const supabase = createServiceClient();
    const { data, error } = await (supabase as any)
      .from(tableName)
      .select("*")
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return Object.keys(data[0] as Record<string, unknown>);
  },
  ["sheets-live-columns"],
  { revalidate: 300 },
);

function isRangeError(error: { code?: string; message?: string }): boolean {
  return (
    error?.code === "PGRST103" ||
    /range not satisfiable/i.test(error?.message ?? "")
  );
}

export interface SheetPageOpts {
  q?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

/**
 * Fetch ONE page of a table with search + sort + count applied in Postgres.
 *
 * - Search: case-insensitive substring across the table's real text-ish
 *   columns (never virtual, never number/currency/date/bool).
 * - Sort: `sortKey` is whitelisted against the table's real column keys —
 *   anything else falls back to the table's default sort (then pk). A pk
 *   tiebreaker keeps pagination deterministic.
 * - Page: zero-based. A stale page beyond the filtered count (PostgREST 416)
 *   self-heals by re-running at page 0; the effective page is returned.
 */
export async function fetchSheetPage(
  tableId: string,
  opts: SheetPageOpts,
): Promise<SheetData & { serverMode: true; page: number }> {
  const tbl = getSheetTableById(tableId);
  if (!tbl) {
    return { rows: [], rowCount: 0, tableId, serverMode: true, page: 0 };
  }

  const supabase = createServiceClient();
  const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize) || 1), 1000);
  const requestedPage = Math.max(0, Math.floor(opts.page) || 0);

  // Intersect curated defs with the LIVE column set — a curated-but-missing
  // column (creators.email) inside .or()/.order() would 400 the whole page.
  const liveKeys = await getLiveColumnKeys(tbl.table);
  const existsLive = (key: string) => liveKeys == null || liveKeys.includes(key);

  const term = sanitizeSearchTerm(opts.q ?? "");
  const searchableCols = tbl.columns.filter(
    (c) =>
      !c.virtual &&
      SEARCHABLE_TYPES.has(c.type) &&
      !SEARCH_EXCLUDED_KEY.test(c.key) &&
      existsLive(c.key),
  );

  const sortableKeys = new Set(
    tbl.columns
      .filter((c) => !c.virtual && existsLive(c.key))
      .map((c) => c.key),
  );
  const sortValid = !!opts.sortKey && sortableKeys.has(opts.sortKey);
  const defaultSortCol =
    tbl.defaultSort && existsLive(tbl.defaultSort.col)
      ? tbl.defaultSort.col
      : tbl.pk;
  const sortCol = sortValid ? (opts.sortKey as string) : defaultSortCol;
  const ascending = sortValid
    ? opts.sortDir !== "desc"
    : tbl.defaultSort
      ? tbl.defaultSort.dir === "asc"
      : true;

  const runPage = async (page: number) => {
    let q = (supabase as any)
      .from(tbl.table)
      .select("*", { count: "exact" });
    if (term && searchableCols.length > 0) {
      // Double-quoted literal value — dots/commas/parens in the term are safe.
      q = q.or(
        searchableCols.map((c) => `${c.key}.ilike."*${term}*"`).join(","),
      );
    }
    q = q.order(sortCol, { ascending });
    if (sortCol !== tbl.pk) q = q.order(tbl.pk, { ascending: true });
    return q.range(page * pageSize, page * pageSize + pageSize - 1);
  };

  let page = requestedPage;
  let res = await runPage(page);
  if (res.error && page > 0 && isRangeError(res.error)) {
    page = 0;
    res = await runPage(0);
  }

  if (res.error) {
    const msg = res.error.message ?? JSON.stringify(res.error) ?? "unknown";
    console.warn(`[sheets] ${tableId} page query soft-failed:`, msg);
    return { rows: [], rowCount: 0, tableId, serverMode: true, page: 0 };
  }

  return {
    rows: (res.data ?? []) as Array<Record<string, unknown>>,
    rowCount: (res.count ?? 0) as number,
    tableId,
    serverMode: true,
    page,
  };
}
