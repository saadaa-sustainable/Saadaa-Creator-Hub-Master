import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  HandCoins,
  HourglassIcon,
  Mail,
  PackageX,
  TruckIcon,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ACTION_HREFS, type ActionCounts } from "./types";

interface ChipDef {
  key: keyof ActionCounts;
  label: string;
  icon: LucideIcon;
  tone: "warning" | "info" | "success" | "danger";
}

const CHIPS: ChipDef[] = [
  { key: "needsEmail", label: "Missing Email", icon: Mail, tone: "warning" },
  { key: "needsOrder", label: "Pending Order", icon: PackageX, tone: "info" },
  { key: "awaitingPost", label: "Awaiting Post", icon: HourglassIcon, tone: "warning" },
  { key: "noTracking", label: "No Tracking", icon: TruckIcon, tone: "info" },
  { key: "noPartnership", label: "No Partnership", icon: HandCoins, tone: "success" },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, tone: "danger" },
];

const TONE_CLS: Record<ChipDef["tone"], string> = {
  warning: "bg-warning-bg text-warning border-warning/25",
  info: "bg-[#EAF1FB] text-[#2C4A8C] border-[rgba(59,111,212,0.25)]",
  success: "bg-success-bg text-success border-success/25",
  danger: "bg-danger-bg text-danger border-danger/20",
};

export function DashboardActionStrip({ actions }: { actions: ActionCounts }) {
  return (
    <section className="h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <Zap size={12} aria-hidden /> What needs the team today
        </span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CHIPS.map((c) => {
          const count = actions[c.key];
          const muted = count === 0;
          return (
            <Link
              key={c.key}
              href={ACTION_HREFS[c.key] as never}
              className={cn(
                "flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[0.74rem] font-semibold transition hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-10px_rgba(22,21,19,0.25)]",
                TONE_CLS[c.tone],
                muted && "opacity-55",
              )}
            >
              <c.icon size={12} aria-hidden />
              <span className="flex-1 min-w-0 truncate">{c.label}</span>
              <span className="flex-shrink-0 min-w-[1.4rem] text-center rounded-full bg-black/10 px-1.5 text-[0.68rem] font-extrabold tabular">
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
