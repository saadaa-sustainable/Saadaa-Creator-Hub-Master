import { Suspense } from "react";
import { IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StageSkeleton } from "@/components/ui/skeleton";
import { fetchCostAnalyticsData } from "@/features/cost-analytics/queries";
import { CostAnalyticsBody } from "@/features/cost-analytics/page-client";

export const metadata = { title: "Cost Analytics" };

export default async function CostAnalyticsPage() {
  return (
    <div className="onboarding-stage cost-analytics-stage">
      <PageHeader
        icon={IndianRupee}
        title="Cost Analytics"
        knowMore="cost-analytics"
      />
      <Suspense fallback={<StageSkeleton kind="chart" kpiCount={5} />}>
        <CostData />
      </Suspense>
    </div>
  );
}

async function CostData() {
  const data = await fetchCostAnalyticsData();
  return <CostAnalyticsBody data={data} />;
}
