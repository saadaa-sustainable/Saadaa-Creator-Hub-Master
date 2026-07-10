"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  AlertTriangle,
  Ban,
  CalendarClock,
  ExternalLink,
  Eye,
  FileWarning,
  ShieldAlert,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/formatters";
import { offboardCreator } from "./actions";
import { OFFBOARDING_REASON_MAX, OFFBOARDING_REASON_MIN } from "./rules";
import type { OffboardingCreator, OffboardingFilters } from "./types";

const OVERVIEW_MODAL_CLASSES =
  "modal-panel modal-panel--lg modal-panel--onboarding campaign-detail-modal ob-overview-modal ad-overview-modal ad-detail-modal offboarding-creator-modal";

export function OffboardingBoard({
  candidates,
  offboarded,
  filters,
}: {
  candidates: OffboardingCreator[];
  offboarded: OffboardingCreator[];
  filters: OffboardingFilters;
}) {
  const [view, setView] = useState<"candidates" | "offboarded">(
    candidates.length > 0 ? "candidates" : "offboarded",
  );
  const [selected, setSelected] = useState<OffboardingCreator | null>(null);
  const [confirming, setConfirming] = useState<OffboardingCreator | null>(null);
  const rows = view === "candidates" ? candidates : offboarded;
  const hasFilters = Boolean(filters.search || filters.campaign);

  return (
    <section
      className="offboarding-workspace"
      aria-label="Creator offboarding tray"
      data-depth="3"
    >
      <div className="offboarding-workspace__head">
        <div>
          <span className="offboarding-workspace__eyebrow">
            {view === "candidates" ? "Action tray" : "Creator blacklist"}
          </span>
          <h2>
            {view === "candidates"
              ? "Overdue creators awaiting review"
              : "Offboarded creators"}
          </h2>
          <p>
            {view === "candidates"
              ? "Each card is one creator, grouped across every overdue unsubmitted deliverable."
              : "These creators are blocked from future reach-out and onboarding."}
          </p>
        </div>

        <div
          className="ob-viewtoggle offboarding-workspace__tabs"
          role="tablist"
          aria-label="Offboarding lists"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "candidates"}
            className={cn(view === "candidates" && "active")}
            onClick={() => setView("candidates")}
          >
            <AlarmClock size={13} aria-hidden /> Needs review
            <span>{candidates.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "offboarded"}
            className={cn(view === "offboarded" && "active")}
            onClick={() => setView("offboarded")}
          >
            <Ban size={13} aria-hidden /> Offboarded
            <span>{offboarded.length}</span>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="ob-empty offboarding-workspace__empty">
          {view === "candidates" ? (
            <CalendarClock size={30} aria-hidden />
          ) : (
            <ShieldAlert size={30} aria-hidden />
          )}
          <strong>
            {hasFilters
              ? "No creators match these filters."
              : view === "candidates"
                ? "No creators have crossed their posting deadline."
                : "No creators have been offboarded yet."}
          </strong>
          <p>
            {view === "candidates"
              ? "Creators appear here automatically after an estimated delivery date passes while the posting form remains unsubmitted."
              : "A creator enters this ledger only after a mandatory reason is confirmed."}
          </p>
        </div>
      ) : (
        <div className="offboarding-creator-grid">
          {rows.map((creator) => (
            <CreatorCard
              key={`${creator.state}-${creator.infId}`}
              creator={creator}
              onOpen={() => setSelected(creator)}
              onOffboard={() => setConfirming(creator)}
            />
          ))}
        </div>
      )}

      {selected && (
        <CreatorOverviewModal
          creator={selected}
          onClose={() => setSelected(null)}
          onOffboard={
            selected.state === "candidate"
              ? () => {
                  setSelected(null);
                  setConfirming(selected);
                }
              : undefined
          }
        />
      )}
      {confirming && (
        <OffboardReasonModal
          creator={confirming}
          onClose={() => setConfirming(null)}
          onSuccess={() => setView("offboarded")}
        />
      )}
    </section>
  );
}

