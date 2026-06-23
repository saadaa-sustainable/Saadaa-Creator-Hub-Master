"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional secondary text shown muted next to the label (e.g. a handle). */
  hint?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Show a clear (×) affordance when a value is set. */
  clearable?: boolean;
}

/**
 * Accessible, type-to-filter single-select combobox. Drop-in replacement for a
 * native <select> across the app — keyboard nav (↑/↓/Enter/Esc), search box,
 * design-system styling. Built on Radix Popover (already a dependency).
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  id,
  disabled,
  className,
  clearable,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[active];
      if (o) pick(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
            "bg-white border border-[#E7E2D2]",
            "hover:border-[#F0C61E] focus:outline-none",
            "focus-visible:border-[#F0C61E] focus-visible:shadow-[0_0_0_3px_rgba(240,198,30,0.25)]",
            open && "border-[#F0C61E] shadow-[0_0_0_3px_rgba(240,198,30,0.25)]",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-text-tertiary")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown size={14} className="shrink-0 opacity-50" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={5}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "z-[1200] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl",
            "bg-white border border-[#E7E2D2]",
            "shadow-[0_10px_30px_-8px_rgba(44,36,32,0.25)]",
          )}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E7E2D2]">
            <Search size={13} className="shrink-0 opacity-50" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-text-tertiary"
              role="combobox"
              aria-controls={`${id ?? "ss"}-list`}
              aria-expanded={open}
              aria-autocomplete="list"
            />
            {clearable && value && (
              <button
                type="button"
                className="text-text-tertiary hover:text-text-primary text-xs"
                onClick={() => pick("")}
              >
                Clear
              </button>
            )}
          </div>
          <ul
            ref={listRef}
            id={`${id ?? "ss"}-list`}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-text-tertiary">No matches</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                    i === active && "bg-[#F5F1EC]",
                    o.value === value && "font-semibold",
                  )}
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{o.label}</span>
                    {o.hint && (
                      <span className="truncate text-xs text-text-tertiary">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {o.value === value && (
                    <Check
                      size={13}
                      className="shrink-0 text-[#4F7C4D]"
                      aria-hidden
                    />
                  )}
                </li>
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
