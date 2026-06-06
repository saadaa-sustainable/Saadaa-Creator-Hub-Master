"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveToOffboarding } from "./actions";

/**
 * Move-to-Offboarding entry point. Operator enters a Post ID (from Order
 * Status / Journey) and confirms; the server action sets the whole collab
 * episode to the terminal 'Offboarding' status. Gated upstream to
 * `offboarding_write` — this panel only renders when the actor holds it.
 */
export function MoveToOffboardingPanel() {
  const router = useRouter();
  const [postId, setPostId] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { ok: true; msg: string } | { ok: false; msg: string } | null
  >(null);

  const submit = () => {
    const id = postId.trim();
    if (!id) {
      setFeedback({ ok: false, msg: "Enter a Post ID first." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await moveToOffboarding(id);
      if (res.ok) {
        setFeedback({
          ok: true,
          msg: `Moved ${res.movedCount} deliverable${res.movedCount === 1 ? "" : "s"} to Offboarding.`,
        });
        setPostId("");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <div className="onboarding-filter-card mt-4">
      <div className="flex items-center gap-2 mb-2 text-text-primary">
        <UserMinus size={15} aria-hidden />
        <strong className="text-sm">Move a collab to Offboarding</strong>
      </div>
      <p className="text-xs text-text-secondary mb-3">
        Terminal stage. The whole collab episode is parked here and exits the
        active pipeline, but stays visible in Accounts Hub until fully paid.
        This cannot be reversed from this screen.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="onboarding-filter-field flex-1 min-w-[200px]">
          <span>Post ID</span>
          <input
            type="text"
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. SIF-123-1"
            className="onboarding-filter-select"
            disabled={pending}
          />
        </label>
        <Button
          variant="danger"
          size="sm"
          onClick={submit}
          loading={pending}
          className="gap-1.5"
        >
          <UserMinus className="h-3.5 w-3.5" aria-hidden /> Move to Offboarding
        </Button>
      </div>
      {feedback && (
        <p
          className={
            feedback.ok
              ? "mt-2 text-xs font-semibold text-success flex items-center gap-1"
              : "mt-2 text-xs font-semibold text-danger flex items-center gap-1"
          }
        >
          {!feedback.ok && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