function CreatorCard({
  creator,
  onOpen,
  onOffboard,
}: {
  creator: OffboardingCreator;
  onOpen: () => void;
  onOffboard: () => void;
}) {
  const isCandidate = creator.state === "candidate";
  return (
    <article
      className={cn(
        "offboarding-creator-card",
        isCandidate
          ? "offboarding-creator-card--candidate"
          : "offboarding-creator-card--offboarded",
      )}
      onClick={onOpen}
      data-depth="4"
    >
      <div className="offboarding-creator-card__head">
        <Avatar
          src={creator.profilePicUrl}
          username={creator.username}
          name={creator.name}
          size={48}
        />
        <div className="offboarding-creator-card__identity">
          <span>{creator.infId}</span>
          <h3>{creator.name || creator.username}</h3>
          <p>@{creator.username}</p>
        </div>
        <span
          className={cn(
            "offboarding-creator-card__status",
            isCandidate ? "is-overdue" : "is-offboarded",
          )}
        >
          {isCandidate ? `${creator.daysOverdue}d overdue` : "Offboarded"}
        </span>
      </div>

      <dl className="offboarding-creator-card__stats">
        <div>
          <dt>Deliverables</dt>
          <dd>{creator.overdueDeliverables}</dd>
        </div>
        <div>
          <dt>Collabs</dt>
          <dd>{creator.overdueCollabs}</dd>
        </div>
        <div>
          <dt>{isCandidate ? "Oldest deadline" : "Offboarded on"}</dt>
          <dd>
            {isCandidate
              ? formatDate(creator.oldestDeadline)
              : formatDate(creator.blacklistedAt)}
          </dd>
        </div>
      </dl>

      <div className="offboarding-creator-card__context">
        <span>
          <FileWarning size={12} aria-hidden />
          {creator.postIds.length > 0
            ? creator.postIds.slice(0, 3).join(", ")
            : "No post IDs captured"}
          {creator.postIds.length > 3
            ? ` +${creator.postIds.length - 3} more`
            : ""}
        </span>
        <span>
          <Users size={12} aria-hidden />
          {creator.teamMembers.join(", ") || "Team not recorded"}
        </span>
      </div>

      {!isCandidate && creator.blacklistReason && (
        <p className="offboarding-creator-card__reason">
          {creator.blacklistReason}
        </p>
      )}

      <footer className="offboarding-creator-card__actions">
        <button
          type="button"
          className="campaign-list-action campaign-list-action--brief"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <Eye size={13} aria-hidden /> Overview
        </button>
        {isCandidate && (
          <button
            type="button"
            className="offboarding-creator-card__offboard"
            onClick={(event) => {
              event.stopPropagation();
              onOffboard();
            }}
          >
            <UserMinus size={13} aria-hidden /> Offboard creator
          </button>
        )}
      </footer>
    </article>
  );
}

