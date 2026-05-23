import { TableSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-44" />
      <div className="acc-kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-md" />
      <TableSkeleton rows={10} cols={9} />
    </div>
  );
}
