import { Suspense } from "react";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PostingFiltersBar } from "@/features/posting/filters";
import { PostingTable } from "@/features/posting/posting-table";
import {
  fetchPostingFilterOptions,
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
      <PageHeader icon={Send} title="Posting" />

      <PostingFiltersBar initial={params} options={options} />

      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={10} cols={10} />}
      >
        <PostingTableSection filters={params} />
      </Suspense>
    </div>
  );
}

async function PostingTableSection({ filters }: { filters: PostingFilters }) {
  const rows = await fetchPostingTable(filters);
  return <PostingTable rows={rows} />;
}
