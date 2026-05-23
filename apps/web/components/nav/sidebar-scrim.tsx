"use client";

import { useEffect } from "react";
import { useSidebar } from "@/stores/sidebar-store";
import { cn } from "@/lib/cn";

export function SidebarScrim() {
  const isOpen = useSidebar((s) => s.isOpen);
  const close = useSidebar((s) => s.close);

  // Close on ESC; lock body scroll while open on mobile.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, close]);

  return (
    <div
      className={cn("sidebar-scrim", isOpen && "is-open")}
      onClick={close}
      aria-hidden
    />
  );
}
