"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  formatDate,
  formatFollowers,
  workflowStatusLabel,
} from "@/lib/formatters";
import type { JourneyCard } from "./types";
import { journeyCollabId } from "./collab-id";

/**
 * Journey Card detail modal — read-only summary of all collab data
 * for a card. Uses the same portal + backdrop + modal-panel pattern
 * as PostingOverviewModal.
 */
export function JourneyCardModal({
  card,
  onClose,
}: {
  card: JourneyCard | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!card) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [card]);

  if (!mounted || !card) return null;

  const displayName = card.inf_name ?? card.username ?? "—";
  const handle = card.username ?? undefined;
  const category = card.creator?.category ?? null;
  const followers = card.creator?.followers ?? null;

  const payStatusRaw = (card.payment_status ?? "").trim().toLowerCase();
  const isSettled = payStatusRaw === "done" || payStatusRaw === "paid";
  const collabId = journeyCollabId(card);

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding ob-overview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={16} aria-hidden />
            <h2 className="font-semibold">Creator Journey</h2>
            <span className="chip text-[10px] tabular">{card.post_id}</span>
            {collabId && (
              <span className="text-[10px] tabular text-text-tertiary whitespace-nowrap">
                · {collabId}
              </span>
            )}
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

        {/* Body */}
        <div className="modal-body ob-overview-body">
          {/* Creator identity section */}
          <section className="ob-overview-card">
            <div className="ob-overview-head">
              <Avatar
                src={card.creator?.profile_pic}
                username={handle}
                name={displayName}
                size={48}
              />
              <div className="ob-overview-identity">
                <strong>{displayName}</strong>
                {handle && <span>@{handle}</span>}
              </div>
              {card.workflow_status && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-[--bg-surface] text-[--text-secondary] whitespace-nowrap"
                >
                  {workflowStatusLabel(card.workflow_status)}
                </span>
              )}
            </div>
            <div className="ob-overview-pills">
              {category && (
                <span className="pill pill--muted uppercase text-[0.6rem] tracking-wide">
                  {category}
                </span>
              )}
              {followers != null && (
                <span className="pill pill--muted tabular">
                  {formatFollowers(followers)} followers
                </span>
              )}
              {card.campaign_id && (
                <span className="campaign-chip">{card.campaign_id}</span>
              )}
              {card.content_type && (
                <span className="pill pill--info">{card.content_type}</span>
              )}
              {card.ads_usage_rights && (
                <span className="pill pill--info">
                  Ads: {card.ads_usage_rights}
                </span>
              )}
            </div>
          </section>

          {/* Info grid */}
          <section className="ob-overview-grid">
            <OverviewItem label="Campaign" value={card.campaign_id ?? "—"} />
            <OverviewItem
              label="Workflow Status"
              value={workflowStatusLabel(card.workflow_status)}
            />
            <OverviewItem
              label="Reach Out Date"
              value={formatDate(card.reach_out_date) ?? "—"}
            />
            <OverviewItem
              label="Onboard Date"
              value={formatDate(card.onboard_date) ?? "—"}
            />
            <OverviewItem
              label="Post Date"
              value={formatDate(card.post_date) ?? "—"}
            />
            <OverviewItem
              label="Est. Delivery"
              value={formatDate(card.est_delivery) ?? "—"}
            />
            <OverviewItem
              label="Order Status"
              value={card.order_status ?? "—"}
            />
            <OverviewItem
              label="Payment Status"
              value={
                card.payment_status ? (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wide"
                    style={{
                      background: isSettled
                        ? "var(--success-bg)"
                        : "var(--warning-bg)",
                      color: isSettled
                        ? "var(--success-text)"
                        : "var(--warning-text)",
                    }}
                  >
                    {isSettled ? "Settled" : "Pending"}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <OverviewItem
              label="Collab Type"
              value={card.content_type ?? "—"}
            />
            <OverviewItem
              label="Ads Rights"
              value={card.ads_usage_rights ?? "—"}
            />
            {collabId && (
              <OverviewItem label="Collab ID" value={collabId} mono />
            )}
            {card.order_id && (
              <OverviewItem label="Order ID" value={card.order_id} mono />
            )}
            {card.inf_id && (
              <OverviewItem label="Creator ID" value={card.inf_id} mono />
            )}
            {card.onboarded_by && (
              <OverviewItem label="Team Member" value={card.onboarded_by} />
            )}
            {card.creator?.state && (
              <OverviewItem label="Region" value={card.creator.state} />
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function OverviewItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="ob-overview-item">
      <span>{label}</span>
      <strong className={mono ? "tabular" : undefined}>{value}</strong>
    </div>
  );
}
