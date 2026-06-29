"use client";

import { useMemo, useState, type ComponentType } from "react";
import {
  CheckCircle2,
  Pencil,
  RotateCcw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Trash2,
  UserCog,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  AuditEntry,
  AuditLogData,
  AuditSource,
  AuditTone,
} from "./types";

type Icon = ComponentType<LucideProps>;

const SOURCE_META: Record<
  AuditSource,
  { label: string; icon: Icon; color: string; bg: string }
> = {
  Sheet: { label: "Sheet View", icon: Table2, color: "#3B6FD4", bg: "#ECF1FB" },
  User: { label: "Users & Access", icon: UserCog, color: "#7B4FBF", bg: "#F3EDFB" },
  System: { label: "System", icon: ShieldAlert, color: "#C0392B", bg: "#FDECEA" },
  Approval: { label: "Approvals", icon: ShieldCheck, color: "#B57514", bg: "#FAF1DC" },
};

const TONE_META: Record<AuditTone, { icon: Icon; color: string; bg: string }> = {
  create: { icon: CheckCircle2, color: "#4F7C4D", bg: "#ECF1E9" },
  delete: { icon: Trash2, color: "#C0392B", bg: "#FDECEA" },
  change: { icon: Pencil, color: "#B57514", bg: "#FAF1DC" },
  resolve: { icon: CheckCircle2, color: "#4F7C4D", bg: "#ECF1E9" },
  neutral: { icon: RotateCcw, color: "#6E695E", bg: "#F0EDE6" },
};

/** Compact "DD MMM YYYY · HH:MM" in IST. */
function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const date = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${date} · ${time}`;
}

export function AuditLogBody({ data }: { data: AuditLogData }) {
  const [source, setSource] = useState<AuditSource | "all">("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.entries.filter((e) => {
      if (source !== "all" && e.source !== source) return false;
      if (!needle) return true;
      return `${e.actor} ${e.action} ${e.target} ${e.detail}`
        .toLowerCase()
        .includes(needle);
    });
  }, [data.entries, source, q]);

  const tiles: Array<{
    key: AuditSource | "all";
    label: string;
    count: number;
    icon: Icon;
    color: string;
    bg: string;
  }> = [
    {
      key: "all",
      label: "All events",
      count: data.total,
      icon: ScrollText,
      color: "#161513",
      bg: "#F0EAD6",
    },
    ...(Object.keys(SOURCE_META) as AuditSource[]).map((s) => ({
      key: s,
      label: SOURCE_META[s].label,
      count: data.counts[s],
      icon: SOURCE_META[s].icon,
      color: SOURCE_META[s].color,
      bg: SOURCE_META[s].bg,
    })),
  ];

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Source filter tiles */}
      <div
        role="tablist"
        aria-label="Filter the audit log by source"
        className="grid grid-cols-2 gap-3 lg:grid-cols-5"
      >
        {tiles.map((t) => {
          const active = source === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSource(t.key)}
              className={cn(
                "flex items-center gap-3 rounded-[14px] border bg-bg-white p-3 text-left transition-[border-color,box-shadow] hover:shadow-sm",
                active ? "border-text-primary shadow-sm" : "border-border",
              )}
            >
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: t.bg, color: t.color }}
              >
                <t.icon size={16} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[1.05rem] font-bold leading-none tabular text-text-primary">
                  {t.count.toLocaleString("en-IN")}
                </div>
                <div className="mt-1 truncate text-[0.72rem] text-text-secondary">
                  {t.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex">
        <div className="relative ml-auto w-full max-w-sm">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actor, action, target…"
            aria-label="Search the audit log"
            className="h-9 w-full rounded-[8px] border border-border bg-bg-white pl-7 pr-2.5 text-[0.8rem] text-text-primary placeholder:text-text-tertiary focus:border-[#C9A882] focus:outline-none focus:ring-2 focus:ring-[#F0C61E]/25"
          />
        </div>
      </div>

      {/* Log list */}
      {shown.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-bg-white py-16 text-center text-text-tertiary">
          <ScrollText size={28} aria-hidden />
          <p className="font-medium text-text-primary">
            {data.total === 0 ? "No audit events yet" : "No matching events"}
          </p>
          <p className="text-sm">
            {data.total === 0
              ? "Edits, deletions, access changes and system errors will appear here."
              : "Try a different search or source filter."}
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border-soft overflow-hidden rounded-[var(--radius)] border border-border bg-bg-white shadow-sm">
          {shown.map((e) => (
            <AuditRow key={e.id} e={e} />
          ))}
        </ol>
      )}
    </div>
  );
}

function AuditRow({ e }: { e: AuditEntry }) {
  const s = SOURCE_META[e.source];
  const t = TONE_META[e.tone];
  const ToneIcon = t.icon;
  const SourceIcon = s.icon;

  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bg-alt">
      <span
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: s.bg, color: s.color }}
        title={s.label}
      >
        <SourceIcon size={14} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-text-primary">
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full"
              style={{ background: t.bg, color: t.color }}
            >
              <ToneIcon size={10} aria-hidden />
            </span>
            {e.action}
          </span>
          <span className="truncate font-mono text-[0.7rem] text-text-secondary">
            {e.target}
          </span>
        </div>
        <div className="mt-0.5 min-w-0 text-[0.7rem] text-text-tertiary">
          <span className="font-medium text-text-secondary">{e.actor}</span>
          {e.detail && <span> · {e.detail}</span>}
        </div>
      </div>

      <span className="mt-0.5 shrink-0 whitespace-nowrap font-mono text-[0.66rem] text-text-tertiary">
        {formatWhen(e.at)}
      </span>
    </li>
  );
}
