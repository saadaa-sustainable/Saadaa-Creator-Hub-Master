"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Grid3X3,
  List as ListIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/formatters";
import {
  approveBudgetVersion,
  rejectBudgetVersion,
  setVersionGapReason,
} from "./actions";
import { VersionChip, VersionExplainer } from "./version-chip";
import type {
  BudgetMonth,
  BudgetPageData,
  BudgetVersionRow,
  CampaignMonthGroup,
  TierLine,
} from "./types";

const KIND_LABEL: Record<string, string> = {
  initial: "First created budget",
  carry_forward: "Carry-forward",
  top_up: "Top-up (new money)",
};

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  approved: { label: "Active", cls: "bg-success-bg text-success" },
  closed: { label: "Closed", cls: "bg-bg-surface text-text-tertiary" },
  pending_approval: { label: "Pending approval", cls: "bg-warning-bg text-warning" },
  rejected: { label: "Rejected", cls: "bg-danger-bg text-danger" },
};

/** Same rotating accent family the Existing Campaigns cards use. */
const CAMPAIGN_ACCENTS = ["#B57514", "#3B6FD4", "#4F7C4D", "#7B4FBF"];
function accentFor(campaignId: string): string {
  const seed = parseInt(campaignId.replace(/\D/g, ""), 10) || 0;
  return CAMPAIGN_ACCENTS[Math.abs(seed) % CAMPAIGN_ACCENTS.length];
}

const BUDGET_VIEW_STORAGE_KEY = "creatorhub:budget:view";
type ViewMode = "list" | "cards";

