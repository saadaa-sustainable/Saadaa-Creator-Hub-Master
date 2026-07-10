"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DateRange {
  from: string; // YYYY-MM-DD ("" = open)
  to: string; // YYYY-MM-DD ("" = open)
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
function parse(s: string): Date | null {
  if (!s) return null;
  try {
    const d = parseISO(s);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
function pretty(s: string): string {
  const d = parse(s);
  return d ? format(d, "d MMM yyyy") : "";
}

type Preset = { label: string; range: (today: Date) => DateRange };
const PRESETS: Preset[] = [
  { label: "Today", range: (t) => ({ from: iso(t), to: iso(t) }) },
  {
    label: "Yesterday",
    range: (t) => ({ from: iso(subDays(t, 1)), to: iso(subDays(t, 1)) }),
  },
  { label: "Last 7 days", range: (t) => ({ from: iso(subDays(t, 6)), to: iso(t) }) },
  { label: "Last 30 days", range: (t) => ({ from: iso(subDays(t, 29)), to: iso(t) }) },
  {
    label: "This month",
    range: (t) => ({ from: iso(startOfMonth(t)), to: iso(t) }),
  },
  {
    label: "Last month",
    range: (t) => {
      const lm = subMonths(t, 1);
      return { from: iso(startOfMonth(lm)), to: iso(endOfMonth(lm)) };
    },
  },
  { label: "All time", range: () => ({ from: "", to: "" }) },
];

/**
 * Shopify-style date-range picker: a trigger showing the selected range, and a
 * popover with presets + a two-month calendar + Apply / Cancel. Emits
 * `{from, to}` ISO strings ("" = open-ended). Used for order/reach-out ranges.
 */
export function DateRangePicker({
  value,
  onChange,
  label = "Order Date",
  today = iso(new Date()),
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
  label?: string;
  /** Injectable "today" (ISO) so callers control the clock. */
  today?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [month, setMonth] = useState<Date>(
    () => parse(value.from) ?? parse(today) ?? new Date(0),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const todayDate = parse(today) ?? new Date(0);

  // Sync draft + visible month whenever the popover opens.
  useEffect(() => {
    if (open) {
      setDraft(value);
      setMonth(parse(value.from) ?? todayDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary =
    value.from && value.to
      ? `${pretty(value.from)} → ${pretty(value.to)}`
      : value.from
        ? `From ${pretty(value.from)}`
        : value.to
          ? `Until ${pretty(value.to)}`
          : "All dates";

  const onDayClick = (d: Date) => {
    const day = iso(d);
    const from = parse(draft.from);
    const to = parse(draft.to);
    if (!from || (from && to)) {
      setDraft({ from: day, to: "" });
    } else if (isBefore(d, from)) {
      setDraft({ from: day, to: "" });
    } else {
      setDraft({ from: draft.from, to: day });
    }
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };
  const clear = () => {
    setDraft({ from: "", to: "" });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="onboarding-filter-select flex items-center justify-between gap-2 w-full text-left"
        title={label}
      >
        <span
          className={cn(
            "truncate",
            value.from || value.to ? "text-text-primary" : "text-text-tertiary",
          )}
        >
          {summary}
        </span>
        <Calendar size={13} aria-hidden className="shrink-0 text-text-tertiary" />
      </button>

      {open && (
        <div
          className="absolute z-[2100] mt-1 rounded-xl border border-border bg-bg-white shadow-lg p-2 sm:p-3"
          style={{ minWidth: 280, right: 0 }}
          role="dialog"
          aria-label={`${label} range`}
        >
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Presets */}
            <div className="flex sm:flex-col gap-1 flex-wrap sm:w-32 shrink-0">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDraft(p.range(todayDate))}
                  className="text-left text-[0.7rem] font-semibold px-2 py-1.5 rounded-lg text-text-secondary hover:bg-bg-muted transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendar */}
            <div>
              <div className="flex items-center justify-between mb-1 px-1">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setMonth(subMonths(month, 1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={14} aria-hidden />
                </button>
                <div className="flex gap-4 sm:gap-8 text-[0.72rem] font-extrabold text-text-primary">
                  <span className="w-[168px] text-center">
                    {format(month, "MMMM yyyy")}
                  </span>
                  <span className="hidden sm:block w-[168px] text-center">
                    {format(addMonths(month, 1), "MMMM yyyy")}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setMonth(addMonths(month, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight size={14} aria-hidden />
                </button>
              </div>
              <div className="flex gap-4 sm:gap-8">
                <MonthGrid
                  month={month}
                  draft={draft}
                  today={todayDate}
                  onDayClick={onDayClick}
                />
                <div className="hidden sm:block">
                  <MonthGrid
                    month={addMonths(month, 1)}
                    draft={draft}
                    today={todayDate}
                    onDayClick={onDayClick}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-border">
            <span className="text-[0.66rem] text-text-secondary tabular">
              {draft.from ? pretty(draft.from) : "—"}
              {" → "}
              {draft.to ? pretty(draft.to) : "—"}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn btn-ghost h-7 px-2 text-[0.66rem]"
                onClick={clear}
              >
                <X size={11} aria-hidden /> Clear
              </button>
              <button
                type="button"
                className="btn btn-ghost h-7 px-2 text-[0.66rem]"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acc-export-bar__btn acc-export-bar__btn--primary h-7"
                onClick={apply}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  month,
  draft,
  today,
  onDayClick,
}: {
  month: Date;
  draft: DateRange;
  today: Date;
  onDayClick: (d: Date) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const from = parse(draft.from);
  const to = parse(draft.to);

  return (
    <div className="w-[168px]">
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className="text-center text-[0.5rem] font-extrabold uppercase text-text-tertiary py-0.5"
          >
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const inMonth = isSameMonth(d, month);
          const isFrom = from && isSameDay(d, from);
          const isTo = to && isSameDay(d, to);
          const inRange =
            from && to && !isBefore(d, from) && !isAfter(d, to);
          const isToday = isSameDay(d, today);
          const isEndpoint = isFrom || isTo;
          return (
            <button
              key={iso(d)}
              type="button"
              onClick={() => onDayClick(d)}
              className={cn(
                "h-6 w-6 mx-auto grid place-items-center rounded-full text-[0.66rem] tabular transition-colors",
                !inMonth && "text-text-tertiary/40",
                inMonth && !inRange && !isEndpoint && "text-text-primary hover:bg-bg-muted",
                inRange && !isEndpoint && "bg-[#F0EAD6] text-text-primary rounded-none",
                isEndpoint && "bg-[#F0C61E] text-[#161513] font-extrabold",
                isToday && !isEndpoint && "ring-1 ring-[#F0C61E]",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
