"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Wallet,
  Rocket,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  UserCheck,
  Package,
  Instagram,
  UserSquare,
  Map,
  Timer,
  BarChart3,
  Megaphone,
  ClipboardCheck,
  IndianRupee,
  Filter,
  Gauge,
  Users,
  ShieldAlert,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/rbac";
import { signOutAction } from "./sign-out-action";
import { useSidebar } from "@/stores/sidebar-store";
import type { UserAccessRow } from "@/lib/supabase/types.gen";

interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
  show?: (actor: UserAccessRow) => boolean;
}
interface NavSection {
  label: string;
  items: (NavLeaf | { label: string; icon: LucideIcon; children: NavLeaf[] })[];
}

const NAV: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
      {
        label: "Accounts Hub",
        href: "/accounts-hub",
        icon: Wallet,
        show: (a) => hasPermission(a, "accounts_write"),
      },
    ],
  },
  {
    label: "Workflow",
    items: [
      {
        label: "New Campaign",
        href: "/campaigns/new",
        icon: Rocket,
        show: (a) => hasPermission(a, "campaign_create"),
      },
      {
        label: "Reach Out",
        icon: Send,
        children: [
          {
            label: "Outbound",
            href: "/reach-out/outbound",
            icon: ArrowUpRight,
            show: (a) => hasPermission(a, "reachout_outbound"),
          },
          {
            label: "Inbound",
            href: "/reach-out/inbound",
            icon: ArrowDownLeft,
            show: (a) => hasPermission(a, "reachout_inbound"),
          },
        ],
      },
      {
        label: "Creator Onboarding",
        href: "/onboarding",
        icon: UserCheck,
        show: (a) => hasPermission(a, "onboarding_write"),
      },
      { label: "Order Status", href: "/order-status", icon: Package },
      {
        label: "Posting Data",
        href: "/posting",
        icon: Instagram,
        show: (a) => hasPermission(a, "posting_submit"),
      },
    ],
  },
  {
    label: "System",
    items: [
      { label: "My Dashboard", href: "/my-dashboard", icon: UserSquare },
      { label: "Influencer Journey", href: "/journey", icon: Map },
      { label: "TAT Analytics", href: "/tat", icon: Timer },
      { label: "Order Dashboard", href: "/orders", icon: BarChart3 },
      {
        label: "Ad Status",
        href: "/performance/ad-run-status",
        icon: Megaphone,
        show: (a) => hasPermission(a, "performance_view"),
      },
      { label: "Compliance KPIs", href: "/compliance", icon: ClipboardCheck },
      { label: "Cost Analytics", href: "/cost-analytics", icon: IndianRupee },
      { label: "Funnel View", href: "/funnel", icon: Filter },
      { label: "Internal Dashboard", href: "/internal-dashboard", icon: Gauge },
      {
        label: "User Panel",
        href: "/admin/users",
        icon: Users,
        show: (a) => hasPermission(a, "admin"),
      },
      { label: "Error Portal", href: "/errors", icon: ShieldAlert },
    ],
  },
];

export function Sidebar({ actor }: { actor: UserAccessRow }) {
  const pathname = usePathname();
  const isOpen = useSidebar((s) => s.isOpen);
  const close = useSidebar((s) => s.close);

  return (
    <aside
      className={cn("app-shell-sidebar", isOpen && "is-open")}
      aria-label="Primary navigation"
      aria-hidden={isOpen ? false : undefined}
    >
      <div className="flex items-start justify-between gap-2 px-2 mb-3">
        <div className="brand-logo">
          <div className="logo-badge">SA</div>
          <div className="logo-text">
            <div className="logo-title">CreatorHub</div>
            <div className="logo-sub">
              SAADAA · <span className="user-role">{actor.role ?? "User"}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="lg:hidden grid place-items-center w-9 h-9 rounded-md border border-border bg-bg-white text-text-secondary hover:text-text-primary"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {NAV.map((section) => (
        <SidebarSection
          key={section.label}
          section={section}
          actor={actor}
          pathname={pathname}
        />
      ))}

      <div className="sidebar-footer">
        <form action={signOutAction}>
          <button type="submit" className="sign-out">
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign Out
          </button>
        </form>
        <span className="sidebar-version">v0.1 · Next.js + Supabase</span>
      </div>
    </aside>
  );
}

function SidebarSection({
  section,
  actor,
  pathname,
}: {
  section: NavSection;
  actor: UserAccessRow;
  pathname: string;
}) {
  // Strip groups where every child is hidden by permission.
  const visible = section.items
    .map((it) => {
      if ("children" in it) {
        const children = it.children.filter((c) => !c.show || c.show(actor));
        return children.length ? { ...it, children } : null;
      }
      return !it.show || it.show(actor) ? it : null;
    })
    .filter((x): x is NavSection["items"][number] => x !== null);

  if (visible.length === 0) return null;

  return (
    <>
      <div className="sidebar-section-label">{section.label}</div>
      <ul className="nav-list">
        {visible.map((item) => {
          if ("children" in item) {
            return (
              <li key={item.label} className="nav-group">
                <div className="nav-group-label">
                  <item.icon aria-hidden /> {item.label}
                </div>
                <ul className="nav-children">
                  {item.children.map((c) => (
                    <li key={c.href}>
                      <NavLink leaf={c} pathname={pathname} sub />
                    </li>
                  ))}
                </ul>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <NavLink leaf={item} pathname={pathname} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function NavLink({
  leaf,
  pathname,
  sub,
}: {
  leaf: NavLeaf;
  pathname: string;
  sub?: boolean;
}) {
  const Icon = leaf.icon;
  const closeSidebar = useSidebar((s) => s.close);
  const active = pathname === leaf.href || pathname.startsWith(leaf.href + "/");
  return (
    <Link
      href={leaf.href as never}
      onClick={closeSidebar}
      className={cn("nav-link", sub && "nav-sub-link", active && "active")}
      aria-current={active ? "page" : undefined}
    >
      <Icon aria-hidden />
      <span>{leaf.label}</span>
    </Link>
  );
}
