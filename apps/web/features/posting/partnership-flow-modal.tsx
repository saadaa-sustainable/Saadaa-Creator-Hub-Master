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
        icon: <AlertCircle size={30} className="text-danger" aria-hidden />,
        label: "Couldn't fetch the partnership status",
        sub: error,
      };
    if (!state) return null;
    switch (state) {
      case "approved":
        return {
          icon: <CheckCircle2 size={30} className="text-success" aria-hidden />,
          label: alreadyExisted
            ? "Partner already exists — approved"
            : PARTNERSHIP_STATE_LABELS.approved,
          sub: "Payments and ad usage for this creator are unblocked.",
        };
      case "pending":
        return {
          icon: <Clock3 size={30} className="text-warning" aria-hidden />,
          label: alreadyExisted
            ? "Invite already sent — pending the creator's approval"
            : "Invite sent — pending the creator's approval",
          sub: "The creator approves it from their Instagram professional dashboard.",
        };
      case "rejected":
      case "revoked":
        return {
          icon: <XCircle size={30} className="text-danger" aria-hidden />,
          label: PARTNERSHIP_STATE_LABELS[state],
          sub: "You can send a fresh request with the Resend button.",
        };
      default:
        return {
          icon: <Handshake size={30} className="text-text-tertiary" aria-hidden />,
          label: PARTNERSHIP_STATE_LABELS[state],
          sub: null,
        };
    }
  })();

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding z-[120]">
      <div
        className="modal-panel w-[min(94vw,430px)] p-0"
        role="alertdialog"
        aria-modal="true"
        aria-label="Partnership status"
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Handshake size={16} aria-hidden />
            <h2 className="font-semibold">Partnership request</h2>
            {username && (
              <span className="chip text-[10px] tabular">@{username}</span>
            )}
          </div>
          {/* No close control while fetching — by design. */}
        </header>

        <div className="flex flex-col items-center gap-3 px-6 py-7 text-center">
          {busy ? (
            <>
              <Loader2 size={30} className="animate-spin text-text-tertiary" />
              <p className="text-[0.9rem] font-semibold text-text-primary">
                {PHASE_TITLES[phase]}
              </p>
              {phase === "sending" && (
                <div className="w-full max-w-[280px]">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-bg-muted">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.72rem] tabular text-text-tertiary">
                    {progress}%
                  </p>
                </div>
              )}
            </>
          ) : (
            stateVisual && (
              <>
                {stateVisual.icon}
                <p className="text-[0.9rem] font-semibold text-text-primary">
                  {stateVisual.label}
                </p>
                {stateVisual.sub && (
                  <p className="text-[0.76rem] leading-relaxed text-text-secondary">
                    {stateVisual.sub}
                  </p>
                )}
              </>
            )
          )}
        </div>

        <footer className="modal-foot justify-center gap-2">
          {phase === "rejected" && (
            <button type="button" className="btn-primary-cta" onClick={resend}>
              <Send size={13} aria-hidden />
              Resend request
            </button>
          )}
          {phase === "error" && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void runFlow()}
            >
              <RotateCcw size={13} aria-hidden />
              Retry
            </button>
          )}
          {!busy && (
            <button
              type="button"
              className={cn(
                phase === "rejected" || phase === "error"
                  ? "btn btn-ghost"
                  : "btn-primary-cta",
              )}
              onClick={onDone}
            >
              OK
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
