"use client";
import { useEffect, useState } from "react";
import { LayoutGrid, List, Kanban } from "lucide-react";
import { cn } from "@/lib/cn";

export type ViewMode = "list" | "cards" | "kanban";

const ICONS: Record<ViewMode, typeof List> = {
  list: List,
  cards: LayoutGrid,
  kanban: Kanban,
};

const LABELS: Record<ViewMode, string> = {
  list: "List",
  cards: "Cards",
  kanban: "Kanban",
};

export interface ViewModeToggleProps {
  /** Persistence key in localStorage */
  storageKey: string;
  options: ViewMode[];
  defaultMode?: ViewMode;
  onChange?: (mode: ViewMode) => void;
}

export function ViewModeToggle({
  storageKey,
  options,
  defaultMode,
  onChange,
}: ViewModeToggleProps) {
  const [mode, setMode] = useState<ViewMode>(defaultMode ?? options[0]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && (options as string[]).includes(stored)) {
        setMode(stored as ViewMode);
      }
    } catch {
      // localStorage unavailable
    }
  }, [storageKey, options]);

  const choose = (next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // ignore
    }
    onChange?.(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex rounded-[var(--radius-sm)] border border-border bg-bg-white p-0.5"
    >
      {options.map((opt) => {
        const Icon = ICONS[opt];
        const active = mode === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(opt)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-text-primary text-bg-white"
                : "text-text-secondary hover:bg-bg-alt",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {LABELS[opt]}
          </button>
        );
      })}
    </div>
  );
}
