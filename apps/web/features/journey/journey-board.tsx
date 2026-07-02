"use client";

import { useState } from "react";
import type { JourneyCard, JourneyColumn } from "./types";
import { JourneyColumnView } from "./journey-column";
import { JourneyCardModal } from "./journey-card-modal";

/**
 * Full-width dashboard kanban.
 * Mobile and desktop both use the same horizontal rail as the main dashboard.
 */
export function JourneyBoard({ columns }: { columns: JourneyColumn[] }) {
  const [selectedCard, setSelectedCard] = useState<JourneyCard | null>(null);

  return (
    <>
      <article className="bento-tile rounded-2xl bg-bg-white border border-border p-2.5 sm:p-4 flex flex-col gap-2.5 sm:gap-3 min-w-0 overflow-hidden">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
            Stage Snapshot · Where every collab is stuck
          </span>
          <span className="text-[0.6rem] text-text-tertiary">
            Tap a card to inspect the journey
          </span>
        </header>
        <div
          className="dashboard-kanban-scroll"
          style={{
            width: "100%",
            maxWidth: "100%",
            marginInline: "-8px",
            paddingInline: "8px",
            overflowX: "auto",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            className="dashboard-kanban-track bento-stagger"
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(280px, min(86vw, 340px))",
              gridTemplateColumns: "none",
              gap: "12px",
              minWidth: 0,
              paddingBottom: "8px",
              scrollSnapType: "x mandatory",
            }}
          >
            {columns.map((col) => (
              <JourneyColumnView
                key={col.id}
                column={col}
                onCardClick={setSelectedCard}
              />
            ))}
          </div>
        </div>
      </article>

      <JourneyCardModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    </>
  );
}
