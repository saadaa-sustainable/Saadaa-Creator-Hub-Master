import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  Settings,
  Users,
  Table2,
  ShieldAlert,
  ChevronRight,
  BadgeCheck,
  ShieldCheck,
  Workflow,
  FlaskConical,
  Compass,
  Mail,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import {
  getTestModeScopes,
  getCampaignAutoCloseEnabled,
} from "@/features/settings/actions";
import { TestModeSettings } from "@/features/settings/test-mode-settings";
import { CampaignAutoCloseCard } from "@/features/settings/campaign-auto-close-card";

export const metadata = { title: "Settings" };

const tile =
  "relative overflow-hidden rounded-[16px] border border-[#E7E2D2] bg-white transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_10px_30px_rgba(180,150,120,0.16)]";

export default async function SettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const isAdmin = hasPermission(actor, "admin");

  // Admin-only controls read their current state server-side.
  const [testModeScopes, autoCloseEnabled] = await Promise.all([
    isAdmin ? getTestModeScopes() : Promise.resolve([]),
    isAdmin ? getCampaignAutoCloseEnabled() : Promise.resolve(true),
  ]);

  const display = actor.name || actor.email;
  const initials = display
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  // Administration shortcuts — each gated by what the user can actually open.
  const links: {
    href: Route;
    icon: ReactNode;
    color: string;
    title: string;
    desc: string;
    show: boolean;
  }[] = [
    {
      href: "/admin/users" as Route,
      icon: <Users size={15} />,
      color: "#3B6FD4",
      title: "User Panel",
      desc: "Members, roles & permissions, data-entry assignment.",
      show: isAdmin,
    },
    {
      href: "/sheets" as Route,
      icon: <Table2 size={15} />,
      color: "#7B4FBF",
      title: "Sheet View",
      desc: "Spreadsheet grid over the live workflow data + row delete.",
      show: hasPermission(actor, "sheet_view"),
    },
    {
      href: "/errors" as Route,
      icon: <ShieldAlert size={15} />,
      color: "#B57514",
      title: "Error Portal",
      desc: "System error log + edge-case alerts surfaced for the team.",
      show: true,
    },
  ];
  const visibleLinks = links.filter((l) => l.show);

  return (
    <div className="onboarding-stage settings-stage">
      <PageHeader icon={Settings} title="Settings" knowMore="settings" />

      <div className="grid grid-cols-12 gap-3">
        {/* ── Account ── */}
        <section className={`${tile} col-span-12 p-4 sm:p-5 lg:col-span-5`}>
          <span className="absolute inset-x-0 top-0 h-[3px] bg-[#E8A87C]" />
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#6E695E]">
            <BadgeCheck size={13} className="text-[#9A9384]" /> Your Account
          </p>
          <div className="mb-4 flex items-center gap-3">
            <span
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#E8A87C,#C9A882)" }}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-[#161513]">
                {actor.name || actor.email}
              </div>
              <div className="truncate text-[12px] text-[#9A9384]">
                {actor.email}
              </div>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F0EAD6] px-2.5 py-1 text-[11px] font-semibold text-[#8C5A2B]">
              <ShieldCheck size={11} /> {actor.role || "User"}
            </span>
            {actor.department && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E2D2] bg-[#FBFAF6] px-2.5 py-1 text-[11px] font-semibold text-[#6E695E]">
                <Compass size={11} /> {actor.department}
              </span>
            )}
          </div>
          <p className="text-[11.5px] leading-snug text-[#9A9384]">
            Name, role and access are managed by an admin in the{" "}
            {isAdmin ? (
              <Link
                href={"/admin/users" as Route}
                className="font-semibold text-[#8C5A2B] underline decoration-[#E8A87C]/50 underline-offset-2"
              >
                User Panel
              </Link>
            ) : (
              <span className="font-medium text-[#6E695E]">User Panel</span>
            )}
            .
          </p>
        </section>

        {/* ── Administration shortcuts ── */}
        <section className={`${tile} col-span-12 p-4 sm:p-5 lg:col-span-7`}>
          <span className="absolute inset-x-0 top-0 h-[3px] bg-[#3B6FD4]" />
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#6E695E]">
            <Compass size={13} className="text-[#9A9384]" /> Administration
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {visibleLinks.map((l) => (
              <Link
                key={l.title}
                href={l.href}
                className="group flex items-start gap-2.5 rounded-[12px] border border-[#E7E2D2] bg-[#FBFAF6] p-3 transition-colors hover:border-[#C9A882]/60 hover:bg-white"
              >
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                  style={{ background: `${l.color}1A`, color: l.color }}
                >
                  {l.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[12.5px] font-semibold text-[#161513]">
                    {l.title}
                    <ChevronRight
                      size={13}
                      className="text-[#B8AEA0] transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[#9A9384]">
                    {l.desc}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {isAdmin && (
          <>
            {/* ── Workflow preferences ── */}
            <div className="col-span-12 mt-1 flex items-center gap-1.5">
              <Workflow size={13} className="text-[#9A9384]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6E695E]">
                Workflow Preferences
              </span>
            </div>
            <div className="col-span-12 lg:col-span-6">
              <CampaignAutoCloseCard enabled={autoCloseEnabled} />
            </div>

            {/* ── Test mode (danger zone) ── */}
            <div className="col-span-12 mt-1 flex items-center gap-1.5">
              <FlaskConical size={13} className="text-[#C0392B]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#C0392B]">
                Test Mode — Danger Zone
              </span>
              <span className="text-[10.5px] text-[#9A9384]">
                turning an entity off deletes its test rows
              </span>
            </div>
            <div className="col-span-12">
              <TestModeSettings activeScopes={testModeScopes} />
            </div>
          </>
        )}

        {!isAdmin && (
          <p className="col-span-12 inline-flex items-center gap-1.5 text-[11.5px] text-[#9A9384]">
            <Mail size={12} /> Need a role change? Ask a Global Admin — they
            manage it from the User Panel.
          </p>
        )}
      </div>
    </div>
  );
}
