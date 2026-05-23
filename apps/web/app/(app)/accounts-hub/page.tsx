import { Suspense } from "react";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccountsBoard } from "@/features/accounts-hub/accounts-board";
import { AccountsExportBar } from "@/features/accounts-hub/export-bar";
import { AccountsFiltersBar } from "@/features/accounts-hub/filters";
import { AccountsKpiStrip } from "@/features/accounts-hub/kpi-strip";
import { PaymentEntryPanel } from "@/features/accounts-hub/payment-form";
import {
  fetchAccountsFilterOptions,
  fetchAccountsHubData,
} from "@/features/accounts-hub/queries";
import type { AccountsFilters } from "@/features/accounts-hub/types";
import { assertPermission } from "@/lib/rbac.server";

export const metadata = { title: "Accounts Hub" };

/**
 * Page layout (top → bottom, legacy parity Index.html:6611-7059):
 *   1. PageHeader
 *   2. Payment entry panel (collapsible, inline) + Export bar
 *   3. KPI strip (4 cards)
 *   4. Filter bar
 *   5. View toggle + Kanban / List
 */
export default async function AccountsHubPage({
  searchParams,
}: {
  searchParams: Promise<AccountsFilters>;
}) {
  await assertPermission("accounts_write");
  const params = await searchParams;
  const options = await fetchAccountsFilterOptions();

  return (
    <div className="onboarding-stage">
      <PageHeader icon={Wallet} title="Accounts Hub" />

      <PaymentEntryPanel />

      <AccountsFiltersBar initial={params} options={options} />

      <Suspense fallback={<KpiSkeleton />}>
        <AccountsKpiSection />
      </Suspense>

      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={10} cols={9} />}
      >
        <AccountsBoardSection filters={params} />
      </Suspense>
    </div>
  );
}

async function AccountsKpiSection() {
  const { kpi } = await fetchAccountsHubData({});
  return <AccountsKpiStrip kpi={kpi} />;
}

async function AccountsBoardSection({
  filters,
}: {
  filters: AccountsFilters;
}) {
  const { rows } = await fetchAccountsHubData(filters);
  return <AccountsBoard rows={rows} />;
}

function KpiSkeleton() {
  return (
    <div className="acc-kpi-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="acc-kpi acc-kpi--skeleton" aria-hidden />
      ))}
    </div>
  );
}
