"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  Crown,
  Eye,
  Instagram,
  Loader2,
  Send,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/cn";
import { isPaymentPendingStatus } from "@/lib/payment-eligibility";
import {
  formatDate,
  formatFollowers,
  formatRupees,
  workflowStatusLabel,
} from "@/lib/formatters";
import { todayIstIso } from "@/lib/payable-cycle";
import { submitPayments } from "@/features/accounts-hub/actions";
import { AccountsOverviewModal } from "@/features/accounts-hub/accounts-overview-modal";
import { OrderCreationModal } from "@/features/onboarding/order-form";
import { PostingModal } from "@/features/posting/posting-form";
import { MyCardOverviewModal } from "./card-overview-modal";
import type { MyPost, TeamLeaderboardEntry } from "./types";

type StageKey = "reach-out" | "on-board" | "posted" | "payment";

interface StageDef {
  key: StageKey;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  dot: string;
  body: string;
  band: string;
}

const STAGES: StageDef[] = [
  {
    key: "reach-out",
    title: "Reach Out",
    subtitle: "ready for onboarding",
    icon: Send,
    dot: "bg-[#3B6FD4]",
    body: "bg-[#EAF1FB]/55",
    band: "bg-gradient-to-r from-[#3B6FD4] to-[#5C8DE5]",
  },
  {
    key: "on-board",
    title: "Onboard",
    subtitle: "waiting for post",
    icon: UserCheck,
    dot: "bg-[#7B4FBF]",
    body: "bg-[#F1EAFB]/55",
    band: "bg-gradient-to-r from-[#7B4FBF] to-[#9970D3]",
  },
  {
    key: "posted",
    title: "Posted",
    subtitle: "verify links",
    icon: Instagram,
    dot: "bg-success",
    body: "bg-success-bg/55",
    band: "bg-gradient-to-r from-success to-[#6E9F6C]",
  },
  {
    key: "payment",
    title: "Payment",
    subtitle: "log payout",
    icon: Banknote,
    dot: "bg-warning",
    body: "bg-warning-bg/50",
    band: "bg-gradient-to-r from-warning to-[#D19432]",
  },
];

function stagesForPost(post: MyPost): StageKey[] {
  const status = post.workflow_status ?? "";
  if (status === "Reach Out") return ["reach-out"];
  if (status === "On Board" || status === "Order Sent") return ["on-board"];
  if (status === "Posted" || status === "Delivered") {
    const isParent =
      post.deliverable_index === null || post.deliverable_index === 1;
    const paymentStatus = (post.payment_status ?? "").trim().toLowerCase();
    const paymentTracked =
      isPaymentPendingStatus(paymentStatus) ||
      paymentStatus === "done" ||
      paymentStatus === "paid";
    // Pure-Barter collabs carry no cash payment — never in the Payment column.
    const isPureBarter =
      (post.collab_type ?? "").trim().toLowerCase() === "barter";
    // Posted column: all deliverables (parent + child).
    // Payment column: parent only, after eligibility created a ledger state.
    return isParent && paymentTracked && !isPureBarter
      ? ["posted", "payment"]
      : ["posted"];
  }
  return [];
}

function paymentPending(post: MyPost): boolean {
  const isParent =
    post.deliverable_index == null || Number(post.deliverable_index) === 1;
  return (
    isParent &&
    (post.collab_type ?? "").trim().toLowerCase() !== "barter" &&
    (post.workflow_status === "Posted" ||
      post.workflow_status === "Delivered") &&
    isPaymentPendingStatus(post.payment_status)
  );
}

function compactId(post: MyPost): string {
  return post.post_id_short ?? post.post_id ?? "—";
}

// Collab ID groups all deliverables of one collaboration. A collab exists only
// once an order is mapped (onboarding); reach-out rows (NULL collab_number) have
// no collab id, never a fabricated "-C1".
function collabId(post: MyPost): string | null {
  return (
    post.collab_id ??
    (post.inf_id && post.collab_number != null
      ? `${post.inf_id}-C${Number(post.collab_number)}`
      : null)
  );
}

