import { Suspense } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard, KpiStrip } from "@/components/ui/kpi-card";
import { KpiStripSkeleton, ChartSkeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { formatRupees } from "@/lib/formatters";

type SearchParams = {
  dateFrom?: string;
  dateTo?: string;
  campaign?: string;
  contentType?: string;
  status?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const key = JSON.stringify(params);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-text-secondary">
          Pipeline + commerce + ad performance at a glance.
        </p>
      </header>

      <Suspense key={`kpi-${key}`} fallback={<KpiStripSkeleton count={4} />}>
        <DashboardKpis filters={params} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Suspense fallback={<ChartSkeleton />}>
          <GlassCard>
            <h2 className="font-display text-base font-semibold mb-3">
              Pipeline by status
            </h2>
            <p className="text-sm text-text-secondary">
              Chart placeholder — wire to <code>getDashboardStats</code> RPC.
            </p>
          </GlassCard>
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <GlassCard>
            <h2 className="font-display text-base font-semibold mb-3">
              Spends
            </h2>
            <p className="text-sm text-text-secondary">Chart placeholder.</p>
          </GlassCard>
        </Suspense>
      </div>
    </div>
  );
}

async function DashboardKpis({ filters: _filters }: { filters: SearchParams }) {
  const supabase = await createClient();
  const { count: totalCreators } = await supabase
    .from("creators")
    .select("*", { count: "exact", head: true });
  const { count: posted } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("workflow_status", "Posted");
  const { count: delivered } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("workflow_status", "Delivered");

  const { data: spendRows } = await supabase
    .from("payments")
    .select("amount")
    .eq("status", "Done");
  const spend = ((spendRows ?? []) as any[]).reduce((sum, r) => sum + (r.amount ?? 0), 0);

  return (
    <KpiStrip>
      <KpiCard label="Creators" value={totalCreators ?? 0} tone="info" />
      <KpiCard label="Posted" value={posted ?? 0} tone="success" />
      <KpiCard label="Delivered" value={delivered ?? 0} tone="success" />
      <KpiCard label="Total spend" value={formatRupees(spend)} tone="accent" />
    </KpiStrip>
  );
}
