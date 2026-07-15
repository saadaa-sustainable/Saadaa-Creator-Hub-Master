"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Gauge, RefreshCw, UserCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { stopActingAs } from "@/features/impersonation/actions";

interface MetaGateState {
  coolingDown: boolean;
  retryAfterSec: number;
  count: number;
  limit: number;
  usagePct: number;
  tokenMode: "main" | "temporary";
  /** Days until the MAIN Meta token expires (null = never / unknown). */
  tokenDaysLeft: number | null;
  tokenExpiresAt: number | null;
}

/** Fired by the Reach Out forms right after a Fetch completes so the header
 *  pill updates immediately instead of waiting for the next 30s poll. */
export const META_FETCH_EVENT = "ch:meta-fetch";

/**
 * Live Meta fetch-state pill — the team's answer to "is Fetch broken?".
 * Polls /api/meta-gate every 30s (10s while cooling), refreshes instantly on
 * META_FETCH_EVENT, and ticks the cooldown countdown locally every second.
 * Neutral = calls used this pacing window (+ Meta's own quota % when known);
 * amber countdown = the app is pacing itself so Meta doesn't hard-block the
 * whole token; extra pill when a staged temporary token is active.
 */
function MetaGatePill() {
  const [gate, setGate] = useState<MetaGateState | null>(null);
  const gateRef = useRef<MetaGateState | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const poll = async () => {
      if (timer) window.clearTimeout(timer);
      try {
        const res = await fetch("/api/meta-gate", { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as MetaGateState;
          if (alive) {
            gateRef.current = next;
            setGate(next);
          }
        }
      } catch {
        // network blip — keep the last known state
      }
      if (alive) {
        timer = window.setTimeout(
          poll,
          gateRef.current?.coolingDown ? 10_000 : 30_000,
        );
      }
    };
    void poll();

    // A Fetch just ran somewhere on this page — reflect it right away.
    const onFetch = () => void poll();
    window.addEventListener(META_FETCH_EVENT, onFetch);

    // 1s local countdown between polls.
    const tick = window.setInterval(() => {
      const g = gateRef.current;
      if (!g?.coolingDown) return;
      const next = {
        ...g,
        retryAfterSec: Math.max(0, g.retryAfterSec - 1),
        coolingDown: g.retryAfterSec - 1 > 0,
      };
      gateRef.current = next;
      setGate(next);
    }, 1000);

    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(META_FETCH_EVENT, onFetch);
      window.clearInterval(tick);
    };
  }, []);

  if (!gate) return null;

  const mmss = `${Math.floor(gate.retryAfterSec / 60)}:${String(
    gate.retryAfterSec % 60,
  ).padStart(2, "0")}`;

  const tokenPill = (() => {
    if (gate.tokenDaysLeft == null) return null;
    const d = gate.tokenDaysLeft;
    const expiresText = gate.tokenExpiresAt
      ? new Date(gate.tokenExpiresAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
    const tone =
      d <= 3
        ? { background: "#FDECEA", borderColor: "rgba(192,57,43,0.4)", color: "#C0392B" }
        : d <= 10
          ? { background: "#FAF1DC", borderColor: "rgba(181,117,20,0.4)", color: "#B57514" }
          : {
              background: "var(--bg-surface, #F5F1EC)",
              borderColor: "var(--border, #E7E2D2)",
              color: "#6E695E",
            };
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-bold tabular-nums"
        style={tone}
        title={`The Meta access token expires in ${d} day${d === 1 ? "" : "s"}${expiresText ? ` (${expiresText})` : ""}. It does NOT renew itself — generate a fresh long-lived token before then or Instagram fetching stops.`}
      >
        Token {d}d
      </span>
    );
  })();

  return (
    <>
      {tokenPill}
      {gate.tokenMode === "temporary" && (
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-bold"
          style={{
            background: "#FAF1DC",
            borderColor: "rgba(181, 117, 20, 0.4)",
            color: "#B57514",
          }}
          title="A temporary backup Meta token is active — reverts to the main token automatically at its expiry"
        >
          Backup token
        </span>
      )}
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold tabular-nums"
        style={
          gate.coolingDown
            ? {
                background: "#FAF1DC",
                borderColor: "rgba(181, 117, 20, 0.4)",
                color: "#B57514",
              }
            : {
                background: "var(--bg-surface, #F5F1EC)",
                borderColor: "var(--border, #E7E2D2)",
                color: "#6E695E",
              }
        }
        title={
          gate.coolingDown
            ? `Instagram fetch is cooling down — new fetches resume in ${mmss}. The app paces itself so Meta doesn't block the whole token.`
            : `Instagram fetch is available — ${gate.count} of ${gate.limit} calls this window (cache-served fetches are free and don't count).${
                gate.usagePct > 0
                  ? ` Meta's own hourly quota is at ${gate.usagePct}%.`
                  : ""
              } Pauses only happen when Meta's quota runs hot (60%+ = 1-min breather per ${gate.limit} calls, 75%+ = 5-min cooldown).`
        }
      >
        <Gauge size={12} aria-hidden />
        {gate.coolingDown
          ? `Meta cooling · ${mmss}`
          : `Meta ${gate.count}/${gate.limit}${gate.usagePct > 0 ? ` · ${gate.usagePct}%` : ""}`}
      </span>
    </>
  );
}

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
  isAdmin = true,
}: {
  approvalsCount: number;
  actingAsName?: string | null;
  /** Non-admins see the cluster too (refresh + Meta pill) — just no bell. */
  isAdmin?: boolean;
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
      <MetaGatePill />
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
      {isAdmin && (
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
      )}
    </div>
  );
}
