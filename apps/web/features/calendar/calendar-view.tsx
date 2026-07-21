"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  X,
  PackageCheck,
  Send,
  ChevronDown,
  AlertTriangle,
  Search,
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { CalendarEvent, CalendarEventType } from "./queries";

/**
 * Content Calendar — direct port of the Workflow Optimizer CalendarView
 * (month / week / schedule views, mini-calendar rail, day popup), adapted to
 * CreatorHub's two event kinds: Est. Delivery (onboarded collabs) and Posted
 * (actual post dates). Overdue deliveries carry a warning mark.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_MINI = ["S", "M", "T", "W", "T", "F", "S"];
type View = "month" | "week" | "schedule";
const VIEW_LABEL: Record<View, string> = { month: "Month", week: "Week", schedule: "Schedule" };

const TYPE_META: Record<CalendarEventType, { label: string; bg: string; fg: string; dot: string; Icon: typeof Send }> = {
  delivery: { label: "Est. Delivery", bg: "#FAF1DC", fg: "#8C5A2B", dot: "#E8A020", Icon: PackageCheck },
  posting:  { label: "Posted",        bg: "#E9F4EC", fg: "#2F7D4F", dot: "#4CAF7D", Icon: Send },
};

/** Filter keys mirrored in the URL so they survive month navigation. */
const CAL_FILTER_KEYS = ["tm", "camp", "ctype", "etype"] as const;
type CalFilterKey = (typeof CAL_FILTER_KEYS)[number];