function creatorName(post: MyPost): string {
  return post.creator?.inf_name ?? post.inf_name ?? post.username ?? "Creator";
}

function postingComplete(post: MyPost): boolean {
  return Boolean((post.post_link ?? "").trim() || post.post_date);
}

function MyDashboardInsights({ posts }: { posts: MyPost[] }) {
  const stats = useMemo(() => {
    const total = posts.length;
    const posted = posts.filter((p) =>
      ["Posted", "Delivered"].includes(p.workflow_status ?? ""),
    ).length;
    const pendingPay = new Set(
      posts
        .filter(paymentPending)
        .map((post) => collabId(post) ?? post.post_id ?? ""),
    ).size;
    const overdue = posts.filter((p) => {
      if (
        !p.est_delivery ||
        !["On Board", "Order Sent"].includes(p.workflow_status ?? "")
      ) {
        return false;
      }
      const delivery = new Date(p.est_delivery);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      delivery.setHours(0, 0, 0, 0);
      return delivery < today;
    }).length;
    return {
      total,
      posted,
      pendingPay,
      overdue,
      completion: total ? Math.round((posted / total) * 100) : 0,
    };
  }, [posts]);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-2.5 sm:gap-3 min-w-0">
      <article className="bento-tile rounded-2xl border border-border bg-bg-white p-3 sm:p-4 flex flex-col gap-3 sm:gap-4 min-w-0 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5">
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
                My workload
              </p>
              <InfoTooltip
                title="My workload"
                content="All collabs assigned to you in the current filter scope. Posted percentage is posted or delivered work divided by your total assigned work."
              />
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-text-primary tabular leading-none">
              {stats.total}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-success-bg text-success px-2 py-0.5 sm:py-1 text-[0.58rem] sm:text-[0.64rem] font-extrabold">
            <CheckCircle2 size={12} aria-hidden />
            {stats.completion}% posted
          </span>
        </div>
        <div className="h-2.5 sm:h-3 rounded-full bg-bg-muted overflow-hidden">
          <div
            className="bento-bar h-full rounded-full bg-success transition-all"
            style={{ width: `${stats.completion}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MiniStat
            label="Posted"
            value={stats.posted}
            tone="text-success"
            info="Your assigned deliverables whose posting form is complete or whose order is delivered."
          />
          <MiniStat
            label="Pay pending"
            value={stats.pendingPay}
            tone="text-warning"
            info="Your assigned payment-ready collabs whose posting forms are all complete and whose creator accepted the partnership, but settlement is still open."
          />
          <MiniStat
            label="Overdue"
            value={stats.overdue}
            tone="text-danger"
            info="Your assigned onboarded work whose expected delivery date has passed without a completed posting form."
          />
        </div>
      </article>
      <article className="bento-tile rounded-2xl border border-border bg-bg-white p-3 sm:p-4 min-w-0 overflow-hidden">
        <div className="mb-2.5 inline-flex items-center gap-1.5 sm:mb-3">
          <p className="text-[0.58rem] sm:text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
            Stage mix
          </p>
          <InfoTooltip
            title="Stage mix"
            content="How your assigned collabs are distributed across Reach Out, On Board, Posted, and Payment. A collab may appear in more than one action bucket when it has separate pending work."
          />
        </div>
        <div className="space-y-2.5 sm:space-y-3">
          {STAGES.map((stage) => {
            const count = posts.filter((post) =>
              stagesForPost(post).includes(stage.key),
            ).length;
            const pct = stats.total
              ? Math.round((count / stats.total) * 100)
              : 0;
            return (
              <div
                key={stage.key}
                className="grid grid-cols-[78px_minmax(0,1fr)_24px] sm:grid-cols-[92px_minmax(0,1fr)_34px] items-center gap-2 text-[0.66rem] sm:text-[0.7rem] min-w-0"
              >
                <span className="font-bold text-text-secondary truncate">
                  {stage.title}
                </span>
                <span className="h-2 rounded-full bg-bg-muted overflow-hidden">
                  <span
                    className={cn(
                      "bento-bar block h-full rounded-full",
                      stage.dot,
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="tabular text-right font-extrabold text-text-primary">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function TeamLeaderboard({ entries }: { entries: TeamLeaderboardEntry[] }) {
  if (entries.length === 0) return null;
  const bestScore = Math.max(...entries.map((entry) => entry.score), 1);
  return (
    <article className="bento-tile rounded-2xl border border-border bg-bg-white p-3 sm:p-4 min-w-0 overflow-hidden">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="inline-flex items-center gap-1.5">
            <p className="text-[0.58rem] sm:text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
              Team leaderboard
            </p>
            <InfoTooltip
              title="Team leaderboard"
              content="Ranks team members by this week's workflow score. Posted and paid work increase the score; the bar compares each score with the current leader."
            />
          </div>
          <h2 className="text-base sm:text-lg font-extrabold text-text-primary">
            This week&apos;s movers
          </h2>
        </div>
        <span className="inline-flex items-center justify-center rounded-xl bg-warning-bg text-warning w-8 h-8 sm:w-9 sm:h-9">
          <Crown size={15} aria-hidden />
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 bento-stagger">
        {entries.map((entry, index) => (
          <div
            key={entry.name}
            className="rounded-xl border border-border bg-bg-muted/45 p-2.5 sm:p-3 min-w-0 overflow-hidden transition-[transform,border-color] duration-150 hover:border-accent/45 motion-safe:hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.62rem] font-extrabold text-text-tertiary tabular">
                #{index + 1}
              </span>
              <ChartNoAxesColumnIncreasing
                size={13}
                aria-hidden
                className="text-text-tertiary"
              />
            </div>
            <div className="mt-1 font-extrabold text-text-primary truncate">
              {entry.name}
            </div>
            <div className="mt-2 h-2 rounded-full bg-bg-white overflow-hidden">
              <div
                className="bento-bar h-full rounded-full bg-accent"
                style={{
                  width: `${Math.max(8, (entry.score / bestScore) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-2 text-[0.58rem] font-bold text-text-secondary tabular">
              {entry.posted} posted · {entry.paid} paid
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function MiniStat({
  label,
  value,
  tone,
  info,
}: {
  label: string;
  value: number;
  tone: string;
  info: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-muted/45 p-2.5 sm:p-3 min-w-0">
      <div
        className={cn(
          "text-base sm:text-lg font-extrabold tabular leading-none",
          tone,
        )}
      >
        {value}
      </div>
      <div className="mt-1 inline-flex items-center gap-1 text-[0.5rem] sm:text-[0.54rem] uppercase tracking-[0.07em] font-extrabold text-text-tertiary">
        {label}
        <InfoTooltip title={label} content={info} />
      </div>
    </div>
  );
}

function WorkloadCard({
  post,
  stage,
  onSubmit,
  onOverview,
}: {
  post: MyPost;
  stage: StageDef;
  onSubmit: (post: MyPost, stage: StageDef) => void;
  onOverview: (post: MyPost, stage: StageDef) => void;
}) {
  const Icon = stage.icon;
  // Payment column is read-only here — submissions belong to Accounts Hub.
  // Clicking opens the AccountsOverviewModal for the parent + its siblings.
  const isPayment = stage.key === "payment";
  const canSubmit =
    stage.key === "reach-out" ||
    isPayment ||
    (stage.key === "on-board" && !postingComplete(post));
  const actionText = isPayment
    ? "Overview"
    : stage.key === "posted" ||
        (stage.key === "on-board" && postingComplete(post))
      ? "Completed"
      : "Submit";
  const ButtonIcon = isPayment ? Eye : CheckCircle2;
  return (
    // Hover lift mirrors .bento-tile's feel via utilities only — the entrance
    // animation lives on the column container (one-shot window) so cards that
    // remount on a filter change never replay it.
    <article className="rounded-xl bg-bg-white border border-border p-2 sm:p-2.5 flex flex-col gap-1.5 sm:gap-2 shadow-[0_1px_3px_rgba(22,21,19,0.05)] min-w-0 transition-[transform,box-shadow,border-color] duration-150 hover:border-accent/45 hover:shadow-[0_12px_32px_-16px_rgba(22,21,19,0.2)] motion-safe:hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[0.55rem] font-extrabold uppercase tracking-[0.05em] rounded-full px-1.5 py-0.5 bg-bg-muted text-text-secondary whitespace-nowrap">
          <Icon size={8} aria-hidden />
          {post.workflow_status
            ? workflowStatusLabel(post.workflow_status)
            : stage.title}
        </span>
        {post.payment_status && (
          <span className="text-[0.55rem] font-extrabold rounded-full px-1.5 py-0.5 bg-warning-bg text-warning">
            {post.payment_status}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Avatar
          src={post.creator?.profile_pic ?? null}
          username={post.username}
          name={creatorName(post)}
          size={28}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[0.82rem] font-extrabold text-text-primary leading-tight truncate">
            {creatorName(post)}
          </div>
          <div className="text-[0.62rem] text-text-tertiary truncate leading-tight">
            @{post.username ?? "—"} · {formatFollowers(post.creator?.followers)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="pill text-[0.55rem] py-0.5 px-1.5 tabular">
          {compactId(post)}
        </span>
        {collabId(post) && (
          <span
            className="pill text-[0.55rem] py-0.5 px-1.5 tabular"
            title="Collab ID"
          >
            {collabId(post)}
          </span>
        )}
        {post.creator?.category && (
          <span className="pill pill--info text-[0.55rem] py-0.5 px-1.5">
            {post.creator.category}
          </span>
        )}
        {post.campaign_id && (
          <span className="pill text-[0.55rem] py-0.5 px-1.5">
            {post.campaign_id}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-y-0.5 gap-x-2 text-[0.62rem]">
        <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em]">
          Date
        </dt>
        <dd className="text-right tabular text-text-secondary truncate">
          {formatDate(
            post.post_date ?? post.reach_out_date ?? post.onboard_date,
          )}
        </dd>
        <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em]">
          Amount
        </dt>
        <dd className="text-right tabular font-bold text-text-primary truncate">
          {formatRupees(post.commercial_amount)}
        </dd>
      </dl>

      <div className="mt-1 flex items-center gap-1.5">
        {/* Overview — the full submitted-form info for this card's stage
            (creator + reach-out + onboarding + posting sections by data).
            Payment cards keep their single Overview action (Accounts modal). */}
        {!isPayment && (
          <button
            type="button"
            className="h-8 px-2.5 text-[0.7rem] rounded-lg inline-flex items-center justify-center gap-1 border border-border bg-bg-white font-extrabold text-text-secondary transition hover:border-accent/45 hover:text-text-primary"
            onClick={() => onOverview(post, stage)}
          >
            <Eye size={12} aria-hidden />
            Overview
          </button>
        )}
        <button
          type="button"
          className={cn(
            "flex-1 h-8 text-[0.7rem] rounded-lg inline-flex items-center justify-center gap-1 border font-extrabold transition",
            canSubmit
              ? "border-[#b8d4f8] bg-[#eef6ff] text-[#2f67c8] hover:bg-[#e4f0ff]"
              : "border-border bg-bg-muted text-text-tertiary cursor-default",
          )}
          onClick={() => {
            if (canSubmit) onSubmit(post, stage);
          }}
          disabled={!canSubmit}
        >
          <ButtonIcon size={12} aria-hidden />
          {actionText}
        </button>
      </div>
    </article>
  );
}

/**
 * Grouped Onboard card — same rule as the Posting stage: when a collab has
 * MORE than one deliverable (stories never spawn rows), the deliverables
 * combine into ONE card with a per-deliverable pending/submitted list, each
 * pending row opening its own posting form. Single-deliverable collabs keep
 * the normal card.
 */
function CollabWorkloadCard({
  group,
  stage,
  onSubmit,
  onOverview,
}: {
  group: MyPost[];
  stage: StageDef;
  onSubmit: (post: MyPost, stage: StageDef) => void;
  onOverview: (post: MyPost, stage: StageDef) => void;
}) {
  const rep = group[0];
  const submitted = group.filter(postingComplete).length;
  const allDone = submitted === group.length;
  return (
    <article className="rounded-xl bg-bg-white border border-border p-2 sm:p-2.5 flex flex-col gap-1.5 sm:gap-2 shadow-[0_1px_3px_rgba(22,21,19,0.05)] min-w-0 transition-[transform,box-shadow,border-color] duration-150 hover:border-accent/45 hover:shadow-[0_12px_32px_-16px_rgba(22,21,19,0.2)] motion-safe:hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[0.55rem] font-extrabold uppercase tracking-[0.05em] rounded-full px-1.5 py-0.5 bg-bg-muted text-text-secondary whitespace-nowrap">
          <stage.icon size={8} aria-hidden />
          {rep.workflow_status
            ? workflowStatusLabel(rep.workflow_status)
            : stage.title}
        </span>
        <span
          className={cn(
            "text-[0.55rem] font-extrabold rounded-full px-1.5 py-0.5",
            allDone ? "bg-success-bg text-success" : "bg-warning-bg text-warning",
          )}
        >
          {submitted}/{group.length} submitted
        </span>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Avatar
          src={rep.creator?.profile_pic ?? null}
          username={rep.username}
          name={creatorName(rep)}
          size={28}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[0.82rem] font-extrabold text-text-primary leading-tight truncate">
            {creatorName(rep)}
          </div>
          <div className="text-[0.62rem] text-text-tertiary truncate leading-tight">
            @{rep.username ?? "—"} · {formatFollowers(rep.creator?.followers)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {collabId(rep) && (
          <span
            className="pill text-[0.55rem] py-0.5 px-1.5 tabular"
            title="Collab ID"
          >
            {collabId(rep)}
          </span>
        )}
        <span className="pill pill--info text-[0.55rem] py-0.5 px-1.5">
          {group.length} deliverables
        </span>
        {rep.campaign_id && (
          <span className="pill text-[0.55rem] py-0.5 px-1.5">
            {rep.campaign_id}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {group.map((p) => {
          const done = postingComplete(p);
          return (
            <div
              key={p.post_id ?? ""}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-surface/60 px-2 py-1"
            >
              <span className="text-[0.64rem] font-bold tabular text-text-primary truncate">
                P{p.deliverable_index ?? "?"}
                {p.deliverable_type ? (
                  <span className="ml-1 font-normal text-text-tertiary">
                    {p.deliverable_type}
                  </span>
                ) : null}
              </span>
              {done ? (
                <span className="inline-flex items-center gap-1 text-[0.58rem] font-extrabold text-success">
                  <CheckCircle2 size={11} aria-hidden /> Submitted
                </span>
              ) : (
                <button
                  type="button"
                  className="h-6 px-2 text-[0.6rem] rounded-md inline-flex items-center gap-1 border border-[#b8d4f8] bg-[#eef6ff] font-extrabold text-[#2f67c8] transition hover:bg-[#e4f0ff]"
                  onClick={() => onSubmit(p, stage)}
                >
                  <CheckCircle2 size={10} aria-hidden /> Submit
                </button>
              )}
            </div>
          );
        })}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-y-0.5 gap-x-2 text-[0.62rem]">
        <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em]">
          Amount
        </dt>
        <dd className="text-right tabular font-bold text-text-primary truncate">
          {formatRupees(rep.commercial_amount)}
        </dd>
      </dl>

      <button
        type="button"
        className="mt-0.5 w-full h-8 text-[0.7rem] rounded-lg inline-flex items-center justify-center gap-1 border border-border bg-bg-white font-extrabold text-text-secondary transition hover:border-accent/45 hover:text-text-primary"
        onClick={() => onOverview(rep, stage)}
      >
        <Eye size={12} aria-hidden />
        Overview
      </button>
    </article>
  );
}

function PaymentQuickModal({
  post,
  onClose,
}: {
  post: MyPost;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(post.commercial_amount ?? ""));
  const [utr, setUtr] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIstIso());

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const res = await submitPayments({
        rows: [
          {
            postId: post.post_id,
            utr,
            paymentDate,
            amount: Number(amount),
          },
        ],
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${compactId(post)} payment submitted.`);
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="modal-backdrop modal-backdrop--onboarding">
      <form
        onSubmit={onSubmit}
        className="modal-panel max-w-[430px] rounded-2xl bg-bg-white border border-border shadow-xl"
      >
        <header className="modal-head">
          <div>
            <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-text-tertiary">
              Submit payment
            </div>
            <h2 className="text-xl font-extrabold text-text-primary">
              {compactId(post)}
              {collabId(post) && (
                <span
                  className="ml-2 text-[0.7rem] font-bold text-text-tertiary"
                  title="Collab ID — groups all deliverables of this collaboration"
                >
                  · {collabId(post)}
                </span>
              )}
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="p-4 grid gap-3">
          <label className="onboarding-filter-field">
            <span>Payment date</span>
            <input
              type="date"
              className="onboarding-filter-select"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </label>
          <label className="onboarding-filter-field">
            <span>Amount</span>
            <input
              type="number"
              min="1"
              className="onboarding-filter-select"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="onboarding-filter-field">
            <span>UTR / reference</span>
            <input
              className="onboarding-filter-select"
              value={utr}
              onChange={(event) => setUtr(event.target.value)}
              placeholder="Bank reference"
            />
          </label>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Banknote size={14} />
            )}
            Submit
          </button>
        </footer>
      </form>
    </div>
  );
}

export function MyDashboardWorkloadBoard({
  posts,
  allPosts,
  leaderboard,
}: {
  posts: MyPost[];
  /** Unfiltered set — sibling scans (bank gate, overview deliverable list)
   *  must see the whole collab even when filters hide some rows. */
  allPosts?: MyPost[];
  leaderboard: TeamLeaderboardEntry[];
}) {
  const router = useRouter();
  const [onboardingPost, setOnboardingPost] = useState<MyPost | null>(null);
  const [postingPost, setPostingPost] = useState<MyPost | null>(null);
  const [paymentPost, setPaymentPost] = useState<MyPost | null>(null);
  const [overviewPost, setOverviewPost] = useState<MyPost | null>(null);
  const fullSet = allPosts ?? posts;

  // Collab-level bank gate — same rule as the Posting stage: a Barter + Paid
  // collab whose onboarding skipped bank details makes the posting form
  // demand them, and bank on ANY deliverable of the collab satisfies all.
  const requireBankFor = (post: MyPost): boolean => {
    if (
      String(post.collab_type ?? "")
        .trim()
        .toLowerCase() !== "barter + paid"
    )
      return false;
    const key = collabId(post);
    if (!key) return false;
    return !fullSet.some(
      (p) =>
        collabId(p) === key &&
        String(p.bank_number ?? "").trim() &&
        String(p.ifsc ?? "").trim(),
    );
  };

  // One-shot entrance window: `.bento-stagger` sits on the column lists only
  // during the initial mount choreography (max delay 0.4s + 0.42s run), then
  // comes off so cards remounting after a filter change never re-animate.
  const [entranceDone, setEntranceDone] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setEntranceDone(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  // Render pagination per column — a member can hold hundreds of reach-outs;
  // mounting them all at once freezes slower machines. 30 first, +50 per click.
  const RENDER_PAGE = 30;
  const [visibleByStage, setVisibleByStage] = useState<
    Partial<Record<StageKey, number>>
  >({});
  useEffect(() => {
    setVisibleByStage({});
  }, [posts]);
  const visibleFor = (key: StageKey) => visibleByStage[key] ?? RENDER_PAGE;
  const showMore = (key: StageKey) =>
    setVisibleByStage((prev) => ({
      ...prev,
      [key]: (prev[key] ?? RENDER_PAGE) + 50,
    }));

  const grouped = useMemo(() => {
    const map = new Map<StageKey, MyPost[]>();
    for (const stage of STAGES) map.set(stage.key, []);
    for (const post of posts) {
      for (const key of stagesForPost(post)) {
        map.get(key)?.push(post);
      }
    }
    return map;
  }, [posts]);

  const handleSubmit = (post: MyPost, stage: StageDef) => {
    if (stage.key === "reach-out") {
      setOnboardingPost(post);
    } else if (stage.key === "payment") {
      setPaymentPost(post);
    } else {
      setPostingPost(post);
    }
  };

  const handleOverview = (post: MyPost) => setOverviewPost(post);

  // Onboard column groups by Collab ID when a collab has >1 deliverable —
  // mirrors the Posting stage's grouped view. Other columns stay per-row.
  const onboardGroups = useMemo(() => {
    const items = grouped.get("on-board") ?? [];
    const map = new Map<string, MyPost[]>();
    for (const p of items) {
      const key = collabId(p) ?? p.post_id ?? `${p.username}`;
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return [...map.values()].map((g) =>
      g.sort((a, b) =>
        String(a.post_id ?? "").localeCompare(String(b.post_id ?? "")),
      ),
    );
  }, [grouped]);

  return (
    <>
      <MyDashboardInsights posts={posts} />
      <TeamLeaderboard entries={leaderboard} />
      <article className="bento-tile rounded-2xl bg-bg-white border border-border p-2.5 sm:p-4 flex flex-col gap-2.5 sm:gap-3 min-w-0 overflow-hidden">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
            My Kanban · submit directly from each stage
            <InfoTooltip
              title="My Kanban"
              content="Your assigned collabs grouped by the next action you can take. Open a card to review it or use the stage action to submit onboarding, posting, or payment details."
              side="bottom"
              align="start"
            />
          </span>
          <span className="text-[0.6rem] text-text-tertiary">
            Filter above, then open the right form from the card
          </span>
        </header>
        <div
          className="dashboard-kanban-scroll"
          style={{
            width: "100%",
            maxWidth: "100%",
            marginInline: "-8px",
            paddingInline: "8px",
            overflowX: "auto",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            className="dashboard-kanban-track"
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(280px, min(86vw, 340px))",
              gridTemplateColumns: "none",
              gap: "12px",
              minWidth: 0,
              paddingBottom: "8px",
              scrollSnapType: "x mandatory",
            }}
          >
            {STAGES.map((stage) => {
              const items = grouped.get(stage.key) ?? [];
              const Icon = stage.icon;
              return (
                <section
                  key={stage.key}
                  className={cn(
                    "rounded-2xl border border-border overflow-hidden flex flex-col snap-start",
                    stage.body,
                  )}
                >
                  <div className={cn("h-1.5", stage.band)} />
                  <header className="px-2.5 sm:px-3 pt-2.5 sm:pt-3 pb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 text-[0.78rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
                        <span
                          className={cn(
                            "inline-block w-2.5 h-2.5 rounded-full",
                            stage.dot,
                          )}
                        />
                        <Icon
                          size={14}
                          aria-hidden
                          className="text-text-secondary"
                        />
                        {stage.title}
                      </div>
                      <div className="text-[0.58rem] text-text-tertiary truncate">
                        {stage.subtitle}
                      </div>
                    </div>
                    <span className="text-[0.62rem] font-extrabold tabular text-text-secondary bg-bg-white border border-border rounded-full px-2 py-0.5">
                      {stage.key === "on-board" ? onboardGroups.length : items.length}
                    </span>
                  </header>
                  <div
                    className={cn(
                      "px-2 pb-3 flex flex-col gap-2 min-h-[220px]",
                      !entranceDone && "bento-stagger",
                    )}
                  >
                    {items.length === 0 ? (
                      <div className="flex-1 grid place-items-center text-[0.7rem] text-text-tertiary py-8 italic text-center px-3">
                        {fullSet.length > 0
                          ? "Hidden by your filters — press Clear in the filter bar above"
                          : "No cards here"}
                      </div>
                    ) : stage.key === "on-board" ? (
                      onboardGroups
                        .slice(0, visibleFor(stage.key))
                        .map((group) =>
                          group.length > 1 ? (
                            <CollabWorkloadCard
                              key={group[0].post_id ?? ""}
                              group={group}
                              stage={stage}
                              onSubmit={handleSubmit}
                              onOverview={handleOverview}
                            />
                          ) : (
                            <WorkloadCard
                              key={
                                group[0].post_id ??
                                `${group[0].username}-${stage.key}`
                              }
                              post={group[0]}
                              stage={stage}
                              onSubmit={handleSubmit}
                              onOverview={handleOverview}
                            />
                          ),
                        )
                    ) : (
                      items
                        .slice(0, visibleFor(stage.key))
                        .map((post) => (
                          <WorkloadCard
                            key={
                              post.post_id ?? `${post.username}-${stage.key}`
                            }
                            post={post}
                            stage={stage}
                            onSubmit={handleSubmit}
                            onOverview={handleOverview}
                          />
                        ))
                    )}
                    {(stage.key === "on-board"
                      ? onboardGroups.length
                      : items.length) > visibleFor(stage.key) && (
                      <button
                        type="button"
                        className="mt-1 h-8 w-full rounded-lg border border-border bg-bg-white text-[0.68rem] font-extrabold text-text-secondary transition hover:border-accent/45 hover:text-text-primary"
                        onClick={() => showMore(stage.key)}
                      >
                        Show more (
                        {(stage.key === "on-board"
                          ? onboardGroups.length
                          : items.length) - visibleFor(stage.key)}{" "}
                        hidden)
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </article>

      {onboardingPost?.post_id && (
        <OrderCreationModal
          open
          postId={onboardingPost.post_id}
          postIdShort={compactId(onboardingPost)}
          creatorName={creatorName(onboardingPost)}
          username={onboardingPost.username}
          initial={{
            collabType:
              onboardingPost.collab_type === "Barter + Paid"
                ? "Barter + Paid"
                : "Barter",
            commercials: onboardingPost.commercial_amount ?? 0,
            estDelivery: onboardingPost.est_delivery ?? "",
            reels: onboardingPost.reels ?? 0,
            posts: onboardingPost.static_posts ?? 0,
            stories: onboardingPost.stories ?? 0,
            adsUsageRights: (onboardingPost.ads_usage_rights ?? "") as never,
            orderId: onboardingPost.order_id ?? "",
            orderStatus: (onboardingPost.order_status ??
              "Unfulfilled") as never,
          }}
          onClose={() => setOnboardingPost(null)}
        />
      )}
      {postingPost?.post_id && (
        <PostingModal
          open
          postId={postingPost.post_id}
          postIdShort={compactId(postingPost)}
          collabId={collabId(postingPost) ?? undefined}
          creatorName={creatorName(postingPost)}
          username={postingPost.username}
          adsUsageRights={postingPost.ads_usage_rights}
          requireBank={requireBankFor(postingPost)}
          initial={{
            postDate: postingPost.post_date ?? "",
            postLink: postingPost.post_link ?? "",
            downloadLink: postingPost.download_link ?? "",
            rawDump: postingPost.raw_dump ?? "",
          }}
          onClose={() => setPostingPost(null)}
        />
      )}
      {overviewPost && (
        <MyCardOverviewModal
          post={overviewPost}
          allPosts={fullSet}
          onClose={() => setOverviewPost(null)}
        />
      )}
      {paymentPost?.post_id && (
        <AccountsOverviewModal
          postId={paymentPost.post_id}
          onClose={() => {
            setPaymentPost(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
