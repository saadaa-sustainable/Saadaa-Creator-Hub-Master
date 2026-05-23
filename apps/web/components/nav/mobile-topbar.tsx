"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/stores/sidebar-store";

export function MobileTopbar() {
  const open = useSidebar((s) => s.open);

  return (
    <header className="mobile-topbar" aria-label="Mobile header">
      <button
        type="button"
        className="hamburger-btn"
        onClick={open}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <div className="brand-text">
        <span className="logo-badge">SA</span>
        <span className="brand-title">Saadaa Creator Hub</span>
      </div>
    </header>
  );
}
