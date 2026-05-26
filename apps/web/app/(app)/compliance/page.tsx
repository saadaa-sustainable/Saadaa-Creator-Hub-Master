import { Suspense } from "react";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { fetchComplianceData } from "@/features/compliance/queries";
import { ComplianceBody } from "@/features/compliance/page-client";

export const metadata = { title: "Compliance KPIs" };

export default async function CompliancePage() {
  return (
    <div className="onboarding-stage compliance-stage">
      <PageHeader
        icon={ClipboardCheck}
        title="Compliance KPIs"
        knowMore="compliance"
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ComplianceData />
      </Suspense>
    </div>
  );
}

async function ComplianceData() {
  const data = await fetchComplianceData();
  return <ComplianceBody data={data} />;
}
