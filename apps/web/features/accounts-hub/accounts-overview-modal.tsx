"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  Handshake,
  Info,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { Avatar, WorkflowStatusPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import {
  creatorAcceptedPartnership,
  postingFormCompleted,
} from "@/lib/payment-eligibility";
import type { WorkflowStatus } from "@/lib/supabase/types.gen";
import { PaymentStatusPill } from "./columns";

interface DeliverableRow {
  post_id: string;
  post_id_short: string | null;
  collab_id: string | null;
  inf_id: string | null;
  collab_number: number | null;
  workflow_status: string;
  deliverable_index: number | null;
  deliverable_type: string | null;
  deliverable_label: string;
  reels: number | null;
  static_posts: number | null;
  stories: number | null;
  ads_usage_rights: string | null;
  partnership_id: string | null;
  ad_partnership_valid: boolean | null;
  partnership_status: string | null;
  post_link: string | null;
  post_date: string | null;
  payment_status: string | null;
  commercial_amount: number | null;
  is_parent: boolean;
  split_amount: number;
  payment: Record<string, unknown> | null;
}

interface ApiPayload {
  parent: {
    post_id: string;
    post_id_short: string | null;
    collab_id: string | null;
    inf_id: string | null;
    collab_number: number | null;
    workflow_status: string;
    content_type: string | null;
    nomenclature: string | null;
    collab_type: string | null;
    commercial_amount: number | null;
    barter_amount: number | null;
    reels: number | null;
    static_posts: number | null;
    stories: number | null;
    ads_usage_rights: string | null;
    partnership_id: string | null;
    onboard_date: string | null;
    est_delivery: string | null;
    bank_name: string | null;
    bank_number: string | null;
    ifsc: string | null;
    campaign?: {
      campaign_id?: string | null;
      campaign_name?: string | null;
    } | null;
    creator?: {
      username: string | null;
      inf_name: string | null;
      profile_pic: string | null;
      followers: number | null;
      category: string | null;
      verification: string | null;
    } | null;
  };
  deliverables: DeliverableRow[];
  summary: {
    totalDeliverables: number;
    commercialTotal: number;
    perDeliverableAmount: number;
    hasAdsRights: boolean;
  };
}

/**
 * Collab ID for a row — prefer the real `collab_id` column; fall back to
 * `inf_id||'-C'||collab_number` for legacy rows not yet backfilled.
 */
function collabIdOf(r: {
  collab_id?: string | null;
  inf_id?: string | null;
  collab_number?: number | null;
}): string | null {
  return (
    r.collab_id ??
    (r.inf_id ? `${r.inf_id}-C${Number(r.collab_number ?? 1)}` : null)
  );
}

/**
 * Accounts Hub — overview modal opened by clicking a kanban card. Renders
 * stage-specific content:
 *  - Reach Out / On Board: identity + collab summary (read-only).
 *  - Posted / Delivered: per-deliverable payment ledger so the accounts team
 *    can verify partnerships and trigger payments per row.
 *
 * Per-deliverable rows include a "Open Instagram" verification link and a
 * tooltip reminding the operator to confirm the post is live before paying.
 */
export function AccountsOverviewModal({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accounts/post-deliverables/${encodeURIComponent(postId)}`)
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Unable to load");
        return payload as ApiPayload;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [postId]);

  if (!mounted) return null;

  const stage = data?.parent.workflow_status ?? "";
  const isPostedStage = stage === "Posted" || stage === "Delivered";

  // Collab-level payment gate — computed from all sibling deliverables.
  const allPosted =
    !data ||
    data.deliverables.every(
      (d) =>
        postingFormCompleted(d) &&
        (d.workflow_status === "Posted" || d.workflow_status === "Delivered"),
    );
  // Creator acceptance is mandatory for every collab, regardless of ads
  // rights. An admin Partnership Key is not a payment override.
  const allPartnershipped =
    !data || data.deliverables.every((d) => creatorAcceptedPartnership(d));
  const collabBlocked = isPostedStage && (!allPosted || !allPartnershipped);

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding acc-overview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={16} aria-hidden />
            <h2 className="font-semibold">
              {isPostedStage
                ? "Posting Overview"
                : stage === "Reach Out"
                  ? "Reach Out Overview"
                  : "Onboarding Overview"}
            </h2>
            {data && (
              <span className="chip text-[10px] tabular">
                {data.parent.post_id_short ?? data.parent.post_id}
                {collabIdOf(data.parent) && (
                  <span
                    className="text-text-tertiary"
                    title="Collab ID — groups all deliverables of this collaboration"
                  >
                    {" · "}
                    {collabIdOf(data.parent)}
                  </span>
                )}
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

        <div className="modal-body ob-overview-body">
          {loading && (
            <div className="creator-overview-state">Loading deliverables…</div>
          )}
          {error && (
            <div className="creator-overview-state is-error">{error}</div>
          )}

          {data && (
            <>
              {/* Identity header */}
              <section className="ob-overview-card">
                <div className="ob-overview-head">
                  <Avatar
                    src={data.parent.creator?.profile_pic}
                    username={data.parent.creator?.username}
                    name={data.parent.creator?.inf_name}
                    size={48}
                  />
                  <div className="ob-overview-identity">
                    <strong>
                      {data.parent.creator?.inf_name ??
                        data.parent.creator?.username ??
                        "—"}
                    </strong>
                    <span>@{data.parent.creator?.username ?? "—"}</span>
                  </div>
                  <WorkflowStatusPill
                    status={data.parent.workflow_status as WorkflowStatus}
                  />
                </div>
                <div className="ob-overview-pills">
                  <span className="campaign-chip">
                    {data.parent.campaign?.campaign_id ?? "—"}
                  </span>
                  {(data.parent.nomenclature ?? data.parent.content_type) && (
                    <span className="pill pill--muted">
                      {data.parent.nomenclature ?? data.parent.content_type}
                    </span>
                  )}
                  {data.summary.hasAdsRights && (
                    <span className="pill pill--info">
                      <ShieldCheck size={10} aria-hidden />
                      Ads: {data.parent.ads_usage_rights}
                    </span>
                  )}
                </div>
              </section>

              {/* Commercial summary */}
              <section className="acc-overview-summary">
                <div>
                  <span>Collab</span>
                  <strong>{data.parent.collab_type ?? "—"}</strong>
                </div>
                <div>
                  <span>Total Commercial</span>
                  <strong className="tabular">
                    {formatRupees(data.summary.commercialTotal)}
                  </strong>
                </div>
                <div>
                  <span>Deliverables</span>
                  <strong className="tabular">
                    {data.summary.totalDeliverables}
                  </strong>
                </div>
                <div>
                  <span>Per Deliverable</span>
                  <strong className="tabular acc-overview-summary__split">
                    {formatRupees(data.summary.perDeliverableAmount)}
                  </strong>
                </div>
              </section>

              {/* Bank information — shown on Posted/Delivered so accounts team can verify before paying */}
              {isPostedStage && (
                <section className="acc-overview-bank">
                  <div className="acc-overview-bank__head">
                    <Building2 size={12} aria-hidden />
                    Bank Information
                  </div>
                  <dl className="acc-overview-bank__grid">
                    <div>
                      <dt>Bank Name</dt>
                      <dd>
                        {data.parent.bank_name?.trim() || (
                          <span className="acc-overview-bank__missing">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Account Number</dt>
                      <dd className="tabular">
                        {data.parent.bank_number?.trim() || (
                          <span className="acc-overview-bank__missing">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>IFSC</dt>
                      <dd className="tabular">
                        {data.parent.ifsc?.trim() || (
                          <span className="acc-overview-bank__missing">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>
              )}

              {/* Payment gate banner — shown when collab isn't ready */}
              {isPostedStage && collabBlocked && (
                <div className="acc-overview-gate">
                  <Lock size={14} aria-hidden />
                  <div>
                    <strong>Payment locked for this collab.</strong>{" "}
                    {!allPosted &&
                      "Some deliverables haven't been posted yet. "}
                    {!allPartnershipped &&
                      "The creator hasn't approved the partnership request yet. "}
                    Complete all deliverables before logging payment.
                  </div>
                </div>
              )}

              {/* Verification tooltip — shown only when collab is ready */}
              {isPostedStage && !collabBlocked && (
                <div className="acc-overview-tip">
                  <Info size={14} aria-hidden />
                  <div>
                    <strong>Verify before paying.</strong> Open each Instagram
                    link below and confirm the creator actually posted the
                    content. Payments cannot be reversed once submitted.
                  </div>
                </div>
              )}

              {/* Deliverables list — only meaningful on Posted/Delivered. */}
              {isPostedStage && (
                <section className="acc-overview-deliverables">
                  <h5 className="acc-overview-deliverables__head">
                    <Banknote size={13} aria-hidden />
                    Deliverables ({data.deliverables.length})
                  </h5>
                  <div className="acc-overview-deliverable-list">
                    {data.deliverables.map((d) => (
                      <DeliverableCard
                        key={d.post_id}
                        deliverable={d}
                        collabBlocked={collabBlocked}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

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

function DeliverableCard({
  deliverable: d,
  collabBlocked = false,
}: {
  deliverable: DeliverableRow;
  collabBlocked?: boolean;
}) {
  const paymentStatus = (d.payment?.status as string | undefined) ?? null;
  const paid = paymentStatus === "Done";
  const utr = (d.payment?.utr as string | undefined) ?? null;
  const paymentDate = (d.payment?.payment_date as string | undefined) ?? null;
  const blockedByPartnership = !creatorAcceptedPartnership(d);

  return (
    <article
      className={cn(
        "acc-overview-deliverable",
        paid && "acc-overview-deliverable--paid",
        blockedByPartnership && "acc-overview-deliverable--blocked",
      )}
    >
      <header className="acc-overview-deliverable__head">
        <div className="acc-overview-deliverable__title">
          <span className="acc-overview-deliverable__label">
            {d.deliverable_label}
          </span>
          {d.is_parent ? (
            <span
              className="pill pill--muted"
              title="Payment for the whole collab is raised on this deliverable"
            >
              Primary
            </span>
          ) : (
            <span
              className="pill pill--linked"
              title="Payment is handled on the collab's primary deliverable"
            >
              Linked
            </span>
          )}
        </div>
        <PaymentStatusPill status={paymentStatus} />
      </header>

      <dl className="acc-overview-deliverable__meta">
        <div>
          <dt>Post ID</dt>
          <dd className="tabular">
            {d.post_id_short ?? d.post_id}
            {collabIdOf(d) && (
              <span
                className="text-[0.7rem] text-text-tertiary"
                title="Collab ID — groups all deliverables of this collaboration"
              >
                {" · "}
                {collabIdOf(d)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd className="tabular">{formatDate(d.post_date)}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className="tabular acc-overview-deliverable__amount">
            {formatRupees(d.split_amount)}
          </dd>
        </div>
        <div>
          <dt>Partnership Key</dt>
          <dd className="tabular">
            {d.partnership_id?.trim() || (
              <span className="acc-overview-deliverable__missing">
                <AlertTriangle size={10} aria-hidden /> Not set
              </span>
            )}
          </dd>
        </div>
        {paid && utr && (
          <div>
            <dt>UTR</dt>
            <dd className="tabular">{utr}</dd>
          </div>
        )}
        {paid && paymentDate && (
          <div>
            <dt>Paid On</dt>
            <dd className="tabular">{formatDate(paymentDate)}</dd>
          </div>
        )}
      </dl>

      <footer className="acc-overview-deliverable__foot">
        {d.post_link ? (
          <a
            href={d.post_link}
            target="_blank"
            rel="noopener noreferrer"
            className="acc-overview-deliverable__link"
            title="Open the live IG post and verify before approving payment"
          >
            <ExternalLink size={11} aria-hidden />
            Open on Instagram
          </a>
        ) : (
          <span className="acc-overview-deliverable__link acc-overview-deliverable__link--disabled">
            <AlertTriangle size={11} aria-hidden />
            Post link missing
          </span>
        )}

        {blockedByPartnership && (
          <span
            className="acc-overview-deliverable__block"
            title="Payments stay locked until the creator accepts the partnership request. An admin Partnership Key does not bypass this requirement."
          >
            <Handshake size={11} aria-hidden />
            Partnership approval pending
          </span>
        )}

        {!paid && !blockedByPartnership && !collabBlocked && (
          <span
            className="acc-overview-deliverable__verify"
            title="Open the Instagram link and confirm the creator posted. Then add UTR via the Log Payments form above."
          >
            <CheckCircle2 size={11} aria-hidden />
            Verify, then log payment
          </span>
        )}
      </footer>
    </article>
  );
}
