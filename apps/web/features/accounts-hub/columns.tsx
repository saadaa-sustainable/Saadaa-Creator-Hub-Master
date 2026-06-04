"use client";
import { AlertTriangle, Handshake, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui";
import { formatDate, formatRupees } from "@/lib/formatters";
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
  if (value === "Due") {
    return <span className="kb-pill kb-pill--due">Due</span>;
  }
  if (value === "Not Due") {
    return <span className="kb-pill kb-pill--not-due">Not Due</span>;
  }
  return <span className="kb-pill kb-pill--muted">{value}</span>;
}

/** Match-status pill (computed live; not stored on DB). */
export function MatchStatusPill({ row }: { row: AccountsRow }) {
  const paid = Number(row.payment?.amount ?? 0);
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
 * Ads-rights pill — legacy "Partnered" / "No Partnership" badge.
 * Shown only when ads_usage_rights ≠ none, with danger tone when no
 * partnership_id + not validated.
 */
export function AdsPartnershipPill({ row }: { row: AccountsRow }) {
  const raw = String(row.ads_usage_rights ?? "").trim().toLowerCase();
  if (!raw || ["no", "none", "n/a", "0", "false"].includes(raw)) return null;
  const hasPartnership =
    row.ad_partnership_valid === true ||
    (row.partnership_id ?? "").trim().length > 0;
  if (hasPartnership) {
    return (
      <span className="kb-pill kb-pill--info" title="Ad partnership validated">
        <ShieldCheck size={10} aria-hidden />
        Partnered
      </span>
    );
  }
  return (
    <span
      className="kb-pill kb-pill--danger"
      title="Ads Usage Rights = Yes but no partnership_id set. Done payments are blocked."
    >
      <AlertTriangle size={10} aria-hidden />
      No Partnership
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
      </div>
    </div>
  );
}

export function AmountCell({ row }: { row: AccountsRow }) {
  const paid = row.payment?.amount;
  const commercial = row.commercial_amount;
  const value = paid ?? commercial;
  return (
    <span className="tabular">
      {value != null ? formatRupees(Number(value)) : "—"}
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
