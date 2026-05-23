import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-dashed border-border bg-bg-alt px-6 py-12 text-center",
        className,
      )}
      role="status"
    >
      <Icon className="h-8 w-8 text-text-tertiary" aria-hidden />
      <div>
        <p className="font-display text-base font-semibold text-text-primary">
          {title}
        </p>
        {description && (
          <p className="mt-1 text-sm text-text-secondary max-w-prose">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
