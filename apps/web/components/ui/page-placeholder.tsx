import { Hammer } from "lucide-react";
import { EmptyState } from "./empty-state";

export interface PagePlaceholderProps {
  title: string;
  legacyRef?: string;
  description?: string;
}

/**
 * Stub for routes not yet implemented in Phase 1.
 * Mirrors the legacy view name + Supabase reader so devs know where to start.
 */
export function PagePlaceholder({
  title,
  legacyRef,
  description,
}: PagePlaceholderProps) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {title}
        </h1>
        {legacyRef && (
          <p className="text-sm text-text-secondary">
            Legacy reader:{" "}
            <code className="px-1.5 py-0.5 rounded-sm bg-bg-muted text-[0.78rem]">
              {legacyRef}
            </code>
          </p>
        )}
      </header>
      <EmptyState
        icon={Hammer}
        title="Not yet wired"
        description={
          description ??
          "This view is part of Phase 1 build-out. See docs/knowledge-base/09-new-stack-architecture.md §7 for the spec."
        }
      />
    </div>
  );
}
