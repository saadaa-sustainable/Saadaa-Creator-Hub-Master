"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  ExternalLink,
  Inbox,
  Loader2,
  Megaphone,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import { approveCampaign, rejectCampaign } from "@/features/campaigns/actions";
import type { ApprovalItem, ApprovalQueueData } from "./queries";

export function ApprovalsBody({ data }: { data: ApprovalQueueData }) {
  const totalBudget = data.items.reduce((s, i) => s + (i.budget ?? 0), 0);
  const totalCreators = data.items.reduce((s, i) => s + (i.creators ?? 0), 0);

  const tiles = [
    { label: "Awaiting approval", value: String(data.total), icon: ShieldCheck, color: "#B57514", bg: "#FAF1DC" },
    { label: "Campaigns", value: String(data.total), icon: Megaphone, color: "#3B6FD4", bg: "#ECF1FB" },
    { label: "Σ Budget", value: formatRupees(totalBudget), icon: Wallet, color: "#4F7C4D", bg: "#ECF1E9" },
    { label: "Σ Creators", value: String(totalCreators), icon: Users, color: "#7B4FBF", bg: "#F3EDFB" },
  ];

  return (
    <div className="flex flex-col gap-4 min-w-0">
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
              <div className="text-[1.05rem] font-bold leading-none tabular text-text-primary">
                {t.value}
              </div>
              <div className="mt-1 truncate text-[0.72rem] text-text-secondary">
                {t.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-bg-white py-16 text-center text-text-tertiary">
          <Inbox size={28} aria-hidden />
          <p className="font-medium text-text-primary">Nothing awaiting approval</p>
          <p className="text-sm">New campaigns land here for sign-off before they go live.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.items.map((c) => (
            <ApprovalCard key={c.campaignId} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ c }: { c: ApprovalItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const approve = () => {
    start(async () => {
      const res = await approveCampaign(c.campaignId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${c.campaignId} approved — now live.`);
      router.refresh();
    });
  };

  const reject = () => {
    start(async () => {
      const res = await rejectCampaign(c.campaignId, reason);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${c.campaignId} rejected.`);
      router.refresh();
    });
  };

  return (
    <article className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-bg-white p-3.5">
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "#ECF1FB", color: "#3B6FD4" }}
        >
          <Megaphone size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[0.9rem] font-bold text-text-primary">
              {c.campaignName ?? c.campaignId}
            </h3>
            <span className="rounded-full bg-[#FAF1DC] px-2 py-0.5 text-[0.62rem] font-semibold text-[#B57514]">
              Pending
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] text-text-tertiary">
            <span className="font-mono">{c.campaignId}</span>
            {c.createdBy && <span>· by {c.createdBy}</span>}
            {c.createdAt && <span>· {formatDate(c.createdAt)}</span>}
          </div>
        </div>
      </div>

      {c.keyMessage && (
        <p className="line-clamp-2 text-[0.78rem] leading-relaxed text-text-secondary">
          {c.keyMessage}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.72rem]">
        <Meta icon={Wallet} label="Budget" value={c.budget != null ? formatRupees(c.budget) : "—"} />
        <Meta icon={Users} label="Creators" value={c.creators != null ? String(c.creators) : "—"} />
        <Meta icon={Calendar} label="Start" value={formatDate(c.startDate)} />
        <Meta icon={Calendar} label="End" value={formatDate(c.endDate)} />
      </dl>

      {c.briefLink && /^https?:\/\//i.test(c.briefLink) && (
        <a
          href={c.briefLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-[0.72rem] font-semibold text-[#3B6FD4] hover:underline"
        >
          <ExternalLink size={11} aria-hidden /> Campaign brief
        </a>
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

      <div className="mt-0.5 flex items-center justify-end gap-2">
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
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-danger/30 bg-danger-bg px-3 py-1.5 text-[0.78rem] font-semibold text-danger-text transition-colors hover:brightness-95"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              Confirm reject
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-danger-text transition-colors hover:bg-danger-bg/40"
            >
              <X size={13} /> Reject
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={pending}
              className="btn-primary-cta"
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
    </article>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={12} className="shrink-0 text-text-tertiary" aria-hidden />
      <span className="text-text-tertiary">{label}</span>
      <span className={cn("ml-auto font-semibold tabular text-text-primary")}>
        {value}
      </span>
    </div>
  );
}
