import {
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

/** Mirrors /sheets: PageHeader → table tab chips row → dense grid table. */
export default function Loading() {
  return (
    <div className="onboarding-stage sheets-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3 sm:gap-4 min-w-0">
        {/* .dash-tabbar — sheet-table tab chips */}
        <div className="flex items-center gap-1 overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-8 rounded-[7px]"
              style={{ width: `${88 + ((i * 23) % 48)}px` }}
            />
          ))}
        </div>
        <TableSkeleton rows={12} cols={8} />
      </div>
    </div>
  );
}
