import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import { Box, Instagram, Send, UserCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { InfoDot } from "./bento-kit";
import { CountUpInt } from "./count-up-stats";
import type { PulseStat } from "./types";

interface PulseCardProps {
  title: string;
  icon: LucideIcon;
  tone: "info" | "success" | "accent" | "violet";
  stat: PulseStat;
  info: string;
}

const ICON_BG: Record<PulseCardProps["tone"], string> = {
  info: "bg-[#EAF1FB] text-[#2C4A8C]",
  success: "bg-success-bg text-success",
  accent: "bg-[rgba(240,198,30,0.22)] text-[#9a7a00]",
  violet: "bg-[#F1EAFB] text-[#7B4FBF]",
};
const ACCENT_BAR: Record<PulseCardProps["tone"], string> = {
  info: "from-[#3B6FD4]/0 via-[#3B6FD4]/0 to-[#3B6FD4]/35",
  success: "from-success/0 via-success/0 to-success/35",
  accent: "from-accent/0 via-accent/0 to-accent/55",
  violet: "from-[#7B4FBF]/0 via-[#7B4FBF]/0 to-[#7B4FBF]/35",
};

function PulseCard({ title, icon: Icon, tone, stat, info }: PulseCardProps) {
  const up = stat.delta > 0;
  const down = stat.delta < 0;
  const DeltaIcon = up ? ArrowUp : down ? ArrowDown : Minus;
  const deltaCls = up
    ? "text-success bg-success-bg"
    : down
      ? "text-danger bg-danger-bg"
      : "text-text-tertiary bg-bg-ecru";
  return (
    <div className="bento-tile relative overflow-hidden rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-2 min-h-[112px]">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r",
          ACCENT_BAR[tone],
        )}
      />
      <header className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-[0.07em] text-text-secondary">
          {title}
          <InfoDot title={title} text={info} />
        </span>
        <span
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded-lg",
            ICON_BG[tone],
          )}
        >
          <Icon size={13} aria-hidden />
        </span>
      </header>
      <div className="font-emph text-[1.6rem] leading-none font-bold tabular text-text-primary">
        <CountUpInt value={stat.today} />
      </div>
      <div
        className={cn(
          "inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[0.62rem] font-bold tabular",
          deltaCls,
        )}
      >
        <DeltaIcon size={10} aria-hidden />
        <span>
          {up ? "+" : down ? "−" : ""}
          {Math.abs(stat.delta)}
        </span>
        <span className="opacity-70 font-medium">vs yesterday</span>
      </div>
    </div>
  );
}

export function DashboardPulseStrip({
  pulse,
}: {
  pulse: {
    reachOut: PulseStat;
    onboarded: PulseStat;
    posted: PulseStat;
    delivered: PulseStat;
  };
}) {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 bento-stagger">
      <PulseCard
        title="Reach-outs Today"
        icon={Send}
        tone="info"
        stat={pulse.reachOut}
        info="Creators first contacted today. The comparison shows how many more or fewer were contacted than yesterday."
      />
      <PulseCard
        title="Onboarded Today"
        icon={UserCheck}
        tone="success"
        stat={pulse.onboarded}
        info="Creators whose onboarding was completed today, compared with yesterday."
      />
      <PulseCard
        title="Posts Live Today"
        icon={Instagram}
        tone="accent"
        stat={pulse.posted}
        info="Deliverables whose posting form was completed today, compared with yesterday."
      />
      <PulseCard
        title="Delivered Today"
        icon={Box}
        tone="violet"
        stat={pulse.delivered}
        info="Creator orders marked delivered today, compared with yesterday."
      />
    </section>
  );
}
