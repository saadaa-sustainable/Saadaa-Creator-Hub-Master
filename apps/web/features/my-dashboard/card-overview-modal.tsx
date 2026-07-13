"use client";

import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import {
  formatDate,
  formatFollowers,
  formatRupees,
  workflowStatusLabel,
} from "@/lib/formatters";
import type { MyPost } from "./types";

/**
 * Stage-aware overview popup for My Kanban cards. One modal serves every
 * column: the sections render by data presence — a Reach Out card shows the
 * creator + reach-out info; an Onboard card adds the full onboarding
 * submission; Posted adds the posting submission per deliverable.
 *
 * Portaled to <body> — in-tree fixed overlays get trapped below the sidebar
 * by the page wrapper's persistent transform (same rule as every app modal).
 */

function creatorName(post: MyPost): string {
  return post.creator?.inf_name ?? post.inf_name ?? post.username ?? "Creator";
}

function collabKey(post: MyPost): string | null {
  return (
    post.collab_id ??
    (post.inf_id && post.collab_number != null
      ? `${post.inf_id}-C${Number(post.collab_number)}`
      : null)
  );
}

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number | null | undefined;
  href?: string | null;
}) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return null;
  return (
    <>
      <dt className="text-[0.62rem] font-bold uppercase tracking-[0.05em] text-text-tertiary py-1">
        {label}
      </dt>
      <dd className="text-[0.78rem] text-text-primary py-1 text-right break-words min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[#3B6FD4] hover:underline break-all"
          >
            <span className="truncate max-w-[220px]">{text}</span>
            <ExternalLink size={11} aria-hidden className="shrink-0" />
          </a>
        ) : (
          text
        )}
      </dd>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-bg-surface/60 px-3 py-2">
      <h3 className="text-[0.6rem] font-extrabold uppercase tracking-[0.08em] text-text-secondary mb-0.5">
        {title}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 items-baseline">
        {children}
      </dl>
    </section>
  );
}

export function MyCardOverviewModal({
  post,
  allPosts,
  onClose,
}: {
  post: MyPost;
  /** Unfiltered set — used to list every deliverable of the collab. */
  allPosts: MyPost[];
  onClose: () => void;
}) {
  const c = post.creator ?? null;
  const key = collabKey(post);
  const siblings = key
    ? allPosts
        .filter((p) => collabKey(p) === key)
        .sort((a, b) =>
          String(a.post_id ?? "").localeCompare(String(b.post_id ?? "")),
        )
    : [post];

  const igLink =
    c?.instagram_link ??
    (post.username ? `https://instagram.com/${post.username}` : null);

  const onboarded =
    Boolean(post.onboard_date) ||
    Boolean(post.order_id) ||
    post.collab_number != null;
  const postedRows = siblings.filter(
    (p) => (p.post_link ?? "").trim() || p.post_date,
  );
  const bankPresent = siblings.some(
    (p) => String(p.bank_number ?? "").trim() && String(p.ifsc ?? "").trim(),
  );

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Overview — ${post.post_id_short ?? post.post_id ?? ""}`}
      style={{ zIndex: 1500 }}
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--onboarding flex flex-col"
        style={{ maxWidth: 620, width: "94vw", maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              src={c?.profile_pic ?? null}
              username={post.username}
              name={creatorName(post)}
              size={34}
            />
            <div className="min-w-0">
              <h2 className="font-semibold truncate">
                {creatorName(post)}
                <span className="ml-2 text-[0.7rem] font-normal text-text-tertiary">
                  @{post.username ?? "—"}
                </span>
              </h2>
              <p className="text-[0.66rem] text-text-secondary truncate">
                {post.post_id_short ?? post.post_id ?? "—"}
                {key ? ` · ${key}` : ""}
                {post.workflow_status
                  ? ` · ${workflowStatusLabel(post.workflow_status)}`
                  : ""}
              </p>
            </div>
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

        <div className="modal-body flex-1 overflow-y-auto flex flex-col gap-2.5">
          <Section title="Creator">
            <Row label="SIF" value={c?.inf_id ?? post.inf_id} />
            <Row label="Instagram" value={igLink ?? undefined} href={igLink} />
            <Row
              label="Followers"
              value={
                c?.followers != null ? formatFollowers(c.followers) : null
              }
            />
            <Row label="Tier" value={c?.category} />
            <Row
              label="Engagement rate"
              value={c?.er != null ? `${c.er}%` : null}
            />
            <Row
              label="Avg likes"
              value={c?.avg_likes != null ? String(c.avg_likes) : null}
            />
            <Row label="Gender" value={c?.gender} />
            <Row label="State" value={c?.state} />
            <Row label="Language" value={c?.language} />
            <Row label="Creator type" value={c?.creator_type} />
            <Row label="Agency" value={c?.agency_name} />
          </Section>

          <Section title="Reach Out">
            <Row label="Reach-out date" value={formatDate(post.reach_out_date)} />
            <Row label="Campaign" value={post.campaign_id} />
            <Row label="Content type" value={post.content_type} />
            <Row
              label="Reached out by"
              value={post.logged_by ?? post.onboarded_by}
            />
          </Section>

          {onboarded && (
            <Section title="Onboarding">
              <Row label="Onboard date" value={formatDate(post.onboard_date)} />
              <Row label="Onboarded by" value={post.onboarded_by} />
              <Row label="Collab type" value={post.collab_type} />
              <Row
                label="Agreed amount"
                value={
                  post.commercial_amount != null
                    ? formatRupees(post.commercial_amount)
                    : null
                }
              />
              <Row
                label="Deliverables"
                value={
                  siblings.length > 1
                    ? `${siblings.length} (${siblings
                        .map(
                          (p) =>
                            `P${p.deliverable_index ?? "?"}${p.deliverable_type ? ` ${p.deliverable_type}` : ""}`,
                        )
                        .join(", ")})`
                    : (post.deliverable_type ?? null)
                }
              />
              <Row label="Est. delivery" value={formatDate(post.est_delivery)} />
              <Row label="Ads usage rights" value={post.ads_usage_rights} />
              <Row label="Order ID" value={post.order_id} />
              <Row label="Order status" value={post.order_status} />
              <Row label="Tracking ID" value={post.tracking_id} />
              <Row
                label="Bank details"
                value={
                  String(post.collab_type ?? "").toLowerCase() ===
                  "barter + paid"
                    ? bankPresent
                      ? "Added"
                      : "Missing — posting form will ask"
                    : null
                }
              />
            </Section>
          )}

          {postedRows.length > 0 && (
            <Section title="Posting">
              {postedRows.map((p) => (
                <div key={p.post_id ?? ""} className="contents">
                  <Row
                    label={`P${p.deliverable_index ?? "?"} post date`}
                    value={formatDate(p.post_date)}
                  />
                  <Row
                    label={`P${p.deliverable_index ?? "?"} post link`}
                    value={p.post_link}
                    href={p.post_link}
                  />
                  <Row
                    label={`P${p.deliverable_index ?? "?"} download`}
                    value={p.download_link ? "Download link" : null}
                    href={p.download_link}
                  />
                </div>
              ))}
              <Row
                label="Posted by"
                value={post.posted_by ?? post.onboarded_by}
              />
            </Section>
          )}

          {post.payment_status && (
            <Section title="Payment">
              <Row label="Payment status" value={post.payment_status} />
            </Section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
