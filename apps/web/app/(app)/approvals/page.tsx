import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fetchApprovalQueue } from "@/features/approvals/queries";
import { ApprovalsBody } from "@/features/approvals/page-client";

export const metadata = { title: "Approvals" };

/**
 * Approvals — admin-only queue of campaigns awaiting sign-off. New campaigns land
 * as 'Pending Approval' and must be approved here (→ live) or rejected before
 * they appear in pickers / accept reach-outs. UI ported from the DAM project.
 */
export default async function ApprovalsPage() {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "admin")) redirect("/dashboard");
  const canApproveBudget = hasPermission(actor, "budget_approve");

  return (
    <div className="onboarding-stage approvals-stage">
      <PageHeader icon={ShieldCheck} title="Approvals" knowMore="approvals" />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <ApprovalsData canApproveBudget={canApproveBudget} />
      </Suspense>
    </div>
  );
}

async function ApprovalsData({
  canApproveBudget,
}: {
  canApproveBudget: boolean;
}) {
  const data = await fetchApprovalQueue();
  return <ApprovalsBody data={data} canApproveBudget={canApproveBudget} />;
}
