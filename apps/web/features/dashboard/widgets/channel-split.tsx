import { ArrowDownLeft, ArrowUpRight, Radio } from "lucide-react";
import type { ChannelStats } from "../types";

/**
 * Inbound vs Outbound reach-out analytics — two parallel channel cards so the
 * team can read each acquisition channel on its own. Inbound = creators who
 * approached us (inbound roster); Outbound = our team's cold reach-outs. Each
 * card carries a headline conversion %, three stat chips (Creators / Spend /
 * Posted), and a 3-step mini funnel (Reach Out → On Board → Posted) sized to the
 * channel's own largest bucket. Indigo (inbound) + purple (outbound) are the
 * design-system "detail panel" accents — never used for nav, so allowed here.
 */
const inr = (n: number) =>
  n >= 100000
    ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`
    : n >= 1000
      ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
      : `₹${n}`;

interface ChannelTheme {
  label: string;
  hint: string;
  icon: typeof ArrowDownLeft;
  /** accent hex for the rail, headline number, and posted bar */
  accent: string;
  /** soft tint for the funnel bar tracks */
  track: string;
}

function ChannelCard({
  stats,
  theme,
}: {
  stats: ChannelStats;
  theme: ChannelTheme;
}) {
  const Icon = theme.icon;
  const total = stats.reachOut + stats.onboarded + stats.posted;
  const max = Math.max(stats.reachOut, stats.onboarded, stats.posted, 1);
  const steps = [
    { label: "Reach Out", value: stats.reachOut },
    { label: "On Board", value: stats.onboarded },
    { label: "Posted", value: stats.posted },
  ];
  return (
    <article
      className="relative h-full overflow-hidden rounded-2xl border border-border bg-bg-white p-4 pl-5 flex flex-col gap-3.5"
      style={{ borderLeft: `3px solid ${theme.accent}` }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span
            className="inline-flex items-center gap-1.5 text-[0.66rem] font-extrabold uppercase tracking-[0.07em]"
            style={{ color: theme.accent }}
          >
            <Icon size={13} aria-hidden /> {theme.label}
          </span>
          <span className="text-[0.66rem] text-text-tertiary">{theme.hint}</span>
        </div>
        <div className="text-right leading-none">
          <div
            className="text-[1.35rem] font-extrabold tabular"
            style={{ color: theme.accent }}
          >
            {stats.conversionPct}%
          </div>
          <div className="text-[0.6rem] uppercase tracking-wide text-text-tertiary">
            converted
          </div>
        </div>
      </header>

      {/* Stat chips */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Creators", v: String(stats.creators) },
          { k: "Spend", v: inr(stats.spend) },
          { k: "Posted", v: String(stats.posted) },
        ].map((s) => (
          <div
            key={s.k}
            className="rounded-xl bg-bg-surface px-2.5 py-2 flex flex-col"
          >
            <span className="text-[0.95rem] font-bold tabular text-text-primary leading-tight">
              {s.v}
            </span>
            <span className="text-[0.6rem] uppercase tracking-wide text-text-secondary">
              {s.k}
            </span>
          </div>
        ))}
      </div>

      {/* Mini funnel */}
      <ul className="flex flex-col gap-2">
        {steps.map((s) => {
          const pct = Math.round((s.value / max) * 100);
          return (
            <li key={s.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[0.7rem]">
                <span className="font-semibold text-text-secondary">
                  {s.label}
                </span>
                <span className="tabular text-text-secondary">{s.value}</span>
              </div>
              <div
                className="relative h-2 rounded-full overflow-hidden"
                style={{ background: theme.track }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${pct}%`, background: theme.accent }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {total === 0 && (
        <p className="text-[0.66rem] text-text-tertiary -mt-1">
          No {theme.label.toLowerCase()} reach-outs in this view yet.
        </p>
      )}
    </article>
  );
}

export function DashboardChannelSplit({
  channels,
}: {
  channels: { inbound: ChannelStats; outbound: ChannelStats };
}) {
  return (
    <section className="h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
          <Radio size={12} aria-hidden /> Reach-Out Channels
        </span>
        <span className="text-[0.62rem] text-text-tertiary">
          Inbound vs Outbound
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ChannelCard
          stats={channels.inbound}
          theme={{
            label: "Inbound",
            hint: "Creators approached us",
            icon: ArrowDownLeft,
            accent: "#3B6FD4",
            track: "#EAF1FB",
          }}
        />
        <ChannelCard
          stats={channels.outbound}
          theme={{
            label: "Outbound",
            hint: "We reached out",
            icon: ArrowUpRight,
            accent: "#7B4FBF",
            track: "#F1EAFB",
          }}
        />
      </div>
    </section>
  );
}
