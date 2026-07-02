import { Users } from "lucide-react";
import type { DashboardData } from "../types";

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function DashboardTeamLeaderboard({
  team,
}: {
  team: DashboardData["teamLeaderboard"];
}) {
  const max = Math.max(1, ...team.map((t) => t.onboardings));
  return (
    <article className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <Users size={12} className="text-[#B54F7A]" aria-hidden /> Team Leaderboard
        </span>
        <span className="text-[0.6rem] text-text-tertiary">By onboardings</span>
      </header>
      {team.length === 0 ? (
        <div className="flex-1 grid place-items-center text-[0.78rem] text-text-tertiary">
          No onboardings logged yet
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {team.map((t, i) => {
            const pct = Math.round((t.onboardings / max) * 100);
            return (
              <li
                key={t.name}
                className="flex items-center gap-2.5 rounded-lg -mx-1.5 px-1.5 hover:bg-bg-alt transition-colors"
              >
                <span className="text-[0.62rem] font-extrabold tabular text-text-tertiary w-5">
                  #{i + 1}
                </span>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#F1EAFB] text-[#7B4FBF] text-[0.66rem] font-extrabold">
                  {initials(t.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-text-primary text-[0.78rem] truncate">
                      {t.name}
                    </span>
                    <span className="tabular text-text-secondary text-[0.72rem]">
                      <strong className="text-text-primary">{t.onboardings}</strong>{" "}
                      <span className="text-text-tertiary">· {t.posts} posts</span>
                    </span>
                  </div>
                  <div className="mt-1 relative h-1.5 rounded-full bg-bg-ecru overflow-hidden">
                    <div
                      className="bento-bar absolute inset-y-0 left-0 rounded-full bg-[#7B4FBF]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
