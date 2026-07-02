import { Suspense } from "react";
import { Sheet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { SheetsBody } from "@/features/sheets/page-client";
import {
  fetchSheetData,
  fetchSheetPage,
  fetchTabCounts,
  getSheetTableById,
  SERVER_MODE_ROW_THRESHOLD,
  SERVER_PAGE_SIZE,
} from "@/features/sheets/queries";
import { SHEET_TABLES } from "@/features/sheets/types";

export const metadata = { title: "Sheet View" };

interface SheetsSearchParams {
  tab?: string;
  q?: string;
  sort?: string;
  dir?: string;
  p?: string;
}

export default async function SheetsPage({
  searchParams,
}: {
  searchParams: Promise<SheetsSearchParams>;
}) {
  const params = await searchParams;
  const actor = await getActor();
  const canEdit = !!actor && hasPermission(actor, "admin");
  // Row delete is Global-Admin only — its own gate so it stays restricted even
  // if edit permission is ever widened to more roles.
  const canDelete = !!actor && hasPermission(actor, "admin");
  const currentUserEmail = actor?.email ?? null;

  const requested = params.tab ?? SHEET_TABLES[0].id;
  const active = getSheetTableById(requested) ?? SHEET_TABLES[0];

  const q =
    typeof params.q === "string" && params.q.trim() ? params.q : undefined;
  const sort =
    typeof params.sort === "string" && params.sort ? params.sort : undefined;
  const dir =
    params.dir === "desc"
      ? ("desc" as const)
      : params.dir === "asc"
        ? ("asc" as const)
        : undefined;
  const p = parsePage(params.p);

  // Keyed on the TAB only — deliberately NOT on q/sort/dir/p. Keying on those
  // would unmount+remount the whole body (search input included) on every
  // debounced settle: focus lost, keystrokes dropped. With a stable key React
  // reconciles in place — the grid keeps showing the previous rows while the
  // new page streams, and its own transition-pending state dims the table.
  return (
    <div className="onboarding-stage sheets-stage">
      <PageHeader icon={Sheet} title="Sheet View" knowMore="sheets" />
      <Suspense key={active.id} fallback={<TableSkeleton rows={6} />}>
        <SheetsData
          tableId={active.id}
          q={q}
          sort={sort}
          dir={dir}
          p={p}
          canEdit={canEdit}
          canDelete={canDelete}
          currentUserEmail={currentUserEmail}
        />
      </Suspense>
    </div>
  );
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function SheetsData({
  tableId,
  q,
  sort,
  dir,
  p,
  canEdit,
  canDelete,
  currentUserEmail,
}: {
  tableId: string;
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  p: number;
  canEdit: boolean;
  canDelete: boolean;
  currentUserEmail: string | null;
}) {
  const active = getSheetTableById(tableId) ?? SHEET_TABLES[0];
  // Counts are unstable_cache'd (60s) so this pre-read is effectively free and
  // decides the data mode: small tables keep the full-fetch client grid, big
  // tables page in Postgres. Budget variant always stays client (month blocks).
  const counts = await fetchTabCounts();
  const serverMode =
    active.variant !== "budget" &&
    (counts[active.id] ?? 0) > SERVER_MODE_ROW_THRESHOLD;

  if (!serverMode) {
    const data = await fetchSheetData(active.id);
    return (
      <SheetsBody
        tables={SHEET_TABLES}
        active={active}
        data={data}
        counts={counts}
        canEdit={canEdit}
        canDelete={canDelete}
        currentUserEmail={currentUserEmail}
      />
    );
  }

  const data = await fetchSheetPage(active.id, {
    q,
    sortKey: sort,
    sortDir: dir,
    page: p,
    pageSize: SERVER_PAGE_SIZE,
  });
  return (
    <SheetsBody
      tables={SHEET_TABLES}
      active={active}
      data={data}
      counts={counts}
      canEdit={canEdit}
      canDelete={canDelete}
      currentUserEmail={currentUserEmail}
      serverMode
      serverTotal={data.rowCount}
      serverParams={{ q, sortKey: sort, sortDir: dir, page: data.page }}
    />
  );
}
