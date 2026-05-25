import { Trophy } from "lucide-react";
import { Avatar } from "@/components/ui";
import type { DashboardData } from "../types";

function compactFollowers(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function DashboardTopCreators({
  creators,
}: {
  creators: DashboardData["topCreators"];
}) {
  return (
    <article className="h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <Trophy size={12} className="text-accent" aria-hidden /> Top Creators
        </span>
        <span className="text-[0.6rem] text-text-tertiary">By followers</span>
      </header>
      {creators.length === 0 ? (
        <div className="flex-1 grid place-items-center text-[0.78rem] text-text-tertiary">
          No creators in scope yet
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {creators.map((c, i) => (
            <li key={c.username} className="flex items-center gap-2.5 py-2">
              <span className="text-[0.62rem] font-extrabold tabular text-text-tertiary w-5">
                #{i + 1}
              </span>
              <Avatar
                src={c.profilePic}
                username={c.username}
                name={c.name}
                size={32}
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-text-primary text-[0.82rem] truncate">
                  {c.name ?? c.username}
                </div>
                <div className="text-[0.66rem] text-text-tertiary truncate">
                  @{c.username}
                  {c.category ? ` · ${c.category}` : ""}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-emph font-bold tabular text-[0.85rem] text-text-primary">
                  {compactFollowers(c.followers)}
                </div>
                <div className="text-[0.6rem] text-text-tertiary">
                  {c.postCount} post{c.postCount === 1 ? "" : "s"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
