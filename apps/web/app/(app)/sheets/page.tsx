import { Suspense } from "react";
import { Sheet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { SheetsBody } from "@/features/sheets/page-client";
import {
  fetchSheetData,
  fetchTabCounts,
  getSheetTableById,
} from "@/features/sheets/queries";
import { SHEET_TABLES } from "@/features/sheets/types";

export const metadata = { title: "Sheet View" };

export default async function SheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
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

  return (
    <div className="onboarding-stage sheets-stage">
      <PageHeader icon={Sheet} title="Sheet View" knowMore="sheets" />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <SheetsData
          tableId={active.id}
          canEdit={canEdit}
          canDelete={canDelete}
          currentUserEmail={currentUserEmail}
        />
      </Suspense>
    </div>
  );
}

async function SheetsData({
  tableId,
  canEdit,
  canDelete,
  currentUserEmail,
}: {
  tableId: string;
  canEdit: boolean;
  canDelete: boolean;
  currentUserEmail: string | null;
}) {
  const active = getSheetTableById(tableId) ?? SHEET_TABLES[0];
  const [data, counts] = await Promise.all([
    fetchSheetData(active.id),
    fetchTabCounts(),
  ]);
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
