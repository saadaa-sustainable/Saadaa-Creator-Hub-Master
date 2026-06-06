import { Suspense } from "react";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
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
      <Suspense fallback={<StageSkeleton kind="chart" kpiCount={5} />}>
        <ComplianceData />
      </Suspense>
    </div>
  );
}

async function ComplianceData() {
  const data = await fetchComplianceData();
  return <ComplianceBody data={data} />;
}
