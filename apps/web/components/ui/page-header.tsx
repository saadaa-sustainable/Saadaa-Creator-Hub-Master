import type { LucideIcon } from "lucide-react";
import { Lightbulb } from "lucide-react";

export interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  /** Optional right-aligned mode chip (e.g. "We initiate", "They came in"). */
  modePill?: {
    label: string;
    tone?: "default" | "info";
    icon?: LucideIcon;
  };
  /** Optional Know More slug — opens the help modal for this view. */
  knowMore?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  modePill,
  knowMore,
}: PageHeaderProps) {
  const ModeIcon = modePill?.icon;
  return (
    <header className="page-header">
      <div className="flex items-center gap-3">
        <span className="header-icon" aria-hidden>
          <Icon />
        </span>
        <h1>{title}</h1>
        {knowMore && (
          <button
            type="button"
            className="btn-know-more"
            data-know-more={knowMore}
            aria-label={`Open help for ${title}`}
          >
            <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Know More
          </button>
        )}
      </div>
      {modePill && (
        <span
          className={`mode-pill ${modePill.tone === "info" ? "mode-pill-in" : ""} ml-auto`}
        >
          {ModeIcon && <ModeIcon aria-hidden />}
          {modePill.label}
        </span>
      )}
    </header>
  );
}
