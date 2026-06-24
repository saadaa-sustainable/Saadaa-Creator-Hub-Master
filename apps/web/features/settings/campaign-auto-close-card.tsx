"use client";

import { useState, useTransition } from "react";
import { Power } from "lucide-react";
import { toast } from "sonner";
import { setCampaignAutoCloseEnabled } from "./actions";

// Workflow preference — campaign auto-close. Saadaa runs a daily cron that closes a
// campaign once its end date passes. This admin toggle pauses that automation
// (backlog mode). Optimistic with rollback on error.
export function CampaignAutoCloseCard({
  enabled: initial,
}: {
  enabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const res = await setCampaignAutoCloseEnabled(next);
      if (!res.success) {
        setEnabled(!next);
        toast.error(res.error ?? "Could not update auto-close");
      } else {
        toast.success(
          next ? "Auto-close enabled" : "Auto-close disabled (backlog mode)",
        );
      }
    });
  };

  return (
    <section className="rounded-[14px] border border-[#E7E2D2] bg-white p-4 sm:p-5">
      <h2 className="mb-3 text-[15px] font-semibold text-[#161513]">
        Workflow preferences
      </h2>
      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[#E7E2D2] bg-[#FBFAF6] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Power
            size={16}
            className={enabled ? "text-[#4F7C4D]" : "text-[#9A9384]"}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#161513]">
              Campaign auto-close
            </p>
            <p className="text-[11.5px] leading-snug text-[#9A9384]">
              {enabled
                ? "On — the daily cron closes a campaign once its end date passes."
                : "Off (backlog mode) — campaigns stay open so the team can backfill collabs."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle campaign auto-close"
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
          style={{ background: enabled ? "#4F7C4D" : "#C9C2AE" }}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: enabled ? "translateX(22px)" : "translateX(2px)" }}
          />
        </button>
      </div>
    </section>
  );
}
