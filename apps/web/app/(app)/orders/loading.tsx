import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors /orders (PagePlaceholder): plain h1 + legacy-ref line +
 * centered empty-state card. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy aria-hidden>
      <header className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>
      <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-border bg-bg-white py-16">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-72 max-w-[80%]" />
      </div>
    </div>
  );
}
