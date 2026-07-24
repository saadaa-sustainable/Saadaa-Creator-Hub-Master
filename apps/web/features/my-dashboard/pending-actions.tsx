"use client";

import { useState } from "react";
import {
  Box,
  CalendarClock,
  Eye,
  Hash,
  PackageCheck,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/cn";
import { formatDate, workflowStatusLabel } from "@/lib/formatters";
import { MyCardOverviewModal } from "./card-overview-modal";
import type { MyPost, PendingAction } from "./types";

export function PendingActionsSection({
  actions,
  allPosts,
  overdueTotal,
}: {
  actions: PendingAction[];
  allPosts: MyPost[];
  overdueTotal: number;
}) {
  const [selectedPost, setSelectedPost] = useState<MyPost | null>(null);
  const overdueCount = overdueTotal;
  const awaitingCount = actions.filter(
    (action) => action.label === "Awaiting post",
  ).length;

  return (
    <>
      <section
        className="bento-tile overflow-hidden rounded-2xl border border-border bg-bg-white"
        aria-labelledby="pending-actions-heading"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-danger-bg/35 px-3 py-3 sm:px-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger-text">
              <TriangleAlert size={15} aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="pending-actions-heading"
                  className="text-[0.9rem] font-bold text-text-primary"
                >
                  Attention
                </h2>
                <InfoTooltip
                  title="Attention"
                  content="Your assigned collabs whose estimated delivery date has passed, plus delivered orders that still need a post."
                  side="bottom"
                  align="start"
                />
              </div>
              <p className="text-[0.68rem] text-text-secondary">
                Complete delivery context for immediate follow-up
              </p>
            </div>
          </div>
          {actions.length > 0 && (
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold">
              <span className="rounded-full bg-danger-bg px-2.5 py-1 text-danger-text">
                {overdueCount} overdue
              </span>
              {awaitingCount > 0 && (
                <span className="rounded-full bg-warning-bg px-2.5 py-1 text-warning-text">
                  {awaitingCount} awaiting post
                </span>
              )}
            </div>
          )}
        </header>

        {actions.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center px-4 py-8 text-center">
            <PackageCheck size={24} className="mb-2 text-success" aria-hidden />
            <p className="text-sm font-semibold text-text-primary">
              All caught up
            </p>
            <p className="text-[0.7rem] text-text-tertiary">
              No overdue deliveries or missing posts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 p-2.5 md:grid-cols-2 sm:p-3">
            {actions.map((action, index) => (
              <AttentionCard
                key={action.post.id ?? index}
                action={action}
                onOverview={() => setSelectedPost(action.post)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedPost && (
        <MyCardOverviewModal
          post={selectedPost}
          allPosts={allPosts}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-bg-surface/45 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-[0.06em] text-text-tertiary">
        <Icon size={10} aria-hidden />
        {label}
      </div>
      <p className="truncate text-[0.7rem] font-semibold text-text-primary">
        {value || "—"}
      </p>
    </div>
  );
}

function deliverables(post: MyPost): string {
  const parts = [
    post.reels ? `${post.reels}R` : "",
    post.static_posts ? `${post.static_posts}P` : "",
    post.stories ? `${post.stories}S` : "",
  ].filter(Boolean);
  return parts.join(" · ") || post.deliverable_type || "—";
}

function AttentionCard({
  action,
  onOverview,
}: {
  action: PendingAction;
  onOverview: () => void;
}) {
  const post = action.post;
  const isOverdue = action.label === "Overdue delivery";
  const creatorName =
    post.creator?.inf_name ??
    post.inf_name ??
    post.username ??
    "Unnamed creator";

  return (
    <article
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border bg-bg-white p-3",
        isOverdue ? "border-danger/25" : "border-warning/30",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          isOverdue ? "bg-danger" : "bg-warning",
        )}
        aria-hidden
      />
      <div className="mb-3 flex items-start justify-between gap-3 pl-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            src={post.creator?.profile_pic ?? null}
            username={post.username}
            name={creatorName}
            size={36}
          />
          <div className="min-w-0">
            <h3 className="truncate text-[0.8rem] font-bold text-text-primary">
              {creatorName}
            </h3>
            <p className="truncate text-[0.65rem] text-text-tertiary">
              @{post.username ?? "—"} ·{" "}
              {post.post_id_short ?? post.post_id ?? "No post ID"}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-bold",
            isOverdue
              ? "bg-danger-bg text-danger-text"
              : "bg-warning-bg text-warning-text",
          )}
        >
          {action.daysOverdue > 0
            ? `${action.daysOverdue}d overdue`
            : action.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <Detail
          icon={CalendarClock}
          label="EDD"
          value={formatDate(post.est_delivery)}
        />
        <Detail icon={Hash} label="Campaign" value={post.campaign_id} />
        <Detail icon={Box} label="Deliverables" value={deliverables(post)} />
        <Detail icon={PackageCheck} label="Order" value={post.order_id} />
        <Detail
          icon={PackageCheck}
          label="Order status"
          value={post.order_status}
        />
        <Detail
          icon={UserCheck}
          label="Onboarded by"
          value={post.onboarded_by}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 pl-1">
        <p className="truncate text-[0.63rem] text-text-tertiary">
          {post.content_type ?? "Content type not set"} ·{" "}
          {workflowStatusLabel(post.workflow_status)}
        </p>
        <button
          type="button"
          className="btn btn-secondary min-h-8 shrink-0 gap-1.5 px-2.5 text-[0.68rem]"
          onClick={onOverview}
        >
          <Eye size={12} aria-hidden />
          Overview
        </button>
      </div>
    </article>
  );
}