function CreatorOverviewModal({
  creator,
  onClose,
  onOffboard,
}: {
  creator: OffboardingCreator;
  onClose: () => void;
  onOffboard?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const stats: Array<[string, ReactNode]> = [
    ["Creator ID", creator.infId],
    ["Creator tier", creator.category || "Not recorded"],
    ["Followers", creator.followers?.toLocaleString("en-IN") || "Not recorded"],
    ["Overdue deliverables", creator.overdueDeliverables],
    ["Overdue collabs", creator.overdueCollabs],
    ["Oldest deadline", formatDate(creator.oldestDeadline)],
    ["Days overdue", `${creator.daysOverdue} days`],
    ["Last onboarded", formatDate(creator.lastOnboardDate)],
  ];

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      onClick={onClose}
    >
      <div
        className={OVERVIEW_MODAL_CLASSES}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offboarding-overview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head campaign-detail-head ad-detail-head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <span className="campaign-card__id">{creator.infId}</span>
              <span
                className={cn(
                  "offboarding-creator-card__status",
                  creator.state === "candidate"
                    ? "is-overdue"
                    : "is-offboarded",
                )}
              >
                {creator.state === "candidate"
                  ? `${creator.daysOverdue}d overdue`
                  : "Offboarded"}
              </span>
            </div>
            <h2 id="offboarding-overview-title">
              {creator.name || creator.username}
            </h2>
            <p className="campaign-detail-subtitle">@{creator.username}</p>
          </div>
          <button
            type="button"
            className="icon-btn campaign-detail-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        <div className="modal-body campaign-detail-body ad-detail-body">
          <section className="ob-overview-card offboarding-overview-profile">
            <div className="ob-overview-head">
              <Avatar
                src={creator.profilePicUrl}
                username={creator.username}
                name={creator.name}
                size={58}
              />
              <div className="ob-overview-identity">
                <strong>{creator.name || creator.username}</strong>
                <span>@{creator.username}</span>
              </div>
              {creator.instagramLink && (
                <a
                  href={creator.instagramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="campaign-detail-section-link"
                >
                  <ExternalLink size={12} aria-hidden /> Instagram
                </a>
              )}
            </div>
            <div className="ob-overview-pills">
              {creator.campaigns.map((campaign) => (
                <span className="campaign-chip" key={campaign}>
                  {campaign}
                </span>
              ))}
              {creator.teamMembers.map((member) => (
                <span className="pill pill--muted" key={member}>
                  {member}
                </span>
              ))}
            </div>
          </section>

          <dl className="campaign-detail-stat-grid ad-detail-stat-grid">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <section className="campaign-detail-section">
            <div className="campaign-detail-section-head">
              <div>
                <h3>Posting evidence</h3>
                <p>
                  Post IDs still in the unsubmitted Posting queue when this
                  creator was reviewed.
                </p>
              </div>
            </div>
            <div className="offboarding-post-id-list">
              {creator.postIds.length > 0 ? (
                creator.postIds.map((postId) => (
                  <span key={postId}>{postId}</span>
                ))
              ) : (
                <span>No post IDs were captured.</span>
              )}
            </div>
          </section>

          {creator.state === "offboarded" && (
            <section className="campaign-detail-section offboarding-reason-panel">
              <div className="campaign-detail-section-head">
                <div>
                  <h3>Offboarding reason</h3>
                  <p>
                    Recorded by {creator.blacklistedBy || "an administrator"} on{" "}
                    {formatDate(creator.blacklistedAt)}.
                  </p>
                </div>
              </div>
              <p>{creator.blacklistReason || "No reason recorded."}</p>
            </section>
          )}
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {onOffboard && (
            <Button
              variant="danger"
              size="sm"
              onClick={onOffboard}
              className="gap-1.5"
            >
              <UserMinus size={14} aria-hidden /> Offboard creator
            </Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function OffboardReasonModal({
  creator,
  onClose,
  onSuccess,
}: {
  creator: OffboardingCreator;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const cleanReason = reason.trim();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const submit = () => {
    if (cleanReason.length < OFFBOARDING_REASON_MIN) {
      toast.error(
        `Add a clear offboarding reason with at least ${OFFBOARDING_REASON_MIN} characters.`,
      );
      return;
    }
    startTransition(async () => {
      const result = await offboardCreator({
        infId: creator.infId,
        reason: cleanReason,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`@${result.username} has been offboarded and blacklisted.`);
      onClose();
      onSuccess();
      router.refresh();
    });
  };

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      onClick={pending ? undefined : onClose}
    >
      <div
        className="modal-panel modal-panel--onboarding creator-offboard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offboard-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex min-w-0 items-center gap-2">
            <span className="creator-offboard-dialog__icon">
              <AlertTriangle size={17} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="offboard-dialog-title">Offboard @{creator.username}</h2>
              <p>Creator-level permanent block</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="modal-body creator-offboard-dialog__body">
          <div className="creator-offboard-dialog__warning">
            <Ban size={18} aria-hidden />
            <p>
              This blocks the creator from every future reach-out and onboarding
              attempt. Existing history remains unchanged.
            </p>
          </div>
          <label className="creator-offboard-dialog__field">
            <span>
              Reason <strong>*</strong>
            </span>
            <textarea
              autoFocus
              value={reason}
              onChange={(event) =>
                setReason(event.target.value.slice(0, OFFBOARDING_REASON_MAX))
              }
              placeholder="Describe what happened, follow-up attempts made, and why this creator should be blocked..."
              rows={6}
              disabled={pending}
            />
            <small>
              <span>
                {cleanReason.length < OFFBOARDING_REASON_MIN
                  ? `Minimum ${OFFBOARDING_REASON_MIN} characters`
                  : "Reason ready"}
              </span>
              <span>
                {reason.length}/{OFFBOARDING_REASON_MAX}
              </span>
            </small>
          </label>
        </div>

        <footer className="modal-foot">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <Button
            variant="danger"
            size="sm"
            loading={pending}
            disabled={pending || cleanReason.length < OFFBOARDING_REASON_MIN}
            onClick={submit}
            className="gap-1.5"
          >
            <UserMinus size={14} aria-hidden /> Confirm offboarding
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
