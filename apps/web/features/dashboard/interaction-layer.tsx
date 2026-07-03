"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const TARGET_SELECTOR = [
  ".onboarding-filter-card",
  ".acc-kpi",
  ".bento-tile",
  ".dashboard-overview-band",
  ".dashboard-kanban-track > *",
  ".ob-card",
  ".journey-column",
  ".journey-card",
].join(",");

export function DashboardInteractionLayer({
  children,
  className,
  variant = "main",
}: {
  children: ReactNode;
  className?: string;
  variant?: "main" | "personal" | "historic";
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    root.dataset.motion = prefersReduced
      ? "reduced"
      : isCoarsePointer
        ? "lite"
        : "full";

    const observed = new WeakSet<Element>();
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          // One-shot: reveal once, then leave the card alone. Toggling the
          // attribute off on exit replayed the rise on every re-entry, which
          // read as the page endlessly refreshing while scrolling.
          entry.target.setAttribute("data-inview", "");
          revealObserver.unobserve(entry.target);
        }
      },
      // Positive bottom margin arms cards ~200px BELOW the fold, so the rise
      // finishes before the card is actually seen — never caught mid-flight.
      { rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );

    const scanTargets = () => {
      root.querySelectorAll(TARGET_SELECTOR).forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        element.setAttribute("data-dashboard-card", "");
        revealObserver.observe(element);
      });
    };

    scanTargets();
    const mutationObserver = new MutationObserver(scanTargets);
    mutationObserver.observe(root, { childList: true, subtree: true });

    let rafId = 0;
    let latestEvent: PointerEvent | null = null;

    const applyPointer = () => {
      rafId = 0;
      if (!latestEvent) return;
      const rect = root.getBoundingClientRect();
      const x = (latestEvent.clientX - rect.left) / Math.max(rect.width, 1);
      const y = (latestEvent.clientY - rect.top) / Math.max(rect.height, 1);
      const dx = Math.max(-0.5, Math.min(0.5, x - 0.5));
      const dy = Math.max(-0.5, Math.min(0.5, y - 0.5));

      root.style.setProperty("--dash-bg-x", `${(-dx * 12).toFixed(2)}px`);
      root.style.setProperty("--dash-bg-y", `${(-dy * 10).toFixed(2)}px`);
      root.style.setProperty("--dash-card-x", `${(dx * 3).toFixed(2)}px`);
      root.style.setProperty("--dash-card-y", `${(dy * 2).toFixed(2)}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (prefersReduced || isCoarsePointer || event.pointerType !== "mouse") {
        return;
      }
      latestEvent = event;
      if (!rafId) rafId = requestAnimationFrame(applyPointer);
    };

    const resetPointer = () => {
      latestEvent = null;
      root.style.setProperty("--dash-bg-x", "0px");
      root.style.setProperty("--dash-bg-y", "0px");
      root.style.setProperty("--dash-card-x", "0px");
      root.style.setProperty("--dash-card-y", "0px");
    };

    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", resetPointer);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", resetPointer);
      mutationObserver.disconnect();
      revealObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn("dashboard-interactive-shell", className)}
      data-dashboard-interactive
      data-variant={variant}
    >
      {children}
    </div>
  );
}
