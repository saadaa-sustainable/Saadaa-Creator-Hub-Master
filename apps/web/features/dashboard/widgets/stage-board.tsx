import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Clock,
  Instagram,
  Send,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import type { DashboardData, StageCard } from "../types";

interface StageDef {
  key: "reachOut" | "onBoard" | "posted" | "paid";
  title: string;
  href: string;
  icon: LucideIcon;
  dot: string;
  /** Tinted column body bg + top band gradient for visual differentiation. */
  body: string;
  band: string;
  tagBg: string;
  tagText: string;
  pillSettled: string;
  pillPending: string;
}

const STAGES: StageDef[] = [
  {
    key: "reachOut",
    title: "Reach Out",
    href: "/reach-out/outbound",
    icon: Send,
    dot: "bg-[#3B6FD4]",
    body: "bg-[#EAF1FB]/55",
    band: "bg-gradient-to-r from-[#3B6FD4] to-[#5C8DE5]",
    tagBg: "bg-[#EAF1FB]",
    tagText: "text-[#2C4A8C]",
    pillSettled: "bg-success-bg text-success",
    pillPending: "bg-[#EAF1FB] text-[#2C4A8C]",
  },
  {
    key: "onBoard",
    title: "Onboarding",
    href: "/onboarding",
    icon: UserCheck,
    dot: "bg-[#7B4FBF]",
    body: "bg-[#F1EAFB]/55",
    band: "bg-gradient-to-r from-[#7B4FBF] to-[#9970D3]",
    tagBg: "bg-[#F1EAFB]",
    tagText: "text-[#7B4FBF]",
    pillSettled: "bg-success-bg text-success",
    pillPending: "bg-[#F1EAFB] text-[#7B4FBF]",
  },
  {
    key: "posted",
    title: "Posted",
    href: "/posting",
    icon: Instagram,
    dot: "bg-success",
    body: "bg-success-bg/55",
    band: "bg-gradient-to-r from-success to-[#6E9F6C]",
    tagBg: "bg-success-bg",
    tagText: "text-success",
    pillSettled: "bg-success-bg text-success",
    pillPending: "bg-warning-bg text-warning",
  },
  {
    key: "paid",
    title: "Payment",
    href: "/accounts-hub",
    icon: Banknote,
    dot: "bg-warning",
    body: "bg-warning-bg/50",
    band: "bg-gradient-to-r from-warning to-[#D19432]",
    tagBg: "bg-warning-bg",
    tagText: "text-warning",
    pillSettled: "bg-success-bg text-success",
    pillPending: "bg-warning-bg text-warning",
  },
];

