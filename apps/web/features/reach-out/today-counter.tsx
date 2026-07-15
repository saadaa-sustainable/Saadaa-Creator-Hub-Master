import { Flame } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Team scoreboard for TODAY — "Tanvi · 10" chips under the stage header.
 *
 *   outbound / inbound → reach-outs logged today (owner: logged_by)
 *   onboarded          → collabs onboarded today (owner: onboarded_by,
 *                        counted per COLLAB, not per deliverable row)
 *   posted             → deliverables posted today (owner: posted_by,
 *                        falling back to the onboarder on legacy rows)
 *
 * Server component — the stage submits already revalidate their routes, so
 * the numbers bump right after every submit. Test rows never count.
 */

export type TodayCounterKind = "outbound" | "inbound" | "onboarded" | "posted";

const KIND_CONFIG: Record<
  TodayCounterKind,
  { label: string; unit: string; dateCol: string }
> = {
  outbound: { label: "Today · Outbound", unit: "reach-out", dateCol: "reach_out_date" },
  inbound: { label: "Today · Inbound", unit: "reach-out", dateCol: "reach_out_date" },
  onboarded: { label: "Today · Onboarded", unit: "collab", dateCol: "onboard_date" },
  posted: { label: "Today · Posted", unit: "post", dateCol: "post_date" },
};

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export async function TodayCounter({ kind }: { kind: TodayCounterKind }) {
  const cfg = KIND_CONFIG[kind];
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(
      "logged_by, onboarded_by, posted_by, reachout_direction, is_test, collab_id, post_id, id",
    )
    .eq(cfg.dateCol, todayIST())
    .limit(5000);
  if (error) {
    console.error(`[today-counter] ${kind}:`, error.message);
    return null;
  }

  const counts = new Map<string, number>();
  const seenCollabs = new Set<string>();
  let total = 0;
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    if (r.is_test) continue;

    if (kind === "outbound" || kind === "inbound") {
      const dir =
        String(r.reachout_direction ?? "outbound").toLowerCase() === "inbound"
          ? "inbound"
          : "outbound";
      if (dir !== kind) continue;
    }
    if (kind === "onboarded") {
      // One collab = one onboarding, however many deliverable rows it minted.
      const collabKey = String(r.collab_id ?? r.post_id ?? r.id ?? "");
      if (seenCollabs.has(collabKey)) continue;
      seenCollabs.add(collabKey);
    }

    const owner =
      kind === "onboarded"
        ? String(r.onboarded_by ?? "").trim() || "Unattributed"
        : kind === "posted"
          ? String(r.posted_by ?? "").trim() ||
            String(r.onboarded_by ?? "").trim() ||
            "Unattributed"
          : String(r.logged_by ?? "").trim() ||
            String(r.onboarded_by ?? "").trim() ||
            "Unattributed";
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
    total += 1;
  }

  const members = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-bg-white px-4 py-3"
      aria-label={`${cfg.label} by team member`}
    >
      <span className="inline-flex items-center gap-1.5 text-[clamp(0.6rem,0.55rem+0.2vw,0.68rem)] font-extrabold uppercase tracking-[0.08em] text-text-secondary">
        <Flame size={13} aria-hidden className="text-warning" />
        {cfg.label}
      </span>
      <span className="rounded-full bg-bg-ecru px-2.5 py-0.5 text-[0.72rem] font-extrabold tabular-nums text-text-primary">
        {total} total
      </span>
      {members.length === 0 ? (
        <span className="text-[0.76rem] text-text-tertiary">
          Nothing yet today — the board resets every morning.
        </span>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {members.map(([name, n]) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-surface py-0.5 pl-1 pr-2.5 text-[clamp(0.68rem,0.62rem+0.2vw,0.76rem)] font-semibold text-text-primary"
              title={`${name} — ${n} ${cfg.unit}${n === 1 ? "" : "s"} today`}
            >
              <span
                aria-hidden
                className="inline-grid h-5 w-5 place-items-center rounded-full bg-[#2C2420] text-[0.58rem] font-extrabold text-accent"
              >
                {name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() ?? "")
                  .join("")}
              </span>
              {name}
              <b className="tabular-nums">{n}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** Back-compat alias for the reach-out pages. */
export async function TodayReachoutCounter({
  direction,
}: {
  direction: "outbound" | "inbound";
}) {
  return TodayCounter({ kind: direction });
}
