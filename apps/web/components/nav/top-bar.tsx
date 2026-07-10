"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Fixed top-right utility cluster (DAM-style): refresh + approvals bell.
 * The bell wears a red badge with the pending-approvals count (cached by the
 * "approvals-count" tag — no per-nav DB reads) and links to /approvals. The
 * count also prefixes the browser tab title so a waiting approval is visible
 * from any tab.
 */
export function TopBar({ approvalsCount }: { approvalsCount: number }) {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

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
