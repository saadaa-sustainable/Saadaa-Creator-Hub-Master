"use client";

import { useEffect, useState } from "react";
import type { JourneyCard, JourneyColumn } from "./types";
import { JourneyCardItem } from "./journey-card";
import { cn } from "@/lib/cn";

/** Cards rendered per column before the "View more" reveal. Keeps the DOM light
 *  when a stage holds hundreds of collabs — the header count stays the true
 *  total, only the rendered slice grows on demand. */
const PAGE = 25;

const COLUMN_STYLE: Record<
  JourneyColumn["id"],
  { body: string; band: string; dot: string }
> = {
  "reach-out": {
    body: "bg-[#EAF1FB]/55",
    band: "bg-gradient-to-r from-[#3B6FD4] to-[#5C8DE5]",
    dot: "bg-[#3B6FD4]",
  },
  "on-board": {
    body: "bg-[#F1EAFB]/55",
    band: "bg-gradient-to-r from-[#7B4FBF] to-[#9970D3]",
    dot: "bg-[#7B4FBF]",
  },
  posted: {
    body: "bg-success-bg/55",
    band: "bg-gradient-to-r from-success to-[#6E9F6C]",
    dot: "bg-success",
  },
  payment: {
    body: "bg-warning-bg/50",
    band: "bg-gradient-to-r from-warning to-[#D19432]",
    dot: "bg-warning",
  },
};

export function JourneyColumnView({
  column,
  onCardClick,
}: {
  column: JourneyColumn;
  onCardClick?: (card: JourneyCard) => void;
}) {
  const { id, title, cards } = column;
  const style = COLUMN_STYLE[id];

  // Render only the first `visible` cards; "View more" grows the slice. Reset to
  // the first page whenever the card set changes (a new filter re-buckets it).
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [cards]);

  const shown = cards.slice(0, visible);
  const remaining = cards.length - shown.length;

  return (
    <section
      className={cn(
        "rounded-2xl border border-border overflow-hidden flex flex-col snap-start min-w-0 transition-colors duration-150 hover:border-[#DCD6C4]",
        style.body,
      )}
    >
      <div className={cn("h-1.5", style.band)} />
      <header className="px-2.5 sm:px-3 pt-2.5 sm:pt-3 pb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[0.72rem] sm:text-[0.78rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          <span
            className={cn("inline-block w-2.5 h-2.5 rounded-full", style.dot)}
          />
          {title}
        </span>
        <span className="text-[0.62rem] font-extrabold tabular text-text-secondary bg-bg-white border border-border rounded-full px-2 py-0.5">
          {cards.length}
        </span>
      </header>

      <div className="px-2 pb-2.5 sm:pb-3 flex flex-col gap-1.5 sm:gap-2 min-h-[150px] sm:min-h-[180px]">
        {cards.length === 0 ? (
          <div className="flex-1 grid place-items-center text-[0.7rem] text-text-tertiary py-8 italic">
            Nothing here yet
          </div>
        ) : (
          <>
            {shown.map((card: JourneyCard) => (
              <JourneyCardItem
                key={card.post_id}
                card={card}
                colId={id}
                onClick={onCardClick ? () => onCardClick(card) : undefined}
              />
            ))}
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE)}
                className="mt-1 w-full rounded-xl border border-border bg-bg-white/70 hover:bg-bg-white py-2 text-[0.68rem] font-bold uppercase tracking-[0.05em] text-text-secondary transition-colors"
              >
                View {Math.min(PAGE, remaining)} more · {remaining} left
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
