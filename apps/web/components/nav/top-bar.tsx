"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, RefreshCw, UserCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { stopActingAs } from "@/features/impersonation/actions";

/**
 * Fixed top-right utility cluster (DAM-style): refresh + approvals bell.
 * The bell wears a red badge with the pending-approvals count (cached by the
 * "approvals-count" tag — no per-nav DB reads) and links to /approvals. The
 * count also prefixes the browser tab title so a waiting approval is visible
 * from any tab.
 *
 * While a Global Admin is acting as a team member (lib/impersonation.ts), an
 * amber "Acting as" pill sits beside the cluster on EVERY page — submits are
 * being attributed to that member, so it must never be out of sight.
 */
export function TopBar({
  approvalsCount,
  actingAsName,
}: {
  approvalsCount: number;
  actingAsName?: string | null;
}) {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);
  const [exiting, startExit] = useTransition();

  const exitActingAs = () => {
    startExit(async () => {
      await stopActingAs();
      router.refresh();
    });
  };

  // Prefix the tab title with the pending count, e.g. "(1) Approvals".
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = approvalsCount > 0 ? `(${approvalsCount}) ${base}` : base;
  }, [approvalsCount]);

  const refresh = () => {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 700);
  };

  return (
    <div className="app-topbar-cluster">
      {actingAsName && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
          style={{
            background: "#FAF1DC",
            borderColor: "rgba(181, 117, 20, 0.4)",
            color: "#B57514",
          }}
          title={`Forms you submit are recorded under ${actingAsName}`}
        >
          <UserCheck size={12} aria-hidden />
          <span className="max-w-[140px] truncate">
            Acting as {actingAsName}
          </span>
          <button
            type="button"
            onClick={exitActingAs}
            disabled={exiting}
            aria-label="Stop acting as this member"
            title="Stop acting as this member"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full transition hover:bg-[#B57514]/15 disabled:opacity-60"
          >
            <X size={11} aria-hidden />
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        className="app-topbar-btn"
        aria-label="Refresh data"
        title="Refresh data"
      >
        <RefreshCw
          size={15}
          aria-hidden
          className={cn(spinning && "animate-spin")}
        />
      </button>
      <Link
        href="/approvals"
        className="app-topbar-btn relative"
        aria-label={
          approvalsCount > 0
            ? `${approvalsCount} approval${approvalsCount === 1 ? "" : "s"} waiting`
            : "Approvals"
        }
        title="Approvals"
      >
        <Bell size={15} aria-hidden />
        {approvalsCount > 0 && (
          <span className="app-topbar-badge">
            {approvalsCount > 99 ? "99+" : approvalsCount}
          </span>
        )}
      </Link>
    </div>
  );
}
