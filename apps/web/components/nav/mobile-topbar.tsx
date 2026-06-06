"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/stores/sidebar-store";

const SECTION_TITLES: Array<[string, string]> = [
  ["/accounts-hub", "Accounts Hub"],
  ["/admin/users", "User Panel"],
  ["/campaigns/new", "New Campaign"],
  ["/campaigns", "Campaigns"],
  ["/compliance", "Compliance"],
  ["/cost-analytics", "Cost Analytics"],
  ["/creators", "Creator Profile"],
  ["/dashboard", "Dashboard"],
  ["/errors", "Error Portal"],
  ["/funnel", "Funnel"],
  ["/internal-dashboard", "Internal Dashboard"],
  ["/journey", "Influencer Journey"],
  ["/my-dashboard", "My Dashboard"],
  ["/offboarding", "Offboarding"],
  ["/onboarding", "Creator Onboarding"],
  ["/order-status", "Order Status"],
  ["/orders", "Orders"],
  ["/performance/ad-run-status", "Ad Run Status"],
  ["/performance/untested-ads", "Untested Ads"],
  ["/posting", "Posting Data"],
  ["/reach-out/inbound", "Reach Out: Inbound"],
  ["/reach-out/outbound", "Reach Out: Outbound"],
  ["/sheets", "Sheet View"],
  ["/tat", "TAT"],
];

function getSectionTitle(pathname: string) {
  return (
    SECTION_TITLES.find(
      ([href]) => pathname === href || pathname.startsWith(`${href}/`),
    )?.[1] ?? "Workspace"
  );
}

export function MobileTopbar() {
  const open = useSidebar((s) => s.open);
  const isOpen = useSidebar((s) => s.isOpen);
  const pathname = usePathname();
  const sectionTitle = getSectionTitle(pathname);

  return (
    <header className="mobile-topbar" aria-label="Mobile header">
      <button
        type="button"
        className="hamburger-btn"
        onClick={open}
        aria-controls="primary-navigation"
        aria-expanded={isOpen}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <div className="brand-text">
        <span className="logo-badge">SA</span>
        <span className="brand-stack">
          <span className="brand-title">{sectionTitle}</span>
          <span className="brand-subtitle">Saadaa Creator Hub</span>
        </span>
      </div>
    </header>
  );
}
