"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  FilePenLine,
  Grid3X3,
  History,
  Inbox,
  List as ListIcon,
  Loader2,
  Megaphone,
  ShieldCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import { TierLinesTable } from "@/features/budget/tier-lines-table";
import {
  approveCampaign,
  approveCampaignEditRequest,
  fetchCampaignForEdit,
  rejectCampaign,
  rejectCampaignEditRequest,
} from "@/features/campaigns/actions";
import {
  CampaignEditModal,
  type EditTarget,
} from "@/features/campaigns/existing-campaigns";
import { decideOnboardingEdit } from "@/features/onboarding/edit-actions";
import type { OnboardingEditItem } from "@/features/onboarding/edit-fields";
import {
  getApprovalHistoryDetail,
  type ApprovalHistoryDetail,
} from "./actions";
import type {
  ApprovalHistoryItem,
  ApprovalHistoryStatus,
  ApprovalItem,
  ApprovalQueueData,
  BudgetApprovalItem,
} from "./queries";
import {
  approveBudgetVersion,
  rejectBudgetVersion,
} from "@/features/budget/actions";
import { VersionChip } from "@/features/budget/version-chip";

type QueueView = "list" | "cards";
const QUEUE_VIEW_STORAGE_KEY = "ch-approvals-view";

export function ApprovalsBody({
  data,
  canApproveBudget = false,
}: {
  data: ApprovalQueueData;
  canApproveBudget?: boolean;
}) {
  const totalBudget = data.items.reduce((s, i) => s + (i.budget ?? 0), 0);
  const campaignCount = data.items.filter((i) => i.kind === "campaign").length;
  const editCount = data.items.filter((i) => i.kind === "edit").length;

  // List is the default — compact rows, expand for the full detail.
  const [view, setView] = useState<QueueView>("list");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(QUEUE_VIEW_STORAGE_KEY);
      if (saved === "cards" || saved === "list") setView(saved);
    } catch {
      // storage unavailable — keep default
    }
  }, []);
  const switchView = (v: QueueView) => {
    setView(v);
    try {
      window.localStorage.setItem(QUEUE_VIEW_STORAGE_KEY, v);
    } catch {
      // storage unavailable — view still switches for this visit
    }
  };
  const isList = view === "list";
  const sectionGridClass = isList
    ? "flex flex-col gap-2"
    : "grid grid-cols-1 gap-3 xl:grid-cols-2";
  const pendingCount =
    data.budgets.length + data.items.length + data.onboardingEdits.length;

  const tiles = [
    {
      label: "Awaiting approval",
      value: String(data.total),
      icon: ShieldCheck,
      color: "#B57514",
      bg: "#FAF1DC",
    },
    {
      label: "New campaigns",
      value: String(campaignCount),
      icon: Megaphone,
      color: "#3B6FD4",
      bg: "#ECF1FB",
    },
    {
      label: "Edit requests",
      value: String(editCount),
      icon: FilePenLine,
      color: "#7B4FBF",
      bg: "#F3EDFB",
    },
    {
      label: "Queued budget",
      value: formatRupees(totalBudget),
      icon: Wallet,
      color: "#4F7C4D",
      bg: "#ECF1E9",
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              <div className="text-[1.05rem] font-bold leading-none text-text-primary tabular-nums">
                {t.value}
              </div>
              <div className="mt-1 truncate text-[0.72rem] text-text-secondary">
                {t.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.items.length === 0 &&
      data.onboardingEdits.length === 0 &&
      data.budgets.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-bg-white py-16 text-center text-text-tertiary">
          <Inbox size={28} aria-hidden />
          <p className="font-medium text-text-primary">
            Nothing awaiting approval
          </p>
          <p className="text-sm">
            New campaigns, budget versions, edit requests, and onboarding edits
            land here for sign-off before they go live.
          </p>
        </div>
      ) : (
        <>
          <div className="stage-board-toolbar">
            <div className="stage-board-toolbar__copy">
              <span>
                {pendingCount} pending item{pendingCount === 1 ? "" : "s"}
              </span>
              <strong>
                {isList ? "List view" : "Card view"} · approval queue
              </strong>
            </div>
            <div
              className="ob-viewtoggle"
              role="tablist"
              aria-label="View mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={isList}
                className={cn(isList && "active")}
                onClick={() => switchView("list")}
              >
                <ListIcon size={12} aria-hidden />
                List
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isList}
                className={cn(!isList && "active")}
                onClick={() => switchView("cards")}
              >
                <Grid3X3 size={12} aria-hidden />
                Cards
              </button>
            </div>
          </div>
          {data.budgets.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary inline-flex items-center gap-1.5">
                <Wallet size={13} aria-hidden /> Budget approvals (
                {data.budgets.length}) — Global Admins
              </h3>
              <div className={sectionGridClass}>
                {data.budgets.map((b) => (
                  <BudgetApprovalCard
                    key={b.versionId}
                    b={b}
                    canAct={canApproveBudget}
                    variant={view}
                  />
                ))}
              </div>
            </section>
          )}
          {data.items.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary inline-flex items-center gap-1.5">
                <Megaphone size={13} aria-hidden /> Campaign approvals (
                {data.items.length})
              </h3>
              <div className={sectionGridClass}>
                {data.items.map((c) => (
                  <ApprovalCard
                    key={`${c.kind}-${c.approvalId ?? c.campaignId}`}
                    c={c}
                    variant={view}
                  />
                ))}
              </div>
            </section>
          )}
          {data.onboardingEdits.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary inline-flex items-center gap-1.5">
                <FilePenLine size={13} aria-hidden /> Onboarding edits (
                {data.onboardingEdits.length})
              </h3>
              <div className={sectionGridClass}>
                {data.onboardingEdits.map((e) => (
                  <OnboardingEditCard key={e.id} e={e} variant={view} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ApprovalHistory history={data.history} total={data.historyTotal} />
    </div>
  );
}

type CardVariant = "cards" | "list";

/** Compact Approve / Reject pair for list-view row headers. */
function RowActions({
  pending,
  disabled = false,
  approveLabel,
  onApprove,
  onReject,
}: {
  pending: boolean;
  disabled?: boolean;
  approveLabel: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onReject}
        disabled={pending || disabled}
        title="Reject"
        aria-label="Reject"
        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border bg-bg-white text-danger-text transition-colors hover:bg-danger-bg/40 disabled:opacity-50"
      >
        <X size={13} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onApprove}
        disabled={pending || disabled}
        className="inline-flex h-7 items-center gap-1 rounded-[8px] bg-[#F0C61E] px-2.5 text-[0.7rem] font-bold text-[#161513] transition-colors hover:brightness-95 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" aria-hidden />
        ) : (
          <Check size={12} aria-hidden />
        )}
        {approveLabel}
      </button>
    </>
  );
}

function RowExpandButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={open ? "Collapse details" : "Show details"}
      aria-label={open ? "Collapse details" : "Show details"}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border bg-bg-white text-text-secondary transition-colors hover:bg-bg-alt"
    >
      {open ? (
        <ChevronDown size={13} aria-hidden />
      ) : (
        <ChevronRight size={13} aria-hidden />
      )}
    </button>
  );
}

function ApprovalCard({
  c,
  variant = "cards",
}: {
  c: ApprovalItem;
  variant?: CardVariant;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState(false);
  const isListRow = variant === "list";
  const showBody = !isListRow || expanded;
  const isEdit = c.kind === "edit";
  const Icon = isEdit ? FilePenLine : Megaphone;
  const iconStyle = isEdit
    ? { background: "#F3EDFB", color: "#7B4FBF" }
    : { background: "#ECF1FB", color: "#3B6FD4" };
  // Budget first, campaign second — a campaign whose V0 budget is still with
  // the Global Admins cannot be acted on yet (server enforces this too).
  const budgetLocked = !isEdit && Boolean(c.budgetPending);
  const canAct = (!isEdit || c.approvalId != null) && !budgetLocked;

  const approve = () => {
    start(async () => {
      const res = isEdit
        ? await approveCampaignEditRequest(c.approvalId ?? 0)
        : await approveCampaign(c.campaignId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isEdit
          ? `${c.campaignId} edit approved and applied.`
          : `${c.campaignId} approved and now live.`,
      );
      router.refresh();
    });
  };

  const reject = () => {
    start(async () => {
      const res = isEdit
        ? await rejectCampaignEditRequest(c.approvalId ?? 0, reason)
        : await rejectCampaign(c.campaignId, reason);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isEdit ? `${c.campaignId} edit rejected.` : `${c.campaignId} rejected.`,
      );
      router.refresh();
    });
  };

  return (
    <article
      className={cn(
        "flex flex-col rounded-[14px] border border-border bg-bg-white shadow-[0_12px_30px_rgba(23,19,16,0.04)]",
        isListRow ? "gap-2 p-3" : "gap-3 p-4",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
          style={iconStyle}
        >
          <Icon size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[0.95rem] font-bold text-text-primary">
              {c.campaignName ?? c.campaignId}
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.62rem] font-semibold",
                isEdit
                  ? "bg-[#F3EDFB] text-[#6F45B4]"
                  : "bg-[#FAF1DC] text-[#B57514]",
              )}
            >
              {isEdit ? "Pending edit" : "Pending campaign"}
            </span>
            {isListRow && budgetLocked && (
              <span className="rounded-full bg-[#FAF1DC] px-2 py-0.5 text-[0.62rem] font-bold text-[#B57514]">
                Budget first
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-text-tertiary">
            <span className="font-mono">{c.campaignId}</span>
            {c.createdBy && <span>by {c.createdBy}</span>}
            {c.createdAt && <span>{formatDate(c.createdAt)}</span>}
          </div>
        </div>
        {isListRow && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden text-[0.8rem] font-bold text-text-primary tabular-nums sm:inline">
              {isEdit
                ? `${c.changes?.length ?? 0} field${(c.changes?.length ?? 0) === 1 ? "" : "s"}`
                : c.budget != null
                  ? formatRupees(c.budget)
                  : "—"}
            </span>
            {!rejecting && (
              <RowActions
                pending={pending}
                disabled={!canAct}
                approveLabel="Approve"
                onApprove={approve}
                onReject={() => setRejecting(true)}
              />
            )}
            <RowExpandButton
              open={expanded}
              onToggle={() => setExpanded((o) => !o)}
            />
          </div>
        )}
      </div>

      {showBody && c.keyMessage && (
        <p className="line-clamp-2 text-[0.78rem] leading-relaxed text-text-secondary">
          {c.keyMessage}
        </p>
      )}

      {/* Edit requests: before/after diff so the admin sees exactly what
          changes BEFORE deciding — same table the onboarding-edit card uses. */}
      {showBody &&
      (isEdit && (c.changes?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] text-[0.7rem]">
            <thead>
              <tr className="border-b border-border text-[0.54rem] font-extrabold uppercase text-text-tertiary">
                <th className="pb-1 pr-2 text-left">Field</th>
                <th className="px-1.5 pb-1 text-left">Before</th>
                <th className="pb-1 pl-1.5 text-left">After</th>
              </tr>
            </thead>
            <tbody>
              {c.changes!.map((ch) => (
                <tr key={ch.label} className="border-t border-border">
                  <td className="py-1 pr-2 font-bold text-text-primary">
                    {ch.label}
                  </td>
                  <td className="max-w-[160px] truncate px-1.5 py-1 text-danger-text line-through">
                    {ch.before ?? "—"}
                  </td>
                  <td className="max-w-[200px] truncate py-1 pl-1.5 font-semibold text-[#2E7145]">
                    {ch.after || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            icon={Wallet}
            label="Budget"
            value={c.budget != null ? formatRupees(c.budget) : "-"}
          />
          <Metric
            icon={Users}
            label="Creators"
            value={c.creators != null ? String(c.creators) : "-"}
          />
          <Metric icon={Calendar} label="Start" value={formatDate(c.startDate)} />
          <Metric icon={Calendar} label="End" value={formatDate(c.endDate)} />
        </div>
      ))}

      {showBody && (
        <div className="flex flex-wrap items-center gap-2">
          {c.briefLink && /^https?:\/\//i.test(c.briefLink) && (
          <a
            href={c.briefLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[9px] border border-border bg-bg-white px-2.5 py-1.5 text-[0.72rem] font-semibold text-[#3B6FD4] transition-colors hover:bg-[#ECF1FB]"
          >
            <ExternalLink size={12} aria-hidden /> Campaign brief
          </a>
        )}
        {isEdit && (
          <span className="inline-flex items-center gap-1 rounded-[9px] bg-[#F7F3EC] px-2.5 py-1.5 text-[0.72rem] font-semibold text-text-secondary">
            <Clock3 size={12} aria-hidden /> Will apply after approval
          </span>
        )}
        {budgetLocked && (
          <span className="inline-flex items-center gap-1 rounded-[9px] bg-[#FAF1DC] px-2.5 py-1.5 text-[0.72rem] font-bold text-[#B57514]">
            <Clock3 size={12} aria-hidden /> Approve the budget first — V0 is
            pending with the Global Admins
          </span>
        )}
          {c.notes && (
            <span className="line-clamp-1 text-[0.72rem] text-text-tertiary">
              {c.notes}
            </span>
          )}
        </div>
      )}

      {rejecting && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason for rejection (optional, shared in the log)"
          className="w-full resize-y rounded-[10px] border border-danger/30 bg-danger-bg/40 px-2.5 py-1.5 text-[0.76rem] text-text-primary focus:outline-none focus:ring-2 focus:ring-danger/20"
        />
      )}

      {(!isListRow || rejecting) && (
        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-3">
        {rejecting ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={pending || !canAct}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-danger/30 bg-danger-bg px-3 py-1.5 text-[0.78rem] font-semibold text-danger-text transition-colors hover:brightness-95 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <X size={13} />
              )}
              Confirm reject
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={pending || !canAct}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-danger-text transition-colors hover:bg-danger-bg/40 disabled:opacity-60"
            >
              <X size={13} /> Reject
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={pending || !canAct}
              className="btn-primary-cta disabled:opacity-60"
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              Approve
            </button>
          </>
        )}
        </div>
      )}
    </article>
  );
}

