"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Handshake,
  Loader2,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import {
  PARTNERSHIP_STATE_LABELS,
  type PartnershipState,
} from "@/lib/partnership";
import {
  resendPartnershipForPost,
  syncPartnershipForPost,
} from "./partnership-actions";

/**
 * Blocking partnership-status popup shown right after a posting submit.
 *
 * Flow: check the creator's live Meta permission → when NO record exists,
 * auto-send the invite (progress bar) → land on the final state. A rejected /
 * revoked creator gets a Resend button. There is deliberately NO close
 * control until the status round-trip finishes — the OK button appears only
 * once the final state (or an error) is known, so the operator always leaves
 * this popup knowing where the partnership stands.
 */
type Phase =
  | "checking" // GET in flight
  | "sending" // POST invite in flight (auto or resend)
  | "done" // terminal state fetched (approved / pending / none-after-fail)
  | "rejected" // terminal, resend offered
  | "error"; // Meta/API error — OK + Retry offered

const PHASE_TITLES: Record<Phase, string> = {
  checking: "Checking partnership status…",
  sending: "Sending partnership request…",
  done: "Partnership status",
  rejected: "Partnership status",
  error: "Partnership status",
};

export function PartnershipFlowModal({
  postId,
  username,
  onDone,
}: {
  postId: string;
  username?: string | null;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [state, setState] = useState<PartnershipState | null>(null);
  const [alreadyExisted, setAlreadyExisted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const startedRef = useRef(false);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulated send progress — ramps to 90% while the request is in flight,
  // jumps to 100% on completion (one HTTP call has no real granularity).
  const startProgress = () => {
    setProgress(8);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 12)) : p));
    }, 180);
  };
  const finishProgress = () => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = null;
    setProgress(100);
  };
  useEffect(
    () => () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    },
    [],
  );

  const runFlow = async () => {
    setPhase("checking");
    setError(null);
    const check = await syncPartnershipForPost(postId, { autoInvite: false });
    if (!check.ok) {
      setError(check.error ?? "Status check failed");
      setPhase("error");
      return;
    }
    setState(check.state);
    if (check.state === "none") {
      // No record yet → auto-send the invite with visible progress.
      setPhase("sending");
      startProgress();
      const sent = await syncPartnershipForPost(postId, { autoInvite: true });
      finishProgress();
      if (!sent.ok) {
        setError(sent.error ?? "Invite send failed");
        setPhase("error");
        return;
      }
      setState(sent.state);
      setPhase(
        sent.state === "rejected" || sent.state === "revoked"
          ? "rejected"
          : "done",
      );
      return;
    }
    setAlreadyExisted(true);
    setPhase(
      check.state === "rejected" || check.state === "revoked"
        ? "rejected"
        : "done",
    );
  };

  useEffect(() => {
    if (startedRef.current) return; // StrictMode double-mount guard
    startedRef.current = true;
    void runFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resend = async () => {
    setPhase("sending");
    startProgress();
    const res = await resendPartnershipForPost(postId);
    finishProgress();
    if (!res.ok) {
      setError(res.error ?? "Resend failed");
      setPhase("error");
      return;
    }
    setState(res.state);
    setPhase("done");
    toast.success(`Partnership request resent to @${username ?? "creator"}.`);
  };

  const busy = phase === "checking" || phase === "sending";

  const stateVisual = (() => {
    if (phase === "error")
      return {
        icon: AlertCircle,
        iconWrap: "bg-danger-bg text-danger",
        label: "Couldn't fetch the partnership status",
        sub: error,
      };
    if (!state) return null;
    switch (state) {
      case "approved":
        return {
          icon: CheckCircle2,
          iconWrap: "bg-success-bg text-success",
          label: alreadyExisted
            ? "Partner already exists — approved"
            : PARTNERSHIP_STATE_LABELS.approved,
          sub: "Payments and ad usage for this creator are unblocked.",
        };
      case "pending":
        return {
          icon: Clock3,
          iconWrap: "bg-warning-bg text-warning",
          label: alreadyExisted
            ? "Invite already sent — awaiting the creator"
            : "Invite sent — awaiting the creator",
          sub: "The creator approves it from their Instagram professional dashboard. Track it on the Partnership Status tab.",
        };
      case "rejected":
      case "revoked":
        return {
          icon: XCircle,
          iconWrap: "bg-danger-bg text-danger",
          label:
            state === "rejected"
              ? "Rejected by the creator"
              : "Revoked by the creator",
          sub: "You can send a fresh request with the Resend button, or close and resend later from the Partnership Status tab.",
        };
      default:
        return {
          icon: Handshake,
          iconWrap: "bg-bg-muted text-text-tertiary",
          label: PARTNERSHIP_STATE_LABELS[state],
          sub: null,
        };
    }
  })();

  // Ghost + primary button styles are self-contained: the global `.btn` /
  // `.modal-foot` rules are scoped to `.modal-panel--onboarding` and don't
  // reach this panel.
  const ghostBtn =
    "inline-flex min-h-[2.35rem] items-center justify-center gap-1.5 rounded-[10px] border border-border bg-bg-white px-4 py-2 text-[0.8rem] font-semibold text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary";

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding z-[120]">
      <div
        className="w-[min(94vw,440px)] overflow-hidden rounded-[16px] border border-border bg-bg-white shadow-[0_18px_50px_-12px_rgba(22,21,19,0.28)]"
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy}
        aria-label="Partnership request status"
      >
        <header className="flex items-center gap-2.5 border-b border-border-soft px-5 py-3.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-bg-ecru text-text-secondary">
            <Handshake size={14} aria-hidden />
          </span>
          <h2 className="min-w-0 truncate text-[0.9rem] font-bold text-text-primary">
            Partnership request
          </h2>
          {username && (
            <span className="ml-auto shrink-0 rounded-full border border-border bg-bg-surface px-2.5 py-1 font-mono text-[0.68rem] text-text-secondary">
              @{username}
            </span>
          )}
          {/* No close control while fetching — by design. */}
        </header>

        <div className="flex min-h-[172px] flex-col items-center justify-center gap-3.5 px-7 py-8 text-center">
          {busy ? (
            <>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-bg-muted text-text-tertiary">
                <Loader2 size={22} className="animate-spin" aria-hidden />
              </span>
              <p className="text-[0.92rem] font-bold text-text-primary">
                {PHASE_TITLES[phase]}
              </p>
              {phase === "checking" ? (
                <p className="max-w-[36ch] text-[0.76rem] leading-relaxed text-text-secondary">
                  Fetching the live status from Instagram…
                </p>
              ) : (
                <div className="w-full max-w-[280px]">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-[0.72rem] font-semibold tabular text-text-secondary">
                      {progress}%
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            stateVisual && (
              <>
                <span
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-full",
                    stateVisual.iconWrap,
                  )}
                >
                  <stateVisual.icon size={22} aria-hidden />
                </span>
                <p className="text-[0.92rem] font-bold text-text-primary">
                  {stateVisual.label}
                </p>
                {stateVisual.sub && (
                  <p className="max-w-[40ch] text-[0.76rem] leading-relaxed text-text-secondary">
                    {stateVisual.sub}
                  </p>
                )}
              </>
            )
          )}
        </div>

        {!busy && (
          <footer className="flex items-center justify-end gap-2 border-t border-border-soft bg-bg-surface px-5 py-3.5">
            {phase === "error" && (
              <button
                type="button"
                className={ghostBtn}
                onClick={() => void runFlow()}
              >
                <RotateCcw size={13} aria-hidden />
                Retry
              </button>
            )}
            {phase === "rejected" ? (
              <>
                <button type="button" className={ghostBtn} onClick={onDone}>
                  OK
                </button>
                <button
                  type="button"
                  className="btn-primary-cta"
                  onClick={resend}
                >
                  <Send size={13} aria-hidden />
                  Resend request
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-primary-cta"
                onClick={onDone}
              >
                OK
              </button>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
