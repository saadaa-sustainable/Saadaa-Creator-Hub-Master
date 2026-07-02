"use client";

import { useEffect, useState } from "react";
import { Grid3X3, Inbox, List as ListIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, workflowStatusLabel } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { MyPost } from "./types";

function statusChipClass(status: string | null): string {
  const s = status ?? "";
  if (["Posted", "Delivered"].includes(s))
    return "bg-[--success-bg] text-[--success-text]";
  if (["On Board", "Order Sent"].includes(s))
    return "bg-[--warning-bg] text-[--warning-text]";
  if (
    ["RTO", "Cancelled", "RTO - Reverse Picked", "RTO - Delivered"].includes(s)
  )
    return "bg-[--danger-bg] text-[--danger-text]";
  return "bg-[--bg-surface] text-[--text-secondary]";
}

function StatusChip({ status }: { status: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap",
        statusChipClass(status),
      )}
    >
      {workflowStatusLabel(status)}
    </span>
  );
}

export interface MyPostsListProps {
  posts: MyPost[];
}

export function MyPostsList({ posts }: MyPostsListProps) {
  const [view, setView] = useState<"list" | "cards">("list");

  // Force cards on mobile
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      if (mq.matches) setView("cards");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <section aria-labelledby="my-posts-heading">
      <div className="flex items-center justify-between gap-2 mb-3 mt-6 flex-wrap">
        <h2
          id="my-posts-heading"
          className="text-[0.875rem] font-semibold text-[--text-primary]"
        >
          My Posts
          <span className="ml-2 text-[0.75rem] font-normal text-[--text-tertiary] tabular">
            ({posts.length})
          </span>
        </h2>

        <div className="ob-viewtoggle" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={cn(view === "list" && "active")}
            onClick={() => setView("list")}
          >
            <ListIcon size={12} aria-hidden />
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards"}
            className={cn(view === "cards" && "active")}
            onClick={() => setView("cards")}
          >
            <Grid3X3 size={12} aria-hidden />
            Cards
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="glass-card text-center py-10 text-[--text-tertiary]">
          <Inbox size={28} className="mx-auto mb-2" />
          <p className="font-medium text-[--text-primary]">No posts yet</p>
          <p className="text-sm">
            Posts you onboard will appear here once assigned to your account.
          </p>
        </div>
      ) : view === "list" ? (
        <ListView posts={posts} />
      ) : (
        <CardsView posts={posts} />
      )}
    </section>
  );
}

function ListView({ posts }: { posts: MyPost[] }) {
  return (
    <div className="ob-list-wrap">
      <div className="bento-tile overflow-x-auto rounded-[var(--radius)] border border-[--border] bg-[--bg-white]">
        <table className="w-full text-[0.8rem]">
          <thead>
            <tr className="border-b border-[--border] bg-[--bg-surface]">
              <th className="px-3 py-2 text-left font-semibold text-[--text-secondary] min-w-[160px]">
                Creator
              </th>
              <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                Campaign
              </th>
              <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                Status
              </th>
              <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                Post Date
              </th>
              <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                Est. Delivery
              </th>
              <th className="px-3 py-2 text-left font-semibold text-[--text-secondary]">
                Order Status
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => (
              <tr
                key={p.post_id ?? i}
                className="border-b border-[--border] last:border-0 hover:bg-[--bg-surface] transition-colors duration-150"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar
                      src={null}
                      username={p.username}
                      name={p.inf_name}
                      size={28}
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-[--text-primary] truncate leading-tight">
                        {p.inf_name ?? p.username ?? "—"}
                      </div>
                      {p.username && (
                        <div className="text-[0.7rem] text-[--text-tertiary] truncate">
                          @{p.username}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-[--text-secondary] tabular">
                  {p.campaign_id ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={p.workflow_status} />
                </td>
                <td className="px-3 py-2 tabular text-[--text-secondary]">
                  {formatDate(p.post_date)}
                </td>
                <td className="px-3 py-2 tabular text-[--text-secondary]">
                  {formatDate(p.est_delivery)}
                </td>
                <td className="px-3 py-2 text-[--text-secondary]">
                  {p.order_status ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardsView({ posts }: { posts: MyPost[] }) {
  // Single-node rise on the grid (replays only when the view toggles, like a
  // tab swap) — children stay animation-free so data changes never re-trigger.
  return (
    <div className="ob-card-grid dash-tab-swap">
      {posts.map((p, i) => (
        <MyPostCard key={p.post_id ?? i} post={p} />
      ))}
    </div>
  );
}

function MyPostCard({ post: p }: { post: MyPost }) {
  return (
    <div
      className={cn(
        "ob-card",
        ["Posted", "Delivered"].includes(p.workflow_status ?? "")
          ? "ob-card-onboarded"
          : "ob-card-pending",
      )}
    >
      <div className="ob-card-head">
        <Avatar
          src={null}
          username={p.username}
          name={p.inf_name}
          size={44}
          className="ob-card-avatar"
        />
        <div className="ob-card-id">
          <div className="ob-card-name">{p.inf_name ?? p.username ?? "—"}</div>
          {p.username && <div className="ob-card-handle">@{p.username}</div>}
        </div>
      </div>

      <div className="ob-card-pills">
        <span className="ob-card-stage-text">
          <StatusChip status={p.workflow_status} />
        </span>
        {p.campaign_id && (
          <span className="campaign-chip">{p.campaign_id}</span>
        )}
      </div>

      <dl className="ob-card-meta-grid">
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Post Date</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(p.post_date)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Est. Delivery</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(p.est_delivery)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Order ID</span>
          <span
            className="ob-card-meta-val tabular"
            style={
              p.order_id ? { color: "var(--color-success-text)" } : undefined
            }
          >
            {p.order_id ?? "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Order Status</span>
          <span className="ob-card-meta-val">{p.order_status ?? "—"}</span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Reach Out</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(p.reach_out_date)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Onboarded</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(p.onboard_date)}
          </span>
        </div>
      </dl>
    </div>
  );
}
