import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { SHEET_TABLES, type SheetData, type SheetTable } from "./types";

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
