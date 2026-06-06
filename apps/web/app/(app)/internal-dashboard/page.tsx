import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
import { fetchInternalDashboardData } from "@/features/internal-dashboard/queries";
import { InternalDashboardBody } from "@/features/internal-dashboard/page-client";

export const metadata = { title: "Internal Dashboard" };

export default async function InternalDashboardPage() {
  return (
    <div className="onboarding-stage internal-dashboard-stage">
      <PageHeader
        icon={Building2}
        title="Internal Dashboard"
        knowMore="internal-dashboard"
      />
      <Suspense fallback={<StageSkeleton kind="chart" kpiCount={5} />}>
        <InternalData />
      </Suspense>
    </div>
  );
}

async function InternalData() {
  const data = await fetchInternalDashboardData();
  return <InternalDashboardBody data={data} />;
}