/**
 * A pending budget version (V0 initial or a top-up) — the Global Admin queue.
 * Admins see the card read-only ("Global Admins decide budgets"); the three
 * budget approvers get Approve / Reject. Top-ups show the requester's reason.
 */
function BudgetApprovalCard({
  b,
  canAct,
  variant = "cards",
}: {
  b: BudgetApprovalItem;
  canAct: boolean;
  variant?: CardVariant;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // The split defaults open — a Global Admin should see what they're
  // sanctioning without an extra click.
  const [splitOpen, setSplitOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isListRow = variant === "list";
  const showBody = !isListRow || expanded;

  // Edit opens right here on Approvals — no /campaigns round-trip.
  const openEdit = async () => {
    setEditLoading(true);
    try {
      const res = await fetchCampaignForEdit(b.campaignId);
      if (!res) {
        toast.error(`Could not load ${b.campaignId} for editing.`);
        return;
      }
      setEditTarget(res);
    } finally {
      setEditLoading(false);
    }
  };

  const isInitial = b.versionNumber === 0;
  const monthText = b.month
    ? new Date(b.month + "T00:00:00Z").toLocaleString("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

  const approve = () =>
    start(async () => {
      const res = await approveBudgetVersion(b.versionId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        isInitial
          ? `${b.campaignId} V0 approved — the campaign can now be approved below.`
          : `${b.campaignId} V${b.versionNumber} approved — ${formatRupees(b.amount)} is live.`,
      );
      router.refresh();
    });

  const reject = () =>
    start(async () => {
      const res = await rejectBudgetVersion(b.versionId, reason);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        isInitial
          ? `${b.campaignId} V0 rejected — the campaign was rejected with it.`
          : `${b.campaignId} V${b.versionNumber} rejected.`,
      );
      router.refresh();
    });

  return (
    <article
      className={cn(
        "flex flex-col rounded-[14px] border border-border bg-bg-white shadow-[0_12px_30px_rgba(23,19,16,0.04)]",
        isListRow ? "gap-2 p-3" : "gap-3 p-4",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
          style={{ background: "#ECF1E9", color: "#4F7C4D" }}
        >
          <Wallet size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[0.95rem] font-bold text-text-primary">
              {b.campaignName ?? b.campaignId}
            </h3>
            <VersionChip
              n={b.versionNumber}
              kind={isInitial ? "initial" : "top_up"}
            />
            <span className="rounded-full bg-[#FAF1DC] px-2 py-0.5 text-[0.62rem] font-semibold text-[#B57514]">
              {isInitial ? "First budget (V0)" : "Top-up"}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-text-tertiary">
            <span className="font-mono">{b.campaignId}</span>
            {b.createdBy && <span>by {b.createdBy}</span>}
            {monthText && <span>{monthText}</span>}
            {b.createdAt && <span>{formatDate(b.createdAt)}</span>}
          </div>
        </div>
        {isListRow && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden text-[0.8rem] font-bold text-text-primary tabular-nums sm:inline">
              {formatRupees(b.amount)}
            </span>
            {canAct && !rejecting && (
              <RowActions
                pending={pending}
                approveLabel="Approve"
                onApprove={approve}
                onReject={() => setRejecting(true)}
              />
            )}
            <RowExpandButton
              open={expanded}
              onToggle={() => setExpanded((o) => !o)}
            />
          </div>
        )}
      </div>

      {showBody && b.reason && !isInitial && (
        <p className="rounded-[10px] border border-[#EADFC5] bg-[#FAF1DC]/60 px-2.5 py-2 text-[0.76rem] leading-relaxed text-text-secondary">
          <strong className="text-[#B57514]">Reason for increase:</strong>{" "}
          {b.reason}
        </p>
      )}

      {showBody && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric icon={Wallet} label="Amount" value={formatRupees(b.amount)} />
          <Metric
            icon={Users}
            label={isInitial ? "Creators" : "Adds creators"}
            value={String(b.numCreators)}
          />
          <Metric icon={Calendar} label="Month" value={monthText || "-"} />
        </div>
      )}

      {showBody && (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOverviewOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-bg-white px-2.5 py-1.5 text-[0.72rem] font-bold text-text-secondary hover:border-[#DCD6C4] hover:text-text-primary transition-colors"
        >
          <Eye size={12} aria-hidden /> Campaign Overview
        </button>
        {b.campaign?.briefLink ? (
          <a
            href={b.campaign.briefLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-bg-white px-2.5 py-1.5 text-[0.72rem] font-bold text-text-secondary hover:border-[#DCD6C4] hover:text-text-primary transition-colors"
          >
            <ExternalLink size={12} aria-hidden /> Campaign Brief
          </a>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-bg-surface px-2.5 py-1.5 text-[0.72rem] font-bold text-text-tertiary"
            title="No brief link on this campaign"
          >
            <ExternalLink size={12} aria-hidden /> No brief
          </span>
        )}
        {canAct && (
          <button
            type="button"
            onClick={() => void openEdit()}
            disabled={editLoading}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-bg-white px-2.5 py-1.5 text-[0.72rem] font-bold text-text-secondary hover:border-[#DCD6C4] hover:text-text-primary transition-colors disabled:opacity-60"
            title="Edit this campaign without leaving Approvals"
          >
            {editLoading ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <FilePenLine size={12} aria-hidden />
            )}
            Edit campaign
          </button>
        )}
      </div>
      )}

      {overviewOpen && (
        <BudgetCampaignOverviewModal
          b={b}
          onClose={() => setOverviewOpen(false)}
        />
      )}

      {editTarget && (
        <CampaignEditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onEdited={() => {
            setEditTarget(null);
            router.refresh();
          }}
        />
      )}

      {showBody && b.tierLines.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setSplitOpen((o) => !o)}
            className="inline-flex items-center gap-1 self-start text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary hover:text-text-primary"
            aria-expanded={splitOpen}
          >
            {splitOpen ? (
              <ChevronDown size={12} aria-hidden />
            ) : (
              <ChevronRight size={12} aria-hidden />
            )}
            Budget split · {b.tierLines.length} tier
            {b.tierLines.length > 1 ? "s" : ""}
          </button>
          {splitOpen && <TierLinesTable lines={b.tierLines} />}
        </div>
      )}

      {showBody && !canAct && (
        <span className="inline-flex items-center gap-1 self-start rounded-[9px] bg-[#F7F3EC] px-2.5 py-1.5 text-[0.72rem] font-semibold text-text-secondary">
          <Clock3 size={12} aria-hidden /> Only Global Admins can decide
          budgets
        </span>
      )}

      {canAct && rejecting && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason for rejection (sent back to the requester)"
          className="w-full resize-y rounded-[10px] border border-danger/30 bg-danger-bg/40 px-2.5 py-1.5 text-[0.76rem] text-text-primary focus:outline-none focus:ring-2 focus:ring-danger/20"
        />
      )}

      {canAct && (!isListRow || rejecting) && (
        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-3">
          {rejecting ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setRejecting(false);
                  setReason("");
                }}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-danger/30 bg-danger-bg px-3 py-1.5 text-[0.78rem] font-semibold text-danger-text transition-colors hover:brightness-95 disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <X size={13} />
                )}
                Confirm reject
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-danger-text transition-colors hover:bg-danger-bg/40 disabled:opacity-60"
              >
                <X size={13} /> Reject
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={pending}
                className="btn-primary-cta disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                Approve budget
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-border bg-bg-muted/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase text-text-tertiary">
        <Icon size={11} className="shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-[0.82rem] font-bold text-text-primary tabular-nums">
        {value}
      </div>
    </div>
  );
}

function OnboardingEditCard({
  e,
  variant = "cards",
}: {
  e: OnboardingEditItem;
  variant?: CardVariant;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);
  const isListRow = variant === "list";
  const showBody = !isListRow || expanded;

  const decide = (decision: "approve" | "reject") => {
    start(async () => {
      const res = await decideOnboardingEdit(
        e.id,
        decision,
        decision === "reject" ? note : undefined,
      );
      if (!res.ok) {
        toast.error(res.error ?? "Could not record the decision");
        return;
      }
      toast.success(
        decision === "approve"
          ? `${e.collabId} edit approved & applied — posting unblocked.`
          : `${e.collabId} edit rejected.`,
      );
      router.refresh();
    });
  };

  return (
    <div className="rounded-[14px] border border-border bg-bg-white p-3 flex flex-col gap-2.5 min-w-0">
      <header className="flex items-start gap-2.5">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "#F3EDFB", color: "#7B4FBF" }}
        >
          <FilePenLine size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <strong className="text-text-primary tabular truncate">
              {e.collabId}
            </strong>
            <span className="text-[0.6rem] text-text-tertiary whitespace-nowrap">
              {formatDate(e.createdAt) ?? ""}
            </span>
          </div>
          <div className="text-[0.66rem] text-text-secondary truncate">
            {e.creator ?? "—"}
            {e.requestedBy ? ` · by ${e.requestedBy}` : ""}
          </div>
        </div>
        {isListRow && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden rounded-full bg-[#F3EDFB] px-2 py-0.5 text-[0.62rem] font-semibold text-[#6F45B4] sm:inline">
              {e.changes.length} field{e.changes.length === 1 ? "" : "s"}
            </span>
            {!rejecting && (
              <RowActions
                pending={pending}
                approveLabel="Approve"
                onApprove={() => decide("approve")}
                onReject={() => setRejecting(true)}
              />
            )}
            <RowExpandButton
              open={expanded}
              onToggle={() => setExpanded((o) => !o)}
            />
          </div>
        )}
      </header>

      {showBody && e.reason && (
        <p className="text-[0.68rem] text-text-secondary italic">
          “{e.reason}”
        </p>
      )}

      {showBody && (
      <div className="overflow-x-auto">
        <table className="w-full text-[0.66rem] min-w-[300px]">
          <thead>
            <tr className="text-text-tertiary uppercase text-[0.5rem] font-extrabold border-b border-border">
              <th className="text-left pb-1 pr-2">Field</th>
              <th className="text-left pb-1 px-1.5">Before</th>
              <th className="text-left pb-1 pl-1.5">After</th>
            </tr>
          </thead>
          <tbody>
            {e.changes.map((c) => (
              <tr key={c.field} className="border-t border-border">
                <td className="py-1 pr-2 font-bold text-text-primary">
                  {c.label}
                </td>
                <td className="py-1 px-1.5 text-danger line-through">
                  {c.before || "—"}
                </td>
                <td className="py-1 pl-1.5 text-success font-semibold">
                  {c.after || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-2 border-t border-border pt-2.5">
          <textarea
            className="ob-input"
            rows={2}
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            placeholder="Reason for rejecting (optional)…"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center whitespace-nowrap h-9 px-3.5 rounded-full text-[0.74rem] font-bold text-text-secondary border border-border bg-bg-white hover:bg-bg-muted transition-colors"
              onClick={() => setRejecting(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 whitespace-nowrap h-9 px-3.5 rounded-full text-[0.74rem] font-bold transition-colors"
              style={{
                background: "var(--color-danger-bg)",
                color: "var(--color-danger-text)",
                border: "1px solid var(--color-danger-text)",
              }}
              onClick={() => decide("reject")}
              disabled={pending}
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin shrink-0" aria-hidden />
              ) : (
                <X size={13} className="shrink-0" aria-hidden />
              )}
              Confirm reject
            </button>
          </div>
        </div>
      ) : isListRow ? null : (
        <div className="flex items-center justify-end gap-2 border-t border-border pt-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 whitespace-nowrap h-9 px-3.5 rounded-full text-[0.74rem] font-bold text-text-secondary border border-border bg-bg-white hover:bg-bg-muted hover:text-danger-text transition-colors"
            onClick={() => setRejecting(true)}
            disabled={pending}
          >
            <X size={13} className="shrink-0" aria-hidden />
            Reject
          </button>
          <button
            type="button"
            className="btn-primary-cta inline-flex items-center gap-1.5 whitespace-nowrap h-9 px-4 text-[0.74rem]"
            onClick={() => decide("approve")}
            disabled={pending}
          >
            {pending ? (
              <Loader2 size={13} className="animate-spin shrink-0" aria-hidden />
            ) : (
              <Check size={13} className="shrink-0" aria-hidden />
            )}
            Approve &amp; apply
          </button>
        </div>
      )}
    </div>
  );
}

function ApprovalHistory({
  history,
  total,
}: {
  history: ApprovalHistoryItem[];
  total: number;
}) {
  const [visible, setVisible] = useState(10);
  const rows = history.slice(0, visible);

  return (
    <section className="mt-1">
      <div className="mb-2 flex items-center gap-2 text-[0.9rem] font-bold text-text-primary">
        <History size={15} className="text-text-tertiary" aria-hidden />
        <span>Approval History</span>
        <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-text-secondary">
          {total}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-bg-white px-4 py-8 text-center text-sm text-text-tertiary">
          No approval history yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-white">
          <div className="divide-y divide-border">
            {rows.map((item) => (
              <HistoryRow key={`${item.id}-${item.entityId}`} item={item} />
            ))}
          </div>
        </div>
      )}

      {visible < history.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + 10)}
          className="mt-2 rounded-[10px] border border-border bg-bg-white px-3 py-2 text-[0.8rem] font-semibold text-text-secondary transition-colors hover:bg-bg-muted"
        >
          Show more ({history.length - visible} remaining)
        </button>
      )}
    </section>
  );
}

