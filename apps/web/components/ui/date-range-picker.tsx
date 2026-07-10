"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
export interface DateRangeMode {
  value: string;
  label: string;
}

export function DateRangePicker({
  value,
  onChange,
  label = "Order Date",
  today = iso(new Date()),
  modes,
  mode,
  onModeChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
  label?: string;
  /** Injectable "today" (ISO) so callers control the clock. */
  today?: string;
  /** Optional date-basis toggle rendered inside the popover (e.g. Reach Out /
   *  Onboarded / Posted) for views with multiple from/to pairs. */
  modes?: DateRangeMode[];
  mode?: string;
  onModeChange?: (mode: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [month, setMonth] = useState<Date>(
    () => parse(value.from) ?? parse(today) ?? new Date(0),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 300,
  });
  const todayDate = parse(today) ?? new Date(0);

  // Sync draft + visible month whenever the popover opens.
  useEffect(() => {
    if (open) {
      setDraft(value);
      setMonth(parse(value.from) ?? todayDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Position the portalled popover: right-aligned to the trigger, clamped to the
  // viewport so it never overflows the modal / screen edge.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const twoMonth = vw >= 640;
      const width = Math.min(twoMonth ? 620 : 320, vw - 16);
      // Open aligned with the trigger's LEFT edge, extending right; only shift
      // back when that would overflow the viewport's right edge.
      let left = r.left;
      if (left + width > vw - 8) left = vw - width - 8;
      left = Math.max(8, left);
      const top = Math.min(r.bottom + 6, window.innerHeight - 40);
      setPos({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close on outside click / Escape (trigger + portalled popover are both "inside").
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
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

  const activeModeLabel =
    modes && mode ? modes.find((m) => m.value === mode)?.label : null;
  const rangeText =
    value.from && value.to
      ? `${pretty(value.from)} → ${pretty(value.to)}`
      : value.from
        ? `From ${pretty(value.from)}`
        : value.to
          ? `Until ${pretty(value.to)}`
          : "";
  const summary = rangeText
    ? activeModeLabel
      ? `${activeModeLabel}: ${rangeText}`
      : rangeText
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
    <>
      <button
        ref={triggerRef}
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

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[2100] rounded-xl border border-border bg-bg-white shadow-lg p-2 sm:p-3 overflow-auto"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: `calc(100dvh - ${Math.round(pos.top) + 16}px)`,
            }}
            role="dialog"
            aria-label={`${label} range`}
          >
          {modes && modes.length > 1 && (
            <div
              className="mb-2 inline-flex rounded-full border border-border bg-bg-muted/50 p-0.5"
              role="tablist"
              aria-label="Date basis"
            >
              {modes.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.value}
                  onClick={() => onModeChange?.(m.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[0.66rem] font-extrabold transition-colors",
                    mode === m.value
                      ? "bg-[#F0C61E] text-[#161513]"
                      : "text-text-secondary hover:bg-bg-muted",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
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
                className="inline-flex items-center gap-1 whitespace-nowrap h-7 px-2.5 rounded-full text-[0.66rem] font-bold text-text-secondary hover:bg-bg-muted transition-colors"
                onClick={clear}
              >
                <X size={11} aria-hidden className="shrink-0" />
                Clear
              </button>
              <button
                type="button"
                className="inline-flex items-center whitespace-nowrap h-7 px-2.5 rounded-full text-[0.66rem] font-bold text-text-secondary hover:bg-bg-muted transition-colors"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acc-export-bar__btn acc-export-bar__btn--primary h-7 whitespace-nowrap"
                onClick={apply}
              >
                Apply
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
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
