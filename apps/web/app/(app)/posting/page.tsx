import { Suspense } from "react";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PostingFiltersBar } from "@/features/posting/filters";
import { PostingKpiStrip } from "@/features/posting/kpi-strip";
import { PostingTable } from "@/features/posting/posting-table";
import {
  fetchPostingFilterOptions,
  fetchPostingKpis,
  fetchPostingTable,
} from "@/features/posting/queries";
import type { PostingFilters } from "@/features/posting/types";
import { assertPermission } from "@/lib/rbac.server";

export const metadata = { title: "Posting" };

export default async function PostingPage({
  searchParams,
}: {
  searchParams: Promise<PostingFilters>;
}) {
  await assertPermission("posting_submit");
  const params = await searchParams;
  const options = await fetchPostingFilterOptions();

  return (
    <div className="onboarding-stage">
      <PageHeader icon={Send} title="Posting" knowMore="posting" />

      <PostingFiltersBar initial={params} options={options} />

      <Suspense fallback={<KpiSkeleton />}>
        <PostingKpiSection />
      </Suspense>

      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={10} cols={10} />}
      >
        <PostingTableSection filters={params} />
      </Suspense>
    </div>
  );
}

async function PostingKpiSection() {
  const kpi = await fetchPostingKpis();
  return <PostingKpiStrip kpi={kpi} />;
}

async function PostingTableSection({ filters }: { filters: PostingFilters }) {
  const rows = await fetchPostingTable(filters);
  return <PostingTable rows={rows} />;
}

function KpiSkeleton() {
  return (
    <section className="acc-kpi-grid">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="acc-kpi acc-kpi--skeleton" aria-hidden />
      ))}
    </section>
  );
}