export function BudgetPageClient({
  data,
  canApprove,
}: {
  data: BudgetPageData;
  canApprove: boolean;
}) {
  const [month, setMonth] = useState<string>(data.defaultMonth ?? "");
  const [view, setView] = useState<ViewMode>("list");
  useEffect(() => {
    const stored = window.localStorage.getItem(BUDGET_VIEW_STORAGE_KEY);
    if (stored === "cards" || stored === "list") setView(stored);
  }, []);
  const switchView = (v: ViewMode) => {
    setView(v);
    window.localStorage.setItem(BUDGET_VIEW_STORAGE_KEY, v);
  };
  const active: BudgetMonth | undefined = useMemo(
    () => data.months.find((m) => m.key === month) ?? data.months[0],
    [data.months, month],
  );

  if (data.months.length === 0) {
    return (
      <section className="rounded-2xl bg-bg-white border border-border p-6 text-center text-[0.85rem] text-text-secondary">
        No budget versions yet — create a campaign and its V0 will appear here.
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Month sub-tabs — same pattern as the Sheet View Budget tab. */}
      <div className="rounded-2xl bg-bg-surface border border-border p-2 flex items-center gap-1 overflow-x-auto">
        {data.months.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMonth(m.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[0.7rem] font-extrabold whitespace-nowrap transition-all",
              active?.key === m.key
                ? "bg-bg-white text-text-primary border border-[--accent] shadow-sm"
                : "text-text-secondary hover:bg-bg-muted/60",
            )}
          >
            <Calendar size={11} aria-hidden /> {m.label}
          </button>
        ))}
      </div>

      {active && (
        <>
          {/* KPI strip */}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <Kpi
              label={`Allocated · ${active.label}`}
              value={formatRupees(active.kpi.allocated)}
              sub={`${active.groups.length} campaign${active.groups.length === 1 ? "" : "s"}`}
              tone="border-l-[#3B6FD4]"
            />
            <Kpi
              label="Utilized (Expected)"
              value={formatRupees(active.kpi.utilized)}
              sub="Commercials + order values of this month's onboardings"
              tone="border-l-success"
            />
            <Kpi
              label="Remaining"
              value={formatRupees(active.kpi.remaining)}
              sub="Rolls into next month if unused"
              tone="border-l-warning"
            />
            <Kpi
              label="Pending approval"
              value={formatRupees(active.kpi.pendingAmount)}
              sub={
                active.kpi.pendingCount > 0
                  ? `${active.kpi.pendingCount} version${active.kpi.pendingCount === 1 ? "" : "s"} awaiting Global Admin`
                  : "Nothing waiting"
              }
              tone="border-l-danger"
            />
          </div>

          <VersionExplainer />

          {/* Toolbar — row/card toggle (same shell as the workflow stages). */}
          <div className="stage-board-toolbar">
            <div className="stage-board-toolbar__copy">
              <span>
                {active.groups.length} campaign
                {active.groups.length === 1 ? "" : "s"}
              </span>
              <strong>
                {view === "list" ? "Row view" : "Card view"} · {active.label}
              </strong>
            </div>
            <div className="ob-viewtoggle" role="tablist" aria-label="View mode">
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                className={cn(view === "list" && "active")}
                onClick={() => switchView("list")}
              >
                <ListIcon size={12} aria-hidden />
                Rows
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "cards"}
                className={cn(view === "cards" && "active")}
                onClick={() => switchView("cards")}
              >
                <Grid3X3 size={12} aria-hidden />
                Cards
              </button>
            </div>
          </div>

          {view === "list" ? (
            active.groups.map((g) => (
              <CampaignGroup key={g.campaignId} g={g} canApprove={canApprove} />
            ))
          ) : (
            <div className="budget-card-grid">
              {active.groups.map((g) => (
                <BudgetCampaignCard
                  key={g.campaignId}
                  g={g}
                  canApprove={canApprove}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-bg-white border border-border border-l-4 px-3.5 py-3",
        tone,
      )}
    >
      <span className="block text-[clamp(0.54rem,0.5rem+0.15vw,0.62rem)] font-extrabold uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </span>
      <b className="block text-[clamp(1rem,0.85rem+0.6vw,1.3rem)] leading-tight tabular-nums text-text-primary">
        {value}
      </b>
      {sub && <span className="text-[0.68rem] text-text-tertiary">{sub}</span>}
    </div>
  );
}

function utilizationPct(g: CampaignMonthGroup): number {
  return g.allocated > 0
    ? Math.min(100, Math.round((g.utilized / g.allocated) * 100))
    : 0;
}

function CampaignGroup({
  g,
  canApprove,
}: {
  g: CampaignMonthGroup;
  canApprove: boolean;
}) {
  const accent = accentFor(g.campaignId);
  return (
    <section
      className="budget-camp rounded-2xl bg-bg-white border border-border overflow-hidden"
      style={{ "--campaign-accent": accent } as React.CSSProperties}
    >
      <header className="budget-camp__head flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b border-border">
        <h3 className="budget-camp__title font-bold text-text-primary">
          <strong className="campaign-card__id">{g.campaignId}</strong>
          {g.campaignName ? (
            <span className="font-semibold text-text-secondary">
              {" "}
              {g.campaignName}
            </span>
          ) : null}
        </h3>
        {g.overBudget && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2.5 py-0.5 text-[0.66rem] font-extrabold text-danger">
            <CircleAlert size={11} aria-hidden /> Over budget
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-baseline gap-4 text-[0.72rem] tabular-nums">
          <HeadStat label="Allocated" value={formatRupees(g.allocated)} />
          <HeadStat
            label="Utilized"
            value={formatRupees(g.utilized)}
            tone={g.overBudget ? "text-danger" : "text-success"}
          />
          <HeadStat label="Remaining" value={formatRupees(g.remaining)} />
        </div>
        <span
          className="budget-camp__track"
          aria-hidden
          title={`${utilizationPct(g)}% of this month's allocation utilized`}
        >
          <span style={{ width: `${utilizationPct(g)}%` }} />
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[0.78rem]">
          <thead>
            <tr className="bg-bg-surface text-left text-[0.6rem] uppercase tracking-[0.08em] text-text-secondary">
              <th className="px-3 py-2 w-8" aria-label="Expand" />
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">What it is</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Creators</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">By</th>
              {canApprove && <th className="px-3 py-2 w-44" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {g.versions.map((v) => (
              <VersionRow key={v.id} v={v} canApprove={canApprove} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Card view — one card per campaign, in the Existing Campaigns visual
 * language (rotating accent, id row, utilization progress). Versions render
 * as compact lines with the same approve/reject + gap-reason controls.
 */
function BudgetCampaignCard({
  g,
  canApprove,
}: {
  g: CampaignMonthGroup;
  canApprove: boolean;
}) {
  const accent = accentFor(g.campaignId);
  const pct = utilizationPct(g);
  return (
    <article
      className="budget-camp-card"
      style={
        {
          "--campaign-accent": accent,
          "--campaign-progress": `${pct}%`,
        } as React.CSSProperties
      }
    >
      <header className="campaign-card__id-row">
        <strong className="campaign-card__id">{g.campaignId}</strong>
        {g.overBudget ? (
          <span className="chip-over inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-[0.62rem] font-extrabold text-danger">
            <CircleAlert size={10} aria-hidden /> Over budget
          </span>
        ) : (
          <span className="campaign-status-pill">{pct}% used</span>
        )}
      </header>
      <h3 className="budget-camp-card__name">{g.campaignName ?? "—"}</h3>

      <span className="budget-camp__track" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </span>

      <div className="budget-camp-card__stats">
        <div>
          <span>Allocated</span>
          <strong>{formatRupees(g.allocated)}</strong>
        </div>
        <div>
          <span>Utilized</span>
          <strong className={g.overBudget ? "text-danger" : "text-success"}>
            {formatRupees(g.utilized)}
          </strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>{formatRupees(g.remaining)}</strong>
        </div>
      </div>

      <ul className="budget-camp-card__versions">
        {g.versions.map((v) => (
          <VersionLine key={v.id} v={v} canApprove={canApprove} />
        ))}
      </ul>
    </article>
  );
}

/** Compact per-version line for the card view — same actions as the row view. */
function VersionLine({
  v,
  canApprove,
}: {
  v: BudgetVersionRow;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const status = STATUS_CHIP[v.status] ?? STATUS_CHIP.closed;
  const isPending = v.status === "pending_approval";

  const approve = () =>
    start(async () => {
      const res = await approveBudgetVersion(v.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        `${v.campaign_id} V${v.version_number} approved — ${formatRupees(Number(v.amount))} is live.`,
      );
      router.refresh();
    });

  const reject = () =>
    start(async () => {
      const res = await rejectBudgetVersion(v.id, reason);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${v.campaign_id} V${v.version_number} rejected.`);
      setRejecting(false);
      router.refresh();
    });

  return (
    <li className="budget-camp-card__vline">
      <div className="flex flex-wrap items-center gap-2">
        <VersionChip n={v.version_number} kind={v.kind} />
        <span className="text-[0.74rem] font-semibold text-text-primary">
          {KIND_LABEL[v.kind] ?? v.kind}
        </span>
        <span className="ml-auto tabular-nums text-[0.78rem] font-bold">
          {formatRupees(Number(v.amount))}
        </span>
        <span
          className={cn(
            "inline-block rounded-full px-2 py-0.5 text-[0.62rem] font-extrabold whitespace-nowrap",
            status.cls,
          )}
        >
          {status.label}
        </span>
      </div>
      {v.note && (
        <span
          className="block truncate text-[0.68rem] text-text-tertiary"
          title={v.note}
        >
          {v.kind === "top_up" ? "Reason: " : ""}
          {v.note}
        </span>
      )}
      {v.kind === "carry_forward" && <GapReason v={v} />}
      {canApprove && isPending && !rejecting && (
        <span className="mt-1 flex gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={approve}
            className="inline-flex items-center gap-1 rounded-lg border border-[#d9b115] bg-accent px-3 py-1.5 text-[0.7rem] font-extrabold text-text-primary disabled:opacity-60"
          >
            <Check size={12} aria-hidden /> Approve
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setRejecting(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[#EFC9C2] bg-bg-white px-3 py-1.5 text-[0.7rem] font-bold text-danger disabled:opacity-60"
          >
            <X size={12} aria-hidden /> Reject
          </button>
        </span>
      )}
      {canApprove && isPending && rejecting && (
        <span className="mt-1 flex items-center gap-1.5">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? (sent to the requester)"
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg-white px-2 py-1.5 text-[0.7rem]"
          />
          <button
            type="button"
            disabled={pending}
            onClick={reject}
            className="rounded-lg border border-[#EFC9C2] bg-danger-bg px-2.5 py-1.5 text-[0.7rem] font-extrabold text-danger disabled:opacity-60"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="text-[0.7rem] text-text-tertiary"
          >
            Cancel
          </button>
        </span>
      )}
    </li>
  );
}

function HeadStat({
  label,
  value,
  tone = "text-text-primary",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </span>
      <b className={cn("tabular-nums", tone)}>{value}</b>
    </span>
  );
}

/**
 * "Why wasn't this utilized?" — the documented gap behind a carry-forward.
 * Any admin on this page can write/update it; it shows inline on the row.
 */
function GapReason({ v }: { v: BudgetVersionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(v.gap_reason ?? "");

  const save = () =>
    start(async () => {
      const res = await setVersionGapReason(v.id, text);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Gap reason saved.");
      setEditing(false);
      router.refresh();
    });

  if (editing) {
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Why wasn't this money used last month?"
          className="w-64 rounded-lg border border-border bg-bg-white px-2 py-1 text-[0.7rem]"
        />
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg border border-border bg-bg-surface px-2 py-1 text-[0.66rem] font-extrabold text-text-primary disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[0.66rem] text-text-tertiary"
        >
          Cancel
        </button>
      </span>
    );
  }

  return v.gap_reason ? (
    <span className="mt-0.5 block max-w-[380px] text-[0.7rem] text-warning">
      Why unused: {v.gap_reason}{" "}
      <button
        type="button"
        className="font-bold underline decoration-dotted"
        onClick={() => setEditing(true)}
      >
        edit
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mt-0.5 block text-[0.68rem] font-bold text-text-tertiary underline decoration-dotted hover:text-warning"
    >
      + Add why this wasn&apos;t used
    </button>
  );
}

function VersionRow({
  v,
  canApprove,
}: {
  v: BudgetVersionRow;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const lines: TierLine[] =
    v.tierLines.length > 0 ? v.tierLines : v.draftLines;
  const expandable = lines.length > 0;
  const status = STATUS_CHIP[v.status] ?? STATUS_CHIP.closed;
  const isPending = v.status === "pending_approval";

  const approve = () =>
    start(async () => {
      const res = await approveBudgetVersion(v.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        `${v.campaign_id} V${v.version_number} approved — ${formatRupees(Number(v.amount))} is live.`,
      );
      router.refresh();
    });

  const reject = () =>
    start(async () => {
      const res = await rejectBudgetVersion(v.id, reason);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${v.campaign_id} V${v.version_number} rejected.`);
      setRejecting(false);
      router.refresh();
    });

  return (
    <>
      <tr className="border-t border-[#F0EAD6] align-middle">
        <td className="px-3 py-2.5">
          {expandable && (
            <button
              type="button"
              className="text-text-tertiary hover:text-text-primary"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Hide budget lines" : "Show budget lines"}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </td>
        <td className="px-3 py-2.5">
          <VersionChip n={v.version_number} kind={v.kind} />
        </td>
        <td className="px-3 py-2.5">
          <span className="font-semibold text-text-primary">
            {KIND_LABEL[v.kind] ?? v.kind}
          </span>
          {v.note && (
            <span
              className="block max-w-[360px] truncate text-[0.7rem] text-text-tertiary"
              title={v.note}
            >
              {v.kind === "top_up" ? "Reason: " : ""}
              {v.note}
            </span>
          )}
          {v.kind === "carry_forward" && <GapReason v={v} />}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums font-bold">
          {formatRupees(Number(v.amount))}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          {v.num_creators > 0 ? `+${v.num_creators}` : "—"}
        </td>
        <td className="px-3 py-2.5">
          <span
            className={cn(
              "inline-block rounded-full px-2.5 py-0.5 text-[0.66rem] font-extrabold whitespace-nowrap",
              status.cls,
            )}
          >
            {status.label}
          </span>
        </td>
        <td className="px-3 py-2.5 text-[0.72rem] text-text-secondary">
          {v.status === "approved" || v.status === "closed"
            ? (v.approved_by ?? "—")
            : (v.created_by ?? "—")}
        </td>
        {canApprove && (
          <td className="px-3 py-2.5">
            {isPending && !rejecting && (
              <span className="flex gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={approve}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#d9b115] bg-accent px-3 py-1.5 text-[0.7rem] font-extrabold text-text-primary disabled:opacity-60"
                >
                  <Check size={12} aria-hidden /> Approve
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setRejecting(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#EFC9C2] bg-bg-white px-3 py-1.5 text-[0.7rem] font-bold text-danger disabled:opacity-60"
                >
                  <X size={12} aria-hidden /> Reject
                </button>
              </span>
            )}
            {isPending && rejecting && (
              <span className="flex items-center gap-1.5">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why? (sent to the requester)"
                  className="w-40 rounded-lg border border-border bg-bg-white px-2 py-1.5 text-[0.7rem]"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={reject}
                  className="rounded-lg border border-[#EFC9C2] bg-danger-bg px-2.5 py-1.5 text-[0.7rem] font-extrabold text-danger disabled:opacity-60"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="text-[0.7rem] text-text-tertiary"
                >
                  Cancel
                </button>
              </span>
            )}
          </td>
        )}
      </tr>
      {open && expandable && (
        <tr className="border-t border-[#F0EAD6] bg-[#FCFAF6]">
          <td />
          <td colSpan={canApprove ? 7 : 6} className="px-3 pb-3 pt-1">
            <div className="overflow-x-auto rounded-lg border border-border bg-bg-white">
              <table className="w-full min-w-[640px] border-collapse text-[0.74rem]">
                <thead>
                  <tr className="bg-bg-surface text-left text-[0.58rem] uppercase tracking-[0.08em] text-text-secondary">
                    <th className="px-3 py-1.5">Tier</th>
                    <th className="px-3 py-1.5">Collab</th>
                    <th className="px-3 py-1.5 text-right">No.</th>
                    <th className="px-3 py-1.5 text-right">Avg Comp ₹</th>
                    <th className="px-3 py-1.5 text-right">Comp Total</th>
                    <th className="px-3 py-1.5 text-right">Min G</th>
                    <th className="px-3 py-1.5 text-right">Max G</th>
                    <th className="px-3 py-1.5 text-right">Garment Cost</th>
                    <th className="px-3 py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id ?? i} className="border-t border-[#F0EAD6]">
                      <td className="px-3 py-1.5">{l.tier ?? "—"}</td>
                      <td className="px-3 py-1.5">{l.collab_type ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {l.num_influencers ?? 0}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatRupees(Number(l.avg_comp ?? 0))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatRupees(Number(l.total_cost ?? 0))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {l.min_garments ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {l.max_garments ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatRupees(Number(l.est_garment_cost ?? 0))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold">
                        {formatRupees(Number(l.total_with_garments ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
