"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
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
import { cn } from "@/lib/cn";
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
    // Posted column: all deliverables (parent + child).
    // Payment column: parent only (paid or pending) — read-only overview.
    return isParent ? ["posted", "payment"] : ["posted"];
  }
  return [];
}

function paymentPending(post: MyPost): boolean {
  return (
    (post.workflow_status === "Posted" ||
      post.workflow_status === "Delivered") &&
    post.payment_status !== "Done"
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
    const pendingPay = posts.filter(paymentPending).length;
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
      <article className="rounded-2xl border border-border bg-bg-white p-3 sm:p-4 flex flex-col gap-3 sm:gap-4 min-w-0 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
              My workload
            </p>
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
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${stats.completion}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MiniStat label="Posted" value={stats.posted} tone="text-success" />
          <MiniStat
            label="Pay pending"
            value={stats.pendingPay}
            tone="text-warning"
          />
          <MiniStat label="Overdue" value={stats.overdue} tone="text-danger" />
        </div>
      </article>
      <article className="rounded-2xl border border-border bg-bg-white p-3 sm:p-4 min-w-0 overflow-hidden">
        <p className="text-[0.58rem] sm:text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary mb-2.5 sm:mb-3">
          Stage mix
        </p>
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
                    className={cn("block h-full rounded-full", stage.dot)}
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
    <article className="rounded-2xl border border-border bg-bg-white p-3 sm:p-4 min-w-0 overflow-hidden">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[0.58rem] sm:text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
            Team leaderboard
          </p>
          <h2 className="text-base sm:text-lg font-extrabold text-text-primary">
            This week&apos;s movers
          </h2>
        </div>
        <span className="inline-flex items-center justify-center rounded-xl bg-warning-bg text-warning w-8 h-8 sm:w-9 sm:h-9">
          <Crown size={15} aria-hidden />
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
        {entries.map((entry, index) => (
          <div
            key={entry.name}
            className="rounded-xl border border-border bg-bg-muted/45 p-2.5 sm:p-3 min-w-0 overflow-hidden"
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
                className="h-full rounded-full bg-accent"
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
}: {
  label: string;
  value: number;
  tone: string;
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
      <div className="mt-1 text-[0.5rem] sm:text-[0.54rem] uppercase tracking-[0.07em] font-extrabold text-text-tertiary">
        {label}
      </div>
    </div>
  );
}

function WorkloadCard({
  post,
  stage,
  onSubmit,
}: {
  post: MyPost;
  stage: StageDef;
  onSubmit: (post: MyPost, stage: StageDef) => void;
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
    <article className="rounded-xl bg-bg-white border border-border p-2 sm:p-2.5 flex flex-col gap-1.5 sm:gap-2 shadow-[0_1px_3px_rgba(22,21,19,0.05)] min-w-0">
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

      <button
        type="button"
        className={cn(
          "mt-1 w-full h-8 text-[0.7rem] rounded-lg inline-flex items-center justify-center gap-1 border font-extrabold transition",
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
  leaderboard,
}: {
  posts: MyPost[];
  leaderboard: TeamLeaderboardEntry[];
}) {
  const router = useRouter();
  const [onboardingPost, setOnboardingPost] = useState<MyPost | null>(null);
  const [postingPost, setPostingPost] = useState<MyPost | null>(null);
  const [paymentPost, setPaymentPost] = useState<MyPost | null>(null);

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

  return (
    <>
      <MyDashboardInsights posts={posts} />
      <TeamLeaderboard entries={leaderboard} />
      <article className="rounded-2xl bg-bg-white border border-border p-2.5 sm:p-4 flex flex-col gap-2.5 sm:gap-3 min-w-0 overflow-hidden">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
            My Kanban · submit directly from each stage
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
                      {items.length}
                    </span>
                  </header>
                  <div className="px-2 pb-3 flex flex-col gap-2 min-h-[220px]">
                    {items.length === 0 ? (
                      <div className="flex-1 grid place-items-center text-[0.7rem] text-text-tertiary py-8 italic">
                        No cards here
                      </div>
                    ) : (
                      items.map((post) => (
                        <WorkloadCard
                          key={post.post_id ?? `${post.username}-${stage.key}`}
                          post={post}
                          stage={stage}
                          onSubmit={handleSubmit}
                        />
                      ))
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
          creatorName={creatorName(postingPost)}
          username={postingPost.username}
          adsUsageRights={postingPost.ads_usage_rights}
          initial={{
            postDate: postingPost.post_date ?? "",
            postLink: postingPost.post_link ?? "",
            downloadLink: postingPost.download_link ?? "",
            rawDump: postingPost.raw_dump ?? "",
          }}
          onClose={() => setPostingPost(null)}
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