function initials(name: string): string {
  const parts = name.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function AssigneeRoundel({ name, label }: { name: string; label: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F1EAFB] text-[#7B4FBF] text-[0.55rem] font-extrabold border-2 border-bg-white shadow-sm"
      title={`${label} ${name}`}
    >
      {initials(name)}
    </span>
  );
}

function StageCardItem({ card, stage }: { card: StageCard; stage: StageDef }) {
  const settled = card.stuckLabel === "Settled";
  const pillTone = settled ? stage.pillSettled : stage.pillPending;

  return (
    <article className="rounded-xl bg-bg-white border border-border p-2.5 flex flex-col gap-1.5 shadow-[0_1px_3px_rgba(22,21,19,0.05)]">
      {/* Status pill — single line, right-aligned. Stage already shown in column header. */}
      <div className="flex items-center justify-end">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[0.55rem] font-extrabold uppercase tracking-[0.05em] rounded-full px-1.5 py-0.5 whitespace-nowrap",
            pillTone,
          )}
        >
          <Clock size={8} aria-hidden />
          {card.stuckLabel}
        </span>
      </div>

      {/* Header: avatar + name + handle */}
      <div className="flex items-center gap-2 min-w-0">
        <Avatar
          src={card.profilePic}
          username={card.username}
          name={card.name}
          size={26}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[0.82rem] font-extrabold text-text-primary leading-tight truncate">
            {card.name ?? card.username ?? "—"}
          </div>
          {card.username && (
            <div className="text-[0.62rem] text-text-tertiary truncate leading-tight">
              @{card.username}
            </div>
          )}
        </div>
      </div>

      {/* Post + Collab id chips (below the header, with the pills) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="pill text-[0.55rem] py-0.5 px-1.5 tabular">
          {card.postId}
        </span>
        {card.collabId && (
          <span
            className="pill text-[0.55rem] py-0.5 px-1.5 tabular"
            title="Collab ID"
          >
            {card.collabId}
          </span>
        )}
      </div>

      {/* Meta rows — compact 2-col */}
      <dl className="grid grid-cols-[auto_1fr] gap-y-0.5 gap-x-2 text-[0.62rem]">
        {card.campaign && (
          <>
            <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em]">
              CAMP
            </dt>
            <dd className="text-right tabular text-text-primary truncate">
              {card.campaign}
            </dd>
          </>
        )}
        <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em]">
          DATE
        </dt>
        <dd className="text-right tabular text-text-secondary truncate">
          {formatDate(card.date)}
          {card.daysStuck > 0 && (
            <span className="text-text-tertiary"> · {card.daysStuck}d</span>
          )}
        </dd>
        {card.amount != null && card.amount > 0 && (
          <>
            <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em]">
              AMT
            </dt>
            <dd className="text-right tabular font-bold text-text-primary truncate">
              {formatRupees(card.amount)}
            </dd>
          </>
        )}
      </dl>

      {/* Footer: assignee roundel + name */}
      {card.assignee ? (
        <footer className="flex items-center gap-1.5 pt-1.5 border-t border-border min-w-0">
          <AssigneeRoundel name={card.assignee} label={card.assigneeLabel} />
          <span className="text-[0.62rem] font-semibold text-text-secondary truncate">
            {card.assignee}
          </span>
        </footer>
      ) : (
        <footer className="pt-1.5 border-t border-border text-[0.58rem] text-text-tertiary italic">
          Unassigned
        </footer>
      )}
    </article>
  );
}

/**
 * Slack/Notion-style horizontal mini-kanban. Each column has a tinted column
 * background, an icon + colored dot header with count, and richer card chrome
 * (top tag · status pill · title · meta rows · creator+assignee roundels at the
 * bottom). Horizontal scroll on every viewport.
 */
export function DashboardStageBoard({
  board,
}: {
  board: DashboardData["stageBoard"];
}) {
  return (
    <article className="rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          Stage Snapshot · Where every collab is stuck
        </span>
        <span className="text-[0.6rem] text-text-tertiary">
          Tap a column header to drill in →
        </span>
      </header>
      <div className="-mx-2 px-2 overflow-x-auto scrollbar-thin">
        <div
          className="grid grid-flow-col gap-3 snap-x snap-mandatory pb-2"
          style={{ gridAutoColumns: "minmax(280px, 1fr)" }}
        >
          {STAGES.map((s) => {
            const items = board[s.key];
            return (
              <section
                key={s.key}
                className={cn(
                  "rounded-2xl border border-border overflow-hidden flex flex-col snap-start",
                  s.body,
                )}
              >
                <div className={cn("h-1.5", s.band)} />
                <header className="px-3 pt-3 pb-2 flex items-center justify-between">
                  <Link
                    href={s.href as never}
                    className="inline-flex items-center gap-2 text-[0.78rem] font-extrabold uppercase tracking-[0.06em] text-text-primary hover:text-accent"
                  >
                    <span
                      className={cn("inline-block w-2.5 h-2.5 rounded-full", s.dot)}
                    />
                    {s.title}
                    <ArrowRight size={11} className="opacity-50" aria-hidden />
                  </Link>
                  <span className="text-[0.62rem] font-extrabold tabular text-text-secondary bg-bg-white border border-border rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                </header>
                <div className="px-2 pb-3 flex flex-col gap-2 min-h-[180px]">
                  {items.length === 0 ? (
                    <div className="flex-1 grid place-items-center text-[0.7rem] text-text-tertiary py-8 italic">
                      Nothing here yet
                    </div>
                  ) : (
                    items.map((card) => (
                      <StageCardItem key={card.postId} card={card} stage={s} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </article>
  );
}
