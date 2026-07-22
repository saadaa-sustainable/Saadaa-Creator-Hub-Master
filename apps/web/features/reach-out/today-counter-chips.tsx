"use client";

import { useState } from "react";
import { TeamRowsDrawer } from "@/features/team-rows/team-rows-drawer";

export function TodayCounterChips({
  members,
}: {
  members: Array<[string, number]>;
}) {
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const teams = members
    .map(([name]) => name)
    .filter((name) => name !== "Unattributed");

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {members.map(([name, n]) => {
          const isUnattributed = name === "Unattributed";
          const initials = name
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? "")
            .join("");
          const className =
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-surface py-0.5 pl-1 pr-2.5 text-[clamp(0.68rem,0.62rem+0.2vw,0.76rem)] font-semibold text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]";

          if (isUnattributed) {
            return (
              <span key={name} className={className} title="No team member recorded">
                <span
                  aria-hidden
                  className="inline-grid h-5 w-5 place-items-center rounded-full bg-[#2C2420] text-[0.58rem] font-extrabold text-accent"
                >
                  ?
                </span>
                {name}
                <b className="tabular-nums">{n}</b>
              </span>
            );
          }

          return (
            <button
              key={name}
              type="button"
              className={`${className} cursor-pointer hover:border-[#DCD6C4] hover:bg-bg-white`}
              title={`${name} — open full reach-out, onboarding and posted history`}
              aria-label={`Open ${name}'s full history`}
              onClick={() => setSelectedMember(name)}
            >
              <span
                aria-hidden
                className="inline-grid h-5 w-5 place-items-center rounded-full bg-[#2C2420] text-[0.58rem] font-extrabold text-accent"
              >
                {initials}
              </span>
              {name}
              <b className="tabular-nums">{n}</b>
            </button>
          );
        })}
      </div>
      {selectedMember && (
        <TeamRowsDrawer
          team={selectedMember}
          teams={teams}
          source="live"
          onClose={() => setSelectedMember(null)}
        />
      )}
    </>
  );
}
