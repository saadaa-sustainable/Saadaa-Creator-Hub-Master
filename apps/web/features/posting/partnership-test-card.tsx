"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  checkTestPartnershipStatus,
  sendTestPartnershipInvite,
  type PartnershipStatusResult,
} from "./partnership-actions";
import type { PartnershipState } from "@/lib/meta-partnership";

const STATE_META: Record<
  PartnershipState,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  approved: { label: "Approved — partner exists", color: "#4F7C4D", bg: "#ECF1E9", icon: CheckCircle2 },
  pending: { label: "Pending — invite sent", color: "#B57514", bg: "#FAF1DC", icon: Clock3 },
  rejected: { label: "Rejected by the creator — can resend", color: "#C0392B", bg: "#FDECEA", icon: XCircle },
  revoked: { label: "Revoked by the creator — can resend", color: "#C0392B", bg: "#FDECEA", icon: XCircle },
  none: { label: "No partnership yet", color: "#6E695E", bg: "#F0EDE6", icon: RotateCcw },
  unknown: { label: "Status unavailable", color: "#6E695E", bg: "#F0EDE6", icon: RotateCcw },
};

/** Meta reports "Canceled" for a creator-declined request — show it as "Rejected". */
function prettyRawStatus(raw: string | null): string | null {
  if (!raw) return null;
  return /cancel/i.test(raw) ? "Rejected" : raw;
}

export function PartnershipTestCard() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PartnershipStatusResult | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);

  const checkStatus = () => {
    start(async () => {
      const res = await checkTestPartnershipStatus();
      setResult(res);
      setSendNote(null);
      if (!res.ok) toast.error(res.error);
    });
  };

  // Auto-load the live status on open so a decline/approval shows without a
  // manual click (read-only). Silent on error — the Check status button surfaces it.
  useEffect(() => {
    start(async () => {
      const res = await checkTestPartnershipStatus();
      setResult(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendInvite = () => {
    if (
      !window.confirm(
        "Send a REAL partnership invite to @saadaa_women on Instagram? This is an outward action to validate the write path.",
      )
    )
      return;
    start(async () => {
      const res = await sendTestPartnershipInvite();
      setResult(res.statusAfter);
      if (res.sent.ok) {
        setSendNote(
          `Invite sent ✓ (permission id: ${res.sent.permissionId ?? "—"}${res.sent.rawStatus ? `, ${res.sent.rawStatus}` : ""})`,
        );
        toast.success("Test invite sent to @saadaa_women.");
      } else {
        setSendNote(`Send failed: ${res.sent.error}`);
        toast.error(`Send failed: ${res.sent.error}`);
      }
    });
  };

  const sm = result?.ok ? STATE_META[result.status.state] : null;

  return (
    <section className="rounded-[14px] border border-dashed border-[#C9A882] bg-[#FFFCF5] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent/15 text-[#B57514]">
          <ShieldCheck size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-[0.85rem] font-bold text-text-primary">
            Partnership invite — test
          </h3>
          <p className="text-[0.7rem] text-text-tertiary">
            Validate the Meta write path on the controlled{" "}
            <span className="font-mono">@saadaa_women</span> account before rollout.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={checkStatus}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-bg-white px-3 py-1.5 text-[0.76rem] font-semibold text-text-secondary transition-colors hover:bg-bg-alt"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Check status
          </button>
          <button
            type="button"
            onClick={sendInvite}
            disabled={pending}
            className="btn-primary-cta"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send test invite
          </button>
        </div>
      </div>

      {(result || sendNote) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-soft pt-3 text-[0.76rem]">
          {sm && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
              style={{ background: sm.bg, color: sm.color }}
            >
              <sm.icon size={12} aria-hidden />
              {sm.label}
            </span>
          )}
          {result?.ok && result.status.permissionId && (
            <span className="font-mono text-[0.68rem] text-text-tertiary">
              perm {result.status.permissionId}
              {result.status.rawStatus
                ? ` · ${prettyRawStatus(result.status.rawStatus)}`
                : ""}
            </span>
          )}
          {result && !result.ok && (
            <span className="text-danger-text">{result.error}</span>
          )}
          {sendNote && (
            <span className="ml-auto text-text-secondary">{sendNote}</span>
          )}
        </div>
      )}
    </section>
  );
}
