import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fetchAuditLogData } from "@/features/audit-log/queries";
import { AuditLogBody } from "@/features/audit-log/page-client";

export const metadata = { title: "Audit Log" };

/**
 * Audit Log — admin-only unified activity stream over CreatorHub's audit tables
 * (Sheet edits/comments/deletions, user & access changes, system errors).
 * Layout ported from the DAM project; CreatorHub shell + palette + data.
 */
export default async function AuditLogPage() {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "admin")) redirect("/dashboard");

  return (
    <div className="onboarding-stage audit-log-stage">
      <PageHeader icon={ScrollText} title="Audit Log" knowMore="audit-log" />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <AuditData />
      </Suspense>
    </div>
  );
}

async function AuditData() {
  const data = await fetchAuditLogData();
  return <AuditLogBody data={data} />;
}