function HistoryRow({ item }: { item: ApprovalHistoryItem }) {
  const style = historyBadgeStyles[item.status] ?? historyBadgeStyles.other;
  const isEdit = item.actionType.toLowerCase().includes("edit");
  const typeTone = isEdit
    ? "bg-[#EAF6EF] text-[#3F7B51]"
    : "bg-[#ECF1FB] text-[#3B6FD4]";
  const [detail, setDetail] = useState<ApprovalHistoryDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Every entry opens the detail popup. When no richer stored record exists
  // (e.g. a straight campaign approval with no edit request), the popup shows
  // the log row's own facts instead of a dead-end toast.
  const fallbackDetail = (): ApprovalHistoryDetail => ({
    kind: "log_entry",
    entityId: item.entityId,
    status: item.action ?? item.status ?? null,
    requestedBy: null,
    decidedBy: item.actor ?? null,
    reason: item.notes ?? null,
    changes: [
      { label: "Type", before: null, after: item.actionType },
      { label: "Action", before: null, after: item.action },
      ...(item.at
        ? [{ label: "When", before: null, after: formatDate(item.at) ?? "" }]
        : []),
    ],
  });
  const openDetail = () => {
    setLoading(true);
    getApprovalHistoryDetail({
      actionType: item.actionType,
      entityId: item.entityId,
    }).then((res) => {
      setLoading(false);
      setDetail(res.ok ? res.detail : fallbackDetail());
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={openDetail}
        className="grid w-full grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-left text-[0.78rem] text-text-secondary transition-colors hover:bg-bg-muted/50"
        title="View details"
      >
        <span
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-bold",
            style,
          )}
        >
          {item.status === "approved" ? <Check size={11} /> : null}
          {item.status === "rejected" ? <X size={11} /> : null}
          {item.action}
        </span>
        <span
          className={cn(
            "hidden rounded-full px-2 py-1 text-[0.66rem] font-bold uppercase sm:inline-flex",
            typeTone,
          )}
        >
          {item.actionType}
        </span>
        <div className="min-w-0">
          <span className="font-mono font-semibold text-text-primary">
            {item.entityId || "-"}
          </span>
          <span className="ml-2 text-text-tertiary">by {item.actor}</span>
          {item.notes && (
            <span className="ml-2 hidden truncate italic text-text-tertiary lg:inline">
              {item.notes}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap text-right text-text-tertiary">
          <span>{formatDate(item.at)}</span>
          {loading ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <Eye size={13} aria-hidden />
          )}
        </div>
      </button>
      {detail && (
        <HistoryDetailModal detail={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

function BudgetCampaignOverviewModal({
  b,
  onClose,
}: {
  b: BudgetApprovalItem;
  onClose: () => void;
}) {
  const c = b.campaign;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[0.78rem] last:border-b-0">
      <span className="shrink-0 text-[0.66rem] font-extrabold uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </span>
      <span className="min-w-0 text-right font-semibold text-text-primary [overflow-wrap:anywhere]">
        {value ?? "—"}
      </span>
    </div>
  );
  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Campaign overview — ${b.campaignId}`}
      style={{ zIndex: 1500 }}
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--onboarding flex flex-col"
        style={{ maxWidth: 560, width: "94vw", maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold">
              {b.campaignName ?? b.campaignId}
            </h2>
            <p className="text-[0.66rem] text-text-secondary">
              {b.campaignId}
              {c?.status ? ` · ${c.status}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>
        <div className="modal-body flex-1 overflow-y-auto">
          {c ? (
            <>
              {c.keyMessage && (
                <p className="mb-3 rounded-[10px] border border-border bg-bg-surface px-3 py-2 text-[0.78rem] leading-relaxed text-text-secondary">
                  {c.keyMessage}
                </p>
              )}
              {row("Total budget", c.totalBudget != null ? formatRupees(c.totalBudget) : "—")}
              {row("Creators", c.creators ?? "—")}
              {row("Start date", c.startDate ? formatDate(c.startDate) : "—")}
              {row("End date", c.endDate ? formatDate(c.endDate) : "—")}
              {row("Created by", c.createdBy ?? "—")}
              {row(
                "Brief",
                c.briefLink ? (
                  <a
                    href={c.briefLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#3B6FD4] underline"
                  >
                    Open brief
                  </a>
                ) : (
                  "—"
                ),
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-text-tertiary">
              Campaign details could not be loaded.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function HistoryDetailModal({
  detail,
  onClose,
}: {
  detail: ApprovalHistoryDetail;
  onClose: () => void;
}) {
  // Portal to <body> — required. Rendered in-tree, the fixed backdrop is
  // trapped by `.onboarding-stage`'s persistent transform (rise animation
  // keeps a stacking context), so it painted BELOW the sidebar.
  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Approval detail — ${detail.entityId}`}
      style={{ zIndex: 1500 }}
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--onboarding flex flex-col"
        style={{ maxWidth: 560, width: "94vw", maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold">
              {detail.kind === "onboarding_edit"
                ? "Onboarding Edit"
                : detail.kind === "campaign_edit"
                  ? "Campaign Edit"
                  : detail.kind === "budget"
                    ? "Budget Version"
                    : "Approval Entry"}{" "}
              — {detail.entityId}
            </h2>
            <p className="text-[0.66rem] text-text-secondary">
              {detail.status ?? ""}
              {detail.requestedBy ? ` · requested by ${detail.requestedBy}` : ""}
              {detail.decidedBy ? ` · decided by ${detail.decidedBy}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>
        <div className="modal-body flex-1 overflow-y-auto">
          {detail.reason && (
            <p className="mb-3 text-[0.74rem] italic text-text-secondary">
              “{detail.reason}”
            </p>
          )}
          {detail.changes.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">
              No field changes recorded.
            </p>
          ) : (
            <table className="w-full text-[0.74rem]">
              <thead>
                <tr className="border-b border-border text-[0.56rem] font-extrabold uppercase text-text-tertiary">
                  <th className="pb-1.5 pr-2 text-left">Field</th>
                  <th className="px-1.5 pb-1.5 text-left">Before</th>
                  <th className="pb-1.5 pl-1.5 text-left">After</th>
                </tr>
              </thead>
              <tbody>
                {detail.changes.map((c) => (
                  <tr key={c.label} className="border-t border-border">
                    <td className="py-1.5 pr-2 font-bold text-text-primary">
                      {c.label}
                    </td>
                    <td className="px-1.5 py-1.5 text-danger-text line-through">
                      {c.before ?? "—"}
                    </td>
                    <td className="py-1.5 pl-1.5 font-semibold text-[#2E7145]">
                      {c.after || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const historyBadgeStyles: Record<ApprovalHistoryStatus, string> = {
  approved: "bg-[#EAF6EF] text-[#2E7145]",
  rejected: "bg-danger-bg text-danger-text",
  submitted: "bg-[#FAF1DC] text-[#A86B0C]",
  closed: "bg-[#F0EDE8] text-text-secondary",
  reopened: "bg-[#ECF1FB] text-[#3B6FD4]",
  other: "bg-bg-muted text-text-secondary",
};
