import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors /performance/untested-ads, which renders `PagePlaceholder`
 * (title + legacy-ref line + EmptyState card) inside a `space-y-4` stack.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <header className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-52" />
      </header>
      {/* EmptyState card */}
      <div className="rounded-[var(--radius)] border border-border bg-bg-white flex flex-col items-center justify-center gap-3 py-16">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}
