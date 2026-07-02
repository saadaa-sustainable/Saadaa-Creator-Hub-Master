import { Camera, Megaphone, Send, UserCheck, UserX } from "lucide-react";
import type { CampaignFocus } from "../types";

/**
 * Per-campaign onboarding funnel — shown only when a single campaign is
 * selected in the dashboard filter. Surfaces the onboarding-cap story: how many
 * creators were reached out, how many onboarded (vs the cap), how many are still
 * un-onboarded, and how many have posted.
 */
export function DashboardCampaignFocus({ focus }: { focus: CampaignFocus }) {
  const onboardedValue =
    focus.cap > 0 ? `${focus.onboarded} / ${focus.cap}` : String(focus.onboarded);
  const slotsLeft = focus.cap > 0 ? Math.max(0, focus.cap - focus.onboarded) : null;

  const stats: Array<{
    label: string;
    value: string | number;
    sub?: string;
    icon: typeof Send;
    tone: string;
  }> = [
    { label: "Reached Out", value: focus.reachedOut, icon: Send, tone: "#3B6FD4" },
    {
      label: "Onboarded",
      value: onboardedValue,
      sub:
        slotsLeft != null
          ? slotsLeft === 0
            ? "cap reached"
            : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`
          : undefined,
      icon: UserCheck,
      tone: "#4F7C4D",
    },
    {
      label: "Un-onboarded",
      value: focus.unonboarded,
      sub: "reached out, not onboarded",
      icon: UserX,
      tone: "#B57514",
    },
    { label: "Posted", value: focus.posted, icon: Camera, tone: "#7B4FBF" },
  ];

  return (
    <section className="bento-tile rounded-2xl bg-bg-white border border-border p-4 sm:p-5">
      <header className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-bg-surface border border-border text-text-secondary">
          <Megaphone size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-text-primary truncate">
            {focus.campaignName ?? focus.campaignId}
          </h3>
          <p className="text-[0.6rem] text-text-tertiary uppercase tracking-[0.06em] font-bold">
            {focus.campaignId} · campaign funnel
          </p>
        </div>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bento-stagger">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="bento-tile relative overflow-hidden rounded-xl border border-border bg-bg-surface/40 px-3 py-2.5"
            >
              <span
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: s.tone }}
              />
              <div className="flex items-center gap-1.5 text-text-secondary mb-1">
                <Icon size={12} aria-hidden className="text-text-tertiary" />
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.05em]">
                  {s.label}
                </span>
              </div>
              <div className="text-[1.4rem] leading-none font-bold tabular text-text-primary">
                {s.value}
              </div>
              {s.sub && (
                <div className="mt-1 text-[0.6rem] text-text-tertiary">{s.sub}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
