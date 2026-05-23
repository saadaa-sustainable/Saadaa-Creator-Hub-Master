import { TableSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-24 w-full rounded-md" />
      <TableSkeleton rows={10} cols={10} />
    </div>
  );
}
