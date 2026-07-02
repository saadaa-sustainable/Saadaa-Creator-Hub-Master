"use client";
import { AlertTriangle, Handshake, ShieldCheck } from "lucide-react";
import { Avatar, DeactivatedBadge } from "@/components/ui";
import { PartnershipBadge } from "@/components/ui/status-pill";
import { formatDate, formatRupees } from "@/lib/formatters";
import { partnershipApproved } from "@/lib/partnership";
import { computeMatchStatus, type MatchStatus } from "@/lib/payable-cycle";
import type { AccountsRow } from "./types";

/** Pill colors per payment status — legacy parity (.kb-pill.*). */
export function PaymentStatusPill({
  status,
}: {
  status: string | null | undefined;
}) {
  const value = String(status ?? "").trim();
  if (!value) {
    return <span className="kb-pill kb-pill--muted">No Payment</span>;
  }
  if (value === "Done") {
    return <span className="kb-pill kb-pill--done">Paid</span>;
  }
  if (value === "Partial") {
    return (
      <span
        className="kb-pill kb-pill--warning"
        title="Part of the agreed amount has been paid — a balance is still outstanding."
      >
        Partial
      </span>
    );
  }
  if (value === "Due") {
    return <span className="kb-pill kb-pill--due">Due</span>;
  }
  if (value === "Not Due") {
    return <span className="kb-pill kb-pill--not-due">Not Due</span>;
  }
  return <span className="kb-pill kb-pill--muted">{value}</span>;
}

/**
 * Outstanding-balance pill — shown on partially-paid collabs (an installment
 * is recorded but the agreed total isn't met yet). Surfaces the remaining
 * amount the operator still has to pay. Part of the user's "full payment not
 * done" alert.
 */
export function RemainderPill({ row }: { row: AccountsRow }) {
  if (!row._isPartial) return null;
  const remainder = Number(row._remainder ?? 0);
  if (remainder <= 0) return null;
  const total = Number(row.commercial_amount ?? 0);
  const paid = Number(row._paidSoFar ?? 0);
  return (
    <span
      className="kb-pill kb-pill--warning"
      title={`Paid ${formatRupees(paid)} of ${formatRupees(total)}. Balance pending.`}
    >
      <AlertTriangle size={10} aria-hidden />
      {formatRupees(remainder)} due
    </span>
  );
}

/** Match-status pill (computed live; not stored on DB). */
export function MatchStatusPill({ row }: { row: AccountsRow }) {
  // Partial collabs are surfaced by the RemainderPill instead — a partial is a
  // deliberate installment, NOT a mismatch, so don't flag it as "Off by".
  if (row._isPartial) return null;
  // Compare paid-so-far (sum of installments) against the agreed total so a
  // fully-paid-over-multiple-installments collab still reads as Matched.
  const paid = Number(row._paidSoFar ?? row.payment?.amount ?? 0);
  const commercial = Number(row.commercial_amount ?? 0);
  const status: MatchStatus = computeMatchStatus(paid, commercial);
  // Only show after a real payment is logged (UTR present). Draft rows have
  // amount = commercial_amount pre-filled but no actual money moved.
  if (paid <= 0 || !row.payment?.utr) return null;
  const tone =
    status === "Matched with Creator Hub"
      ? "kb-pill--done"
      : status === "Not Matched with Creator Hub"
        ? "kb-pill--danger"
        : "kb-pill--muted";
  const label =
    status === "Matched with Creator Hub"
      ? "Matched"
      : status === "Not Matched with Creator Hub"
        ? `Off by ${formatRupees(Math.abs(paid - commercial))}`
        : "Unverified";
  return (
    <span className={`kb-pill ${tone}`} title={status}>
      {label}
    </span>
  );
}

/**
 * Ads-rights pill — partnership state for ad-eligible collabs.
 * Shown only when ads_usage_rights ≠ none. Approved (creator accepted the
 * Meta request, or admin override) keeps the info pill; anything else renders
 * the shared PartnershipBadge so the exact state (invite pending / rejected /
 * no partnership yet) is visible while Done payments stay blocked.
 */
