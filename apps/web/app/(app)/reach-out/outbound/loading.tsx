import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[620px] rounded-md" />
        <Skeleton className="h-[620px] rounded-md" />
        <Skeleton className="h-[620px] rounded-md" />
      </div>
    </div>
  );
}
