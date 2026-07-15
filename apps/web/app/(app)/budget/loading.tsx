import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Mirrors /budget: PageHeader → month tabs → 4 KPI tiles → version tables. */
export default function Loading() {
  return (
    <div className="onboarding-stage budget-stage" aria-busy aria-hidden>
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-3 min-w-0">
        <div className="rounded-2xl bg-bg-surface border border-border p-2 flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-lg" />
          ))}
        </div>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-bg-white border border-border px-3.5 py-3 space-y-2"
            >
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>

        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl bg-bg-white border border-border overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border">
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