export function AdsPartnershipPill({ row }: { row: AccountsRow }) {
  const raw = String(row.ads_usage_rights ?? "").trim().toLowerCase();
  if (!raw || ["no", "none", "n/a", "0", "false"].includes(raw)) return null;
  if (partnershipApproved(row)) {
    return (
      <span
        className="kb-pill kb-pill--info"
        title="Partnership approved by the creator — payments unblocked"
      >
        <ShieldCheck size={10} aria-hidden />
        Partnership approved
      </span>
    );
  }
  return (
    <span title="Done payments blocked until the creator approves">
      <PartnershipBadge status={row.partnership_status} showEmpty />
    </span>
  );
}

/**
 * "Not Tested" pill — the payment was logged while the post's ad had not yet
 * been tested (mirrors the Ad Status view). Stored on
 * payments.posted_but_not_tested; auto-cleared by recomputePaymentStates once
 * the ad becomes tested. Annotation only — the payment was still allowed.
 */
export function PostedNotTestedPill({ row }: { row: AccountsRow }) {
  if (row.payment?.posted_but_not_tested !== true) return null;
  return (
    <span
      className="kb-pill kb-pill--due"
      title="Paid before the ad was tested. Clears automatically once the ad is tested (see Ad Status)."
    >
      <AlertTriangle size={10} aria-hidden />
      Not Tested
    </span>
  );
}

export function CreatorCell({ row }: { row: AccountsRow }) {
  return (
    <div className="ob-creator-cell">
      <Avatar
        src={row.creator?.profile_pic}
        username={row.creator?.username}
        name={row.creator?.inf_name}
        size={36}
        className="ob-creator-avatar"
      />
      <div className="min-w-0">
        <div className="creator-name">{row.creator?.inf_name ?? "—"}</div>
        <div className="creator-handle">@{row.creator?.username ?? "—"}</div>
        {row.creator?.is_active === false && (
          <DeactivatedBadge isActive={row.creator?.is_active} className="mt-1" />
        )}
      </div>
    </div>
  );
}

export function AmountCell({ row }: { row: AccountsRow }) {
  // Always show the agreed collab total (commercial_amount holds the summed
  // collab total on the representative row). For partial collabs we add a
  // "paid of total" subline so the operator sees progress at a glance.
  const total = row.commercial_amount ?? row.payment?.amount;
  if (row._isPartial) {
    const paid = Number(row._paidSoFar ?? 0);
    return (
      <span className="tabular">
        {total != null ? formatRupees(Number(total)) : "—"}
        <span className="block text-[0.65rem] text-warning-text leading-tight">
          {formatRupees(paid)} paid
        </span>
      </span>
    );
  }
  return (
    <span className="tabular">
      {total != null ? formatRupees(Number(total)) : "—"}
    </span>
  );
}

export function UtrCell({ row }: { row: AccountsRow }) {
  const utr = row.payment?.utr?.trim();
  if (!utr) {
    return <span className="text-text-tertiary text-xs">UTR pending</span>;
  }
  return <span className="tabular text-xs">{utr}</span>;
}

export function DueDateCell({ row }: { row: AccountsRow }) {
  const due = row.payment?.due_date;
  return (
    <span className="tabular text-xs text-text-secondary">
      {formatDate(due)}
    </span>
  );
}

export function EstPayableCell({ row }: { row: AccountsRow }) {
  const est = row.payment?.estimated_payable_date;
  if (!est) return <span className="text-text-tertiary text-xs">—</span>;
  return (
    <span className="tabular text-xs" title="Next 15th / 30th cycle">
      <Handshake size={10} className="inline mr-1" aria-hidden />
      {formatDate(est)}
    </span>
  );
}

export function PaymentDateCell({ row }: { row: AccountsRow }) {
  const date = row.payment?.payment_date;
  if (!date || row.payment?.status !== "Done") {
    return <span className="text-text-tertiary text-xs">—</span>;
  }
  return (
    <span className="tabular text-xs text-success-text">
      {formatDate(date)}
    </span>
  );
}
