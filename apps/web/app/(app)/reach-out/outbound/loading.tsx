import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

/** One reachout-step-card-shaped block: section title + status chip, then a
 * 2/1 split of form fields and a side tip/preview panel. */
function StepCardSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="glass-card rounded-[var(--radius-lg)] border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
        <div className="md:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-[2.85rem] w-full rounded-[0.65rem]" />
            </div>
          ))}
        </div>
        <div className="hidden md:block rounded-md border border-border bg-bg-white p-3 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-5/6" />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors /reach-out/outbound: PageHeader (mode pill + Historic Creator
 * action) → stacked reachout-form step cards → submit row. */
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="reachout-form space-y-4 mt-4" aria-busy aria-hidden>
        <StepCardSkeleton fields={2} />
        <StepCardSkeleton fields={4} />
        <StepCardSkeleton fields={4} />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-44 rounded-[10px]" />
        </div>
      </div>
    </>
  );
}
