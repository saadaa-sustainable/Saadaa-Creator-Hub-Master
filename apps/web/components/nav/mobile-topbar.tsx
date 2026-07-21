"use client";

import { Lightbulb, Menu } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSidebar } from "@/stores/sidebar-store";
import { resolveTab, tabKnowMoreSlug } from "@/features/dashboard/tab-config";

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
  ["/calendar", "Calendar"],
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

const SECTION_KM_SLUGS: Array<[string, string]> = [
  ["/accounts-hub", "accounts-hub"],
  ["/admin/users", "user-panel"],
  ["/campaigns/new", "campaigns"],
  ["/campaigns", "campaigns"],
  ["/compliance", "compliance"],
  ["/cost-analytics", "cost-analytics"],
  ["/dashboard", "dashboard"],
  ["/errors", "errors"],
  ["/funnel", "funnel"],
  ["/internal-dashboard", "internal-dashboard"],
  ["/journey", "journey"],
  ["/my-dashboard", "my-dashboard"],
  ["/offboarding", "offboarding"],
  ["/onboarding", "onboarding"],
  ["/order-status", "order-status"],
  ["/orders", "orders"],
  ["/performance/ad-run-status", "ad-status"],
  ["/performance/untested-ads", "ad-status"],
  ["/posting", "posting"],
  ["/reach-out/inbound", "reach-out-inbound"],
  ["/reach-out/outbound", "reach-out-outbound"],
  ["/sheets", "sheets"],
  ["/tat", "tat"],
];

function getSectionTitle(pathname: string) {
  return (
    SECTION_TITLES.find(
      ([href]) => pathname === href || pathname.startsWith(`${href}/`),
    )?.[1] ?? "Workspace"
  );
}

function getKnowMoreSlug(pathname: string, tabParam: string | null) {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return tabKnowMoreSlug(resolveTab(tabParam));
  }
  return SECTION_KM_SLUGS.find(
    ([href]) => pathname === href || pathname.startsWith(`${href}/`),
  )?.[1];
}

export function MobileTopbar() {
  const open = useSidebar((s) => s.open);
  const isOpen = useSidebar((s) => s.isOpen);
  const pathname = usePathname();
  const params = useSearchParams();
  const sectionTitle = getSectionTitle(pathname);
  const knowMoreSlug = getKnowMoreSlug(pathname, params.get("tab"));

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
        <span className="logo-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.png" alt="CreatorHub logo" />
        </span>
        <span className="brand-stack">
          <span className="brand-title">{sectionTitle}</span>
          <span className="brand-subtitle">Saadaa Creator Hub</span>
        </span>
      </div>
      {knowMoreSlug && (
        <button
          type="button"
          className="topbar-know-more"
          data-know-more={knowMoreSlug}
          aria-label={`Open help for ${sectionTitle}`}
        >
          <Lightbulb className="h-3.5 w-3.5" aria-hidden />
          <span>Know More</span>
        </button>
      )}
    </header>
  );
}
