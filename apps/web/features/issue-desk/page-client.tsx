"use client";

import {
  useMemo,
  useState,
  useTransition,
  type ComponentType,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bug,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  CircleHelp,
  Clock3,
  Database,
  Inbox,
  KeyRound,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Search,
  Send,
  Siren,
  SignalHigh,
  SignalLow,
  SignalMedium,
  UserRound,
  Workflow,
  XCircle,
  type LucideProps,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { TicketReferenceInput } from "./reference-input";
import { createSupportTicket, updateSupportTicket } from "./actions";
import type {
  SupportTicket,
  SupportTicketDeskData,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "./types";

type Icon = ComponentType<LucideProps>;

const STATUS: Record<
  TicketStatus,
  { label: string; icon: Icon; color: string; bg: string }
> = {
  open: { label: "Open", icon: CircleDot, color: "#B57514", bg: "#FAF1DC" },
  in_progress: { label: "In progress", icon: Clock3, color: "#3B6FD4", bg: "#ECF1FB" },
  resolved: { label: "Resolved", icon: CheckCircle2, color: "#4F7C4D", bg: "#ECF1E9" },
  closed: { label: "Closed", icon: XCircle, color: "#6E695E", bg: "#F0EDE6" },
};

const CATEGORY: Record<TicketCategory, { label: string; icon: Icon }> = {
  workflow: { label: "Workflow", icon: Workflow },
  access: { label: "Access", icon: KeyRound },
  data: { label: "Data", icon: Database },
  bug: { label: "Bug", icon: Bug },
  suggestion: { label: "Suggestion", icon: Lightbulb },
  other: { label: "Other", icon: CircleHelp },
};

const PRIORITY: Record<
  TicketPriority,
  { label: string; icon: Icon; color: string; bg: string }
> = {
  low: { label: "Low", icon: SignalLow, color: "#6E695E", bg: "#F0EDE6" },
  medium: { label: "Medium", icon: SignalMedium, color: "#3B6FD4", bg: "#ECF1FB" },
  high: { label: "High", icon: SignalHigh, color: "#B57514", bg: "#FAF1DC" },
  urgent: { label: "Urgent", icon: Siren, color: "#C0392B", bg: "#FDECEA" },
};

const CATEGORY_KEYS = Object.keys(CATEGORY) as TicketCategory[];
const PRIORITY_KEYS = Object.keys(PRIORITY) as TicketPriority[];

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(t));
}

export function IssueDeskBody({ data }: { data: SupportTicketDeskData }) {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <KpiStrip counts={data.counts} />
      <div className="grid grid-cols-12 items-start gap-4">
        <CreateTicketPanel />
        <ResolutionQueue
          tickets={data.tickets}
          counts={data.counts}
          isAdmin={data.isAdmin}
        />
      </div>
    </div>
  );
}