export function CalendarView({ year, month, events, campaigns }: {
  year: number; month: number; events: CalendarEvent[];
  campaigns: { campaign_id: string; campaign_name: string | null }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<View>("month");
  const [viewMenu, setViewMenu] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Filters (selects live in the URL; search is instant local state) ──
  const [q, setQ] = useState("");
  const tm = params.get("tm") ?? "";
  const camp = params.get("camp") ?? "";
  const ctype = params.get("ctype") ?? "";
  const etype = params.get("etype") ?? "";

  const setFilter = useCallback(
    (key: CalFilterKey, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      router.replace(`/calendar?${next.toString()}` as never, { scroll: false });
    },
    [params, router],
  );
  const clearFilters = useCallback(() => {
    setQ("");
    const next = new URLSearchParams(params.toString());
    CAL_FILTER_KEYS.forEach((k) => next.delete(k));
    router.replace(`/calendar?${next.toString()}` as never, { scroll: false });
  }, [params, router]);
  const hasAnyFilter = q.trim().length > 0 || CAL_FILTER_KEYS.some((k) => params.get(k));

  // Month navigation preserves the active filters (only year/month change).
  const monthHref = useCallback(
    (y0: number, m0: number) => {
      let y = y0, m = m0;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      const next = new URLSearchParams(params.toString());
      next.set("year", String(y));
      next.set("month", String(m));
      return `/calendar?${next.toString()}` as any;
    },
    [params],
  );
  const todayHref = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("year");
    next.delete("month");
    const s = next.toString();
    return (s ? `/calendar?${s}` : "/calendar") as any;
  }, [params]);

  // Team members present in this month's events (deliveries + postings).
  const teamMembers = useMemo(
    () =>
      Array.from(
        new Set(events.map((e) => (e.owner ?? "").trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [events],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (tm && (e.owner ?? "") !== tm) return false;
      if (camp && (e.campaignId ?? "") !== camp) return false;
      if (ctype && (e.collabType ?? "") !== ctype) return false;
      if (etype === "overdue") { if (!e.overdue) return false; }
      else if (etype && e.type !== etype) return false;
      if (needle) {
        const hay = [e.username, e.postId, e.collabId, e.orderId, e.campaignId]
          .map((v) => (v ?? "").toLowerCase())
          .join(" ");
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [events, tm, camp, ctype, etype, q]);

  const today = new Date();
  const todayInMonth = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : null;
  const daysInMonth = new Date(year, month, 0).getDate();
  const [focusDay, setFocusDay] = useState(todayInMonth ?? 1);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setViewMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const e of filtered) {
    if (!eventsByDay.has(e.day)) eventsByDay.set(e.day, []);
    eventsByDay.get(e.day)!.push(e);
  }
  const counts = { delivery: 0, posting: 0 };
  for (const e of filtered) counts[e.type]++;

  const leadingBlanks = new Date(year, month - 1, 1).getDay();
  const isToday = (d: number) => todayInMonth === d;
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <>
    <div className="onboarding-filter-card mb-5">
      <div className="onboarding-filter-grid">
        <label className="onboarding-filter-field">
          <span>Search</span>
          <span className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-text-tertiary" aria-hidden />
            <input
              type="search"
              value={q}
              placeholder="Creator, POST ID, collab, order…"
              onChange={(e) => setQ(e.target.value)}
              className="onboarding-filter-select pl-7"
            />
          </span>
        </label>
        <CalFilterSelect
          label="Event"
          value={etype}
          onChange={(v) => setFilter("etype", v)}
          options={[
            { label: "All events", value: "" },
            { label: "Est. Delivery", value: "delivery" },
            { label: "Posted", value: "posting" },
            { label: "Overdue only", value: "overdue" },
          ]}
        />
        <CalFilterSelect
          label="Team Member"
          value={tm}
          onChange={(v) => setFilter("tm", v)}
          options={[
            { label: "All team members", value: "" },
            ...teamMembers.map((m) => ({ label: m, value: m })),
          ]}
        />
        <CalFilterSelect
          label="Campaign"
          value={camp}
          onChange={(v) => setFilter("camp", v)}
          options={[
            { label: "All campaigns", value: "" },
            ...campaigns.map((c) => ({
              label: `${c.campaign_id}${c.campaign_name ? ` · ${c.campaign_name}` : ""}`,
              value: c.campaign_id,
            })),
          ]}
        />
        <CalFilterSelect
          label="Collab Type"
          value={ctype}
          onChange={(v) => setFilter("ctype", v)}
          options={[
            { label: "All collab types", value: "" },
            { label: "Barter", value: "Barter" },
            { label: "Barter + Paid", value: "Barter + Paid" },
          ]}
        />
        <div className="onboarding-filter-actions">
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[#E7E2D2] bg-white text-[12px] font-medium text-[#6E695E] hover:bg-[#F9F7F2]"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
            </button>
          )}
        </div>
      </div>
      {hasAnyFilter && (
        <p className="mt-2 text-[12px] text-[#9A9384]">
          Showing {filtered.length} of {events.length} events this month.
        </p>
      )}
    </div>
    <div className="flex flex-col lg:flex-row gap-5">
      {/* ── Left rail: mini-calendar + legend ── */}
      <aside className="hidden lg:block w-[230px] shrink-0">
        <MiniCalendar year={year} month={month} eventsByDay={eventsByDay} todayInMonth={todayInMonth} monthHref={monthHref}
          focusDay={focusDay} onPick={(d) => { setFocusDay(d); if (view !== "week") setSelectedDay((eventsByDay.get(d)?.length ?? 0) > 0 ? d : null); }} />
        <div className="mt-4 space-y-2">
          {(Object.keys(TYPE_META) as CalendarEventType[]).map((t) => (
            <div key={t} className="flex items-center gap-2 text-[12px] text-[#6E695E]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_META[t].dot }} />
              {TYPE_META[t].label}<span className="text-[#9A9384]">({counts[t]})</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-[12px] text-[#6E695E]">
            <AlertTriangle size={11} className="text-danger-text" aria-hidden />
            Overdue delivery
            <span className="text-[#9A9384]">
              ({filtered.filter((e) => e.overdue).length})
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Link href={monthHref(year, month - 1)} aria-label="Previous month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E7E2D2] bg-white text-[#6E695E] hover:bg-[#F9F7F2]"><ChevronLeft size={16} /></Link>
            <Link href={monthHref(year, month + 1)} aria-label="Next month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E7E2D2] bg-white text-[#6E695E] hover:bg-[#F9F7F2]"><ChevronRight size={16} /></Link>
            <h2 className="text-[17px] sm:text-[20px] font-semibold tracking-[-0.01em] text-[#161513] ml-1">{MONTHS[month - 1]} {year}</h2>
            <Link href={todayHref}
              className="ml-1 px-3 h-9 hidden sm:inline-flex items-center rounded-[10px] border border-[#E7E2D2] bg-white text-[12px] font-medium text-[#6E695E] hover:bg-[#F9F7F2]">Today</Link>
          </div>
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setViewMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-[#E7E2D2] bg-white text-[13px] font-medium text-[#494640] hover:bg-[#F9F7F2]">
              {VIEW_LABEL[view]} <ChevronDown size={14} />
            </button>
            {viewMenu && (
              <div className="absolute right-0 mt-1 w-36 rounded-[10px] border border-[#E7E2D2] bg-white shadow-lg py-1 z-20">
                {(["month", "week", "schedule"] as View[]).map((v) => (
                  <button key={v} type="button" onClick={() => { setView(v); setViewMenu(false); }}
                    className={["w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F9F7F2]", view === v ? "text-[#161513] font-semibold" : "text-[#6E695E]"].join(" ")}>
                    {VIEW_LABEL[v]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {view === "month" && (
          <MonthGrid daysInMonth={daysInMonth} leadingBlanks={leadingBlanks}
            eventsByDay={eventsByDay} isToday={isToday} onOpenDay={(d) => setSelectedDay(d)} />
        )}
        {view === "week" && (
          <WeekView year={year} month={month} focusDay={focusDay} daysInMonth={daysInMonth}
            eventsByDay={eventsByDay} isToday={isToday} setFocusDay={setFocusDay} onOpenDay={(d) => setSelectedDay(d)} />
        )}
        {view === "schedule" && (
          <ScheduleView year={year} month={month} events={filtered} isToday={isToday} />
        )}

        {filtered.length === 0 && view !== "schedule" && (
          <p className="mt-4 text-center text-[13px] text-[#9A9384]">
            {events.length > 0
              ? "No events match the active filters this month."
              : "No deliveries due or posts published this month."}
          </p>
        )}
      </div>

      {selectedDay !== null && (
        <DayPopup year={year} month={month} day={selectedDay} events={selectedEvents} onClose={() => setSelectedDay(null)} />
      )}
    </div>
    </>
  );
}

function CalFilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string | undefined) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="onboarding-filter-field">
      <span>{label}</span>
      <SearchableSelect
        value={value}
        onChange={(v) => onChange(v || undefined)}
        options={options}
        placeholder={`All ${label.toLowerCase()}s`}
        searchPlaceholder={`Search ${label.toLowerCase()}…`}
      />
    </label>
  );
}

function MiniCalendar({ year, month, eventsByDay, todayInMonth, focusDay, onPick, monthHref }: {
  year: number; month: number; eventsByDay: Map<number, CalendarEvent[]>; todayInMonth: number | null; focusDay: number; onPick: (d: number) => void;
  monthHref: (y: number, m: number) => React.ComponentProps<typeof Link>["href"];
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = new Date(year, month - 1, 1).getDay();
  const cells: (number | null)[] = [...Array.from({ length: leading }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  return (
    <div className="rounded-[12px] border border-[#E7E2D2] bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-[#161513]">{MONTHS[month - 1]} {year}</span>
        <div className="flex items-center gap-1">
          <Link href={monthHref(year, month - 1)} aria-label="Previous month" className="p-1 rounded-[6px] hover:bg-[#F0EDE6] text-[#9A9384]"><ChevronLeft size={14} /></Link>
          <Link href={monthHref(year, month + 1)} aria-label="Next month" className="p-1 rounded-[6px] hover:bg-[#F0EDE6] text-[#9A9384]"><ChevronRight size={14} /></Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS_MINI.map((w, i) => <span key={i} className="text-[10px] font-semibold text-[#9A9384]">{w}</span>)}
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />;
          const has = (eventsByDay.get(d)?.length ?? 0) > 0;
          const isFocus = d === focusDay;
          const isTod = d === todayInMonth;
          return (
            <button key={d} type="button" onClick={() => onPick(d)}
              className="relative mx-auto h-7 w-7 rounded-full text-[11px] flex items-center justify-center transition-colors"
              style={isTod ? { background: "#2C2420", color: "#fff" } : isFocus ? { background: "#F0EAD6", color: "#2C2420" } : { color: "#494640" }}>
              {d}
              {has && !isTod && <span className="absolute bottom-0.5 h-1 w-1 rounded-full" style={{ background: "#E8A020" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({ e, onClick }: { e: CalendarEvent; onClick?: () => void }) {
  const m = TYPE_META[e.type];
  const El: "button" | "div" = onClick ? "button" : "div";
  return (
    <El
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className="w-full flex items-center gap-1 rounded-[5px] px-1 py-0.5 text-[10px] leading-tight text-left"
      style={{ background: m.bg, color: m.fg }}
      title={`${m.label}: ${e.label}${e.overdue ? " (overdue)" : ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: m.dot }} />
      {e.overdue && <AlertTriangle size={9} className="shrink-0 text-danger-text" aria-hidden />}
      <span className="truncate">{e.label}</span>
    </El>
  );
}

function MonthGrid({ daysInMonth, leadingBlanks, eventsByDay, isToday, onOpenDay }: {
  daysInMonth: number; leadingBlanks: number; eventsByDay: Map<number, CalendarEvent[]>; isToday: (d: number) => boolean; onOpenDay: (d: number) => void;
}) {
  const cells: (number | null)[] = [...Array.from({ length: leadingBlanks }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((w) => <div key={w} className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9A9384] text-center py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} className="min-h-[58px] sm:min-h-[92px]" />;
          const dayEvents = eventsByDay.get(day) ?? [];
          return (
            <button key={day} type="button" onClick={() => dayEvents.length > 0 && onOpenDay(day)}
              className={["min-h-[58px] sm:min-h-[92px] rounded-[8px] sm:rounded-[10px] border bg-white p-1 sm:p-1.5 text-left align-top transition-colors",
                dayEvents.length > 0 ? "border-[#E7E2D2] hover:border-[#C9A882] cursor-pointer" : "border-[#F0EDE6] cursor-default"].join(" ")}>
              <div className={["inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold mb-1", isToday(day) ? "bg-[#2C2420] text-white" : "text-[#6E695E]"].join(" ")}>{day}</div>
              <div className="hidden sm:block space-y-1">
                {dayEvents.slice(0, 3).map((e, idx) => <EventChip key={idx} e={e} />)}
                {dayEvents.length > 3 && <div className="text-[10px] text-[#9A9384] px-1">+{dayEvents.length - 3} more</div>}
              </div>
              {dayEvents.length > 0 && (
                <div className="flex sm:hidden flex-wrap gap-1 mt-0.5">
                  {dayEvents.slice(0, 6).map((e, idx) => <span key={idx} className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_META[e.type].dot }} />)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function WeekView({ year, month, focusDay, daysInMonth, eventsByDay, isToday, setFocusDay, onOpenDay }: {
  year: number; month: number; focusDay: number; daysInMonth: number; eventsByDay: Map<number, CalendarEvent[]>; isToday: (d: number) => boolean; setFocusDay: (d: number) => void; onOpenDay: (d: number) => void;
}) {
  const anchor = new Date(year, month - 1, focusDay);
  const weekStart = anchor.getDate() - anchor.getDay();
  const days = Array.from({ length: 7 }, (_, i) => weekStart + i);
  const canPrev = weekStart - 7 + 6 >= 1;
  const canNext = weekStart + 7 <= daysInMonth;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" disabled={!canPrev} onClick={() => setFocusDay(Math.max(1, focusDay - 7))}
          className="inline-flex h-8 px-2.5 items-center gap-1 rounded-[8px] border border-[#E7E2D2] bg-white text-[12px] text-[#6E695E] disabled:opacity-40"><ChevronLeft size={14} /> Prev week</button>
        <button type="button" disabled={!canNext} onClick={() => setFocusDay(Math.min(daysInMonth, focusDay + 7))}
          className="inline-flex h-8 px-2.5 items-center gap-1 rounded-[8px] border border-[#E7E2D2] bg-white text-[12px] text-[#6E695E] disabled:opacity-40">Next week <ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {days.map((d, i) => {
          const inMonth = d >= 1 && d <= daysInMonth;
          const dayEvents = inMonth ? (eventsByDay.get(d) ?? []) : [];
          return (
            <div key={i} className={["rounded-[10px] border p-2 min-h-[120px]", inMonth ? "border-[#E7E2D2] bg-white" : "border-[#F0EDE6] bg-[#FBFAF7]"].join(" ")}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9A9384]">{WEEKDAYS[i]}</span>
                {inMonth && <span className={["inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold", isToday(d) ? "bg-[#2C2420] text-white" : "text-[#6E695E]"].join(" ")}>{d}</span>}
              </div>
              <div className="space-y-1">
                {dayEvents.map((e, idx) => <EventChip key={idx} e={e} onClick={() => onOpenDay(d)} />)}
                {inMonth && dayEvents.length === 0 && <span className="text-[11px] text-[#C9C2AE]">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleView({ year, month, events, isToday }: { year: number; month: number; events: CalendarEvent[]; isToday: (d: number) => boolean }) {
  if (events.length === 0) return <p className="text-center text-[13px] text-[#9A9384] py-8">Nothing scheduled this month.</p>;
  const byDay = new Map<number, CalendarEvent[]>();
  for (const e of events) { if (!byDay.has(e.day)) byDay.set(e.day, []); byDay.get(e.day)!.push(e); }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);
  const order: CalendarEventType[] = ["delivery", "posting"];
  return (
    <div className="space-y-3">
      {days.map((day) => (
        <div key={day} className="flex gap-3">
          <div className="w-14 shrink-0 text-right pt-1">
            <div className={["inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[13px] font-semibold", isToday(day) ? "bg-[#2C2420] text-white" : "text-[#161513]"].join(" ")}>{day}</div>
            <div className="text-[10px] text-[#9A9384] mt-0.5">{WEEKDAYS[new Date(year, month - 1, day).getDay()]}</div>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5 border-l border-[#EFE7D8] pl-3 py-1">
            {byDay.get(day)!.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).map((e, idx) => {
              const m = TYPE_META[e.type];
              return (
                <div key={idx} className="flex items-center gap-2 rounded-[8px] border border-[#EFE7D8] bg-white px-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold shrink-0" style={{ background: m.bg, color: m.fg }}><m.Icon size={11} /> {m.label}</span>
                  {e.overdue && <AlertTriangle size={11} className="text-danger-text shrink-0" aria-hidden />}
                  <span className="text-[12px] font-medium text-[#161513] truncate flex-1">{e.label}</span>
                  <span className="text-[11px] font-mono text-[#9A9384] shrink-0 hidden sm:block">{e.campaignId ?? e.collabId}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayPopup({ year, month, day, events, onClose }: { year: number; month: number; day: number; events: CalendarEvent[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  // Portal to <body> — required: `.onboarding-stage`'s rise animation keeps a
  // transform on the page wrapper, which cages any in-tree `fixed` overlay to
  // the content column (the sidebar stayed sharp and above the backdrop).
  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4" style={{ background: "rgba(22,21,19,0.45)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="w-full max-w-[440px] max-h-[80vh] overflow-y-auto rounded-[16px] bg-white border border-[#E7E2D2] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-[#E7E2D2] bg-[#FDFBF7] rounded-t-[16px]">
          <p className="text-[14px] font-semibold text-[#161513]">{MONTHS[month - 1]} {day}, {year}</p>
          <button type="button" onClick={onClose} className="p-1 rounded-[6px] hover:bg-[#EDE9DD] text-[#6E695E]"><X size={16} /></button>
        </div>
        <div className="p-3 space-y-2">
          {events.map((e, idx) => {
            const m = TYPE_META[e.type];
            return (
              <div key={idx} className="rounded-[10px] border border-[#E7E2D2] p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: m.bg, color: m.fg }}><m.Icon size={11} /> {m.label}</span>
                  {e.overdue && (
                    <span className="overdue-pill overdue-pill--tiny">
                      <AlertTriangle size={7} aria-hidden /> Overdue
                    </span>
                  )}
                  <span className="text-[12px] font-mono text-[#6E695E] truncate">{e.postId}</span>
                </div>
                <p className="text-[12px] font-medium text-[#161513] truncate">@{e.username ?? "—"}</p>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-[#6E695E]">
                  {e.collabId && <span>Collab: <span className="text-[#161513] font-mono">{e.collabId}</span></span>}
                  {e.campaignId && <span>Campaign: <span className="text-[#161513]">{e.campaignId}</span></span>}
                  {e.collabType && <span>Type: <span className="text-[#161513]">{e.collabType}</span></span>}
                  {e.orderId && <span>Order: <span className="text-[#161513] font-mono">{e.orderId}</span></span>}
                  {e.owner && <span>{e.type === "posting" ? "Posted by" : "Onboarded by"}: <span className="text-[#161513]">{e.owner}</span></span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
