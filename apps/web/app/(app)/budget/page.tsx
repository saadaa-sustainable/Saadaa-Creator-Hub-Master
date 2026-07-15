import { redirect } from "next/navigation";
import { Suspense } from "react";
import { IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fetchBudgetPage } from "@/features/budget/queries";
import { BudgetPageClient } from "@/features/budget/page-client";

export const metadata = { title: "Budget" };

/**
 * Budget — month-wise budget versions per campaign (V0 initial /
 * carry-forward / top-up). Admins + Global Admins can read; the Approve /
 * Reject buttons render only for `budget_approve` holders (Global Admins).
 */
export default async function BudgetPage() {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "admin")) redirect("/dashboard");
  const canApprove = hasPermission(actor, "budget_approve");

  return (
    <div className="onboarding-stage budget-stage">
      <PageHeader icon={IndianRupee} title="Budget" knowMore="budget" />
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <BudgetData canApprove={canApprove} />
      </Suspense>
    </div>
  );
}

async function BudgetData({ canApprove }: { canApprove: boolean }) {
  const data = await fetchBudgetPage();
  return <BudgetPageClient data={data} canApprove={canApprove} />;
}