function KpiStrip({ counts }: { counts: SupportTicketDeskData["counts"] }) {
  const tiles: Array<{ label: string; n: number; color: string; bg: string; icon: Icon }> = [
    { label: "All tickets", n: counts.all, color: "#161513", bg: "#F0EAD6", icon: Inbox },
    { label: "Open", n: counts.open, color: STATUS.open.color, bg: STATUS.open.bg, icon: CircleDot },
    { label: "In progress", n: counts.in_progress, color: STATUS.in_progress.color, bg: STATUS.in_progress.bg, icon: Clock3 },
    { label: "Resolved", n: counts.resolved, color: STATUS.resolved.color, bg: STATUS.resolved.bg, icon: CheckCircle2 },
    { label: "Urgent", n: counts.urgent, color: PRIORITY.urgent.color, bg: PRIORITY.urgent.bg, icon: Siren },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex items-center gap-3 rounded-[14px] border border-border bg-bg-white p-3"
        >
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: t.bg, color: t.color }}
          >
            <t.icon size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[1.05rem] font-bold leading-none tabular text-text-primary">
              {t.n.toLocaleString("en-IN")}
            </div>
            <div className="mt-1 truncate text-[0.72rem] text-text-secondary">
              {t.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateTicketPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("workflow");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [sourcePath, setSourcePath] = useState("");

  const submit = () => {
    start(async () => {
      const res = await createSupportTicket({
        title,
        description,
        category,
        priority,
        sourcePath,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Ticket ${res.ticket.ticketNo} raised.`);
      setTitle("");
      setDescription("");
      setCategory("workflow");
      setPriority("medium");
      setSourcePath("");
      router.refresh();
    });
  };

  const inputCls =
    "h-9 w-full rounded-[10px] border border-border bg-bg-white px-3 text-[0.8rem] text-text-primary placeholder:text-text-tertiary focus:border-[#C9A882] focus:outline-none focus:ring-2 focus:ring-[#F0C61E]/25";

  return (
    <section className="col-span-12 rounded-[16px] border border-border bg-bg-surface p-4 xl:col-span-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent/15 text-[#B57514]">
          <MessageSquarePlus size={15} aria-hidden />
        </span>
        <h2 className="text-[0.95rem] font-bold text-text-primary">Raise a Ticket</h2>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-text-secondary">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder="Short issue summary"
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-text-secondary">
            Issue details
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="What happened, where, and what you need resolved"
            className="w-full resize-y rounded-[10px] border border-border bg-bg-white px-3 py-2 text-[0.8rem] text-text-primary placeholder:text-text-tertiary focus:border-[#C9A882] focus:outline-none focus:ring-2 focus:ring-[#F0C61E]/25"
          />
        </div>

        <div>
          <label className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-text-secondary">
            Category
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {CATEGORY_KEYS.map((k) => {
              const Icon = CATEGORY[k].icon;
              const active = category === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategory(k)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-[9px] border px-2 py-1.5 text-[0.72rem] font-medium transition-colors",
                    active
                      ? "border-text-primary bg-bg-ecru text-text-primary"
                      : "border-border bg-bg-white text-text-secondary hover:bg-bg-alt",
                  )}
                >
                  <Icon size={12} aria-hidden />
                  {CATEGORY[k].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-text-secondary">
            Priority
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {PRIORITY_KEYS.map((k) => {
              const Icon = PRIORITY[k].icon;
              const active = priority === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPriority(k)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1 rounded-[9px] border px-2 py-1.5 text-[0.72rem] font-medium transition-colors",
                    active ? "border-text-primary" : "border-border hover:bg-bg-alt",
                  )}
                  style={
                    active
                      ? { background: PRIORITY[k].bg, color: PRIORITY[k].color }
                      : undefined
                  }
                >
                  <Icon size={12} aria-hidden />
                  {PRIORITY[k].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-text-secondary">
            Linked record
          </label>
          <TicketReferenceInput value={sourcePath} onChange={setSourcePath} />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn-primary-cta mt-1 justify-center"
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Raising…
            </>
          ) : (
            <>
              <Send size={14} /> Raise Ticket
            </>
          )}
        </button>
      </div>
    </section>
  );
}

const STATUS_TABS: Array<{ key: TicketStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

function ResolutionQueue({
  tickets,
  counts,
  isAdmin,
}: {
  tickets: SupportTicket[];
  counts: SupportTicketDeskData["counts"];
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<TicketStatus | "all">("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tickets.filter((t) => {
      if (tab !== "all" && t.status !== tab) return false;
      if (!needle) return true;
      return `${t.ticketNo} ${t.title} ${t.description} ${t.requesterName ?? ""} ${t.sourcePath ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [tickets, tab, q]);

  return (
    <section className="col-span-12 rounded-[16px] border border-border bg-bg-white xl:col-span-7">
      <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
        <h2 className="text-[0.95rem] font-bold text-text-primary">
          {isAdmin ? "Resolution Queue" : "My Tickets"}
        </h2>
        <span className="rounded-full bg-bg-ecru px-2 py-0.5 text-[0.7rem] font-semibold tabular text-text-primary">
          {shown.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tickets"
            className="h-9 w-full rounded-[8px] border border-border bg-bg-white pl-7 pr-2.5 text-[0.8rem] text-text-primary placeholder:text-text-tertiary focus:border-[#C9A882] focus:outline-none focus:ring-2 focus:ring-[#F0C61E]/25"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((s) => {
            const n =
              s.key === "all" ? counts.all : counts[s.key];
            const active = tab === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setTab(s.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition-colors",
                  active
                    ? "border-text-primary bg-bg-ecru text-text-primary"
                    : "border-border bg-bg-white text-text-secondary hover:bg-bg-alt",
                )}
              >
                {s.label}
                <span className="tabular text-text-tertiary">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center text-text-tertiary">
          <Inbox size={26} aria-hidden />
          <p className="font-medium text-text-primary">No tickets here</p>
          <p className="text-sm">
            {tickets.length === 0
              ? "Raise the first one with the form."
              : "Try a different filter or search."}
          </p>
        </div>
      ) : (
        <ol className="mt-3 divide-y divide-border-soft">
          {shown.map((t) => (
            <TicketRow key={t.id} t={t} isAdmin={isAdmin} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TicketRow({ t, isAdmin }: { t: SupportTicket; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[t.status];
  const StIcon = st.icon;
  const cat = CATEGORY[t.category];
  const pr = PRIORITY[t.priority];

  return (
    <li className="bg-bg-white transition-colors hover:bg-bg-alt/40">
      <div className="flex items-start gap-3 p-4">
        <span
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: st.bg, color: st.color }}
          title={st.label}
        >
          <StIcon size={14} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="font-mono text-[0.72rem] text-text-tertiary">
              {t.ticketNo}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-bg-surface px-1.5 py-0.5 text-[0.66rem] text-text-secondary">
              <cat.icon size={9} aria-hidden /> {cat.label}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.66rem] font-medium"
              style={{ background: pr.bg, color: pr.color }}
            >
              <pr.icon size={9} aria-hidden /> {pr.label}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                "ml-auto shrink-0 text-text-tertiary transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          <h3 className="mt-1 truncate text-[0.85rem] font-semibold text-text-primary">
            {t.title}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <UserRound size={10} aria-hidden />
              {t.requesterName ?? t.requesterEmail ?? "Someone"}
            </span>
            <span>· {fmtWhen(t.createdAt)}</span>
            <span style={{ color: st.color }}>· {st.label}</span>
            {t.sourcePath && (
              <span className="truncate font-mono">· {t.sourcePath}</span>
            )}
          </div>

          {open && (
            <div className="mt-3 border-t border-border-soft pt-3">
              <p className="whitespace-pre-wrap text-[0.8rem] leading-relaxed text-text-primary">
                {t.description}
              </p>
              {t.adminNote && <Note label="Admin note" value={t.adminNote} />}
              {t.resolution && <Note label="Resolution" value={t.resolution} />}
              {t.assignedAdminEmail && (
                <Note label="Owner" value={t.assignedAdminEmail} />
              )}
              {isAdmin && <AdminControls t={t} />}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Note({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 rounded-[10px] border border-border-soft bg-bg-surface px-2.5 py-1.5">
      <div className="text-[0.64rem] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-0.5 whitespace-pre-wrap text-[0.76rem] text-text-primary">
        {value}
      </div>
    </div>
  );
}

const ADMIN_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

function AdminControls({ t }: { t: SupportTicket }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<TicketStatus>(t.status);
  const [adminNote, setAdminNote] = useState(t.adminNote ?? "");
  const [resolution, setResolution] = useState(t.resolution ?? "");

  const save = () => {
    start(async () => {
      const res = await updateSupportTicket({
        id: t.id,
        status,
        adminNote,
        resolution,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${t.ticketNo} updated.`);
      router.refresh();
    });
  };

  const fieldCls =
    "w-full rounded-[10px] border border-border bg-bg-white px-2.5 py-1.5 text-[0.78rem] text-text-primary focus:border-[#C9A882] focus:outline-none focus:ring-2 focus:ring-[#F0C61E]/25";

  return (
    <div className="mt-3 rounded-[10px] border border-border bg-bg-surface p-2.5">
      <div className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.04em] text-text-secondary">
        Admin controls
      </div>
      <div className="flex flex-col gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus)}
          className={fieldCls}
        >
          {ADMIN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </select>
        <textarea
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Internal admin note (optional)"
          className={cn(fieldCls, "resize-y")}
        />
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Resolution shown to the requester (optional)"
          className={cn(fieldCls, "resize-y")}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="btn-primary-cta justify-center"
        >
          {pending ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Saving…
            </>
          ) : (
            "Save update"
          )}
        </button>
      </div>
    </div>
  );
}
