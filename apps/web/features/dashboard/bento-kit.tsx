"use client";

/**
 * Bento kit — DAM-grade dashboard primitives ported to CreatorHub
 * (source pattern: Workflow Optimizer `components/dashboard/bento-kit.tsx`).
 *
 * Differences from the DAM original, on purpose:
 *   - CSS motion (`.bento-tile` / `.bento-stagger` in globals.css) instead of
 *     framer-motion — no new dependency, transform/opacity only, one-shot.
 *   - `CountUp` (components/ui/count-up.tsx) instead of DAM's useCountUp.
 *   - CreatorHub palette: gold #F0C61E stays CTA-only; series/status colors
 *     use the sanctioned secondary accents (indigo/purple/success/warning).
 *
 * Everything here is presentational — values arrive computed; no analytics
 * logic lives in this file.
 */

import type { ReactNode } from "react";
import { CountUp } from "@/components/ui/count-up";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export const pctOf = (n: number, d: number): number =>
  d > 0 ? Math.round((n / d) * 100) : 0;

/** Stage series palette — matches the workflow's existing stage hues. */
export const STAGE_SERIES = [
  { key: "reachOut", label: "Reach Out", color: "#3B6FD4" },
  { key: "onboarded", label: "Onboarded", color: "#7B4FBF" },
  { key: "posted", label: "Posted", color: "#4F7C4D" },
] as const;

const KPI_DEFINITIONS: Record<string, string> = {
  "Active Campaigns":
    "Campaigns with collaboration activity in the current filter scope.",
  Active: "Records still moving through an open workflow stage.",
  "Actual Cost": "The collaboration cost recorded so far in the current scope.",
  "Ad Winners":
    "Creatives with at least 50,000 impressions and a return on ad spend of 3 or more.",
  "All Posted":
    "Creators whose required posting forms have all been completed.",
  "Avg RO → Post":
    "The average number of days from first reach-out to the completed posting form.",
  "Bank Coverage":
    "The share of creators in scope who have the bank details needed for payment.",
  Barter: "Collaborations recorded as barter rather than a cash commercial.",
  "Budget Cost":
    "The total collaboration cost planned for the selected campaigns.",
  "Budget Creators":
    "The number of creators planned in the selected campaign budgets.",
  "Campaigns Assigned": "Distinct campaigns that include work assigned to you.",
  Cancelled:
    "Collaborations closed because the order or engagement was cancelled.",
  Closed:
    "Collaborations that have reached a completed or closed workflow outcome.",
  "Creators in Pipeline":
    "Unique creators currently represented in the selected workflow scope.",
  Curated: "Posted creators marked as curated for the internal dashboard.",
  Delivered: "Creator orders confirmed as delivered.",
  "Delivery Rate":
    "Delivered collaborations as a share of orders that were sent.",
  Discarded:
    "Ads below 50,000 impressions and therefore classified as discarded.",
  "Email Coverage":
    "The share of creators in scope with an email address on file.",
  Eligible:
    "Posted creatives that have enough information to be considered for Meta ads.",
  Ghosted:
    "Onboarded creators whose delivery deadline passed without a completed posting form.",
  "Garment Cost":
    "The estimated product cost attached to creator orders in scope.",
  "In Meta Ads": "Creatives currently matched to one or more Meta ad records.",
  "In Pipeline":
    "Collaborations currently represented across the active workflow stages.",
  "Incr. Winners":
    "Additional winning ads beyond a creator's first winning creative.",
  "Longest Overdue":
    "The greatest number of days any current candidate is past deadline.",
  "My Active":
    "Open collaborations assigned to you across Reach Out, Onboarding, and Posting.",
  "Needs Review":
    "Creators past their delivery deadline who still have no completed posting form.",
  Offboarded:
    "Creators permanently blocked from future reach-out and onboarding.",
  Onboard: "Collaborations whose onboarding form has been completed.",
  "Onboard Rate": "Onboarded collaborations as a share of reach-outs.",
  "Onboard → Post":
    "Posted collaborations as a share of onboarded collaborations.",
  "Onboard → Posted":
    "Posted collaborations as a share of onboarded collaborations.",
  Onboarded: "Collaborations whose onboarding form has been completed.",
  "Order Placed": "Collaborations with a creator order ID recorded.",
  Overdue: "Open work whose expected delivery date is already past.",
  "Overdue Deliverables":
    "Unposted deliverables attached to creators who are past deadline.",
  "P0 Analysis":
    "Ads currently waiting in the first performance review window.",
  "P1 Analysis":
    "Ads currently waiting in the second performance review window.",
  "P2 Analysis":
    "Ads currently waiting in the final performance review window.",
  "Paid Collabs":
    "Collaborations marked paid with a payment reference recorded.",
  "Payment Pending":
    "Payment-ready collabs awaiting settlement: every posting form is complete, the creator accepted the partnership, and the ledger is Not Due, Due, or Partial.",
  "Payment Rate":
    "Paid collaborations as a share of collaborations ready for payment.",
  Pending: "Open collaborations still waiting for their next workflow action.",
  "Pending Content":
    "Onboarded deliverables whose posting form has not yet been completed.",
  "Pending Payments":
    "Payment-ready collabs awaiting settlement after all posting forms are complete and the creator accepts the partnership.",
  "Pending Post":
    "Your assigned collaborations currently waiting for a completed posting form.",
  Posted: "Deliverables whose posting form has been completed.",
  "Posting Rate":
    "Posted collaborations as a share of onboarded collaborations.",
  "Posted → Paid": "Paid collaborations as a share of posted collaborations.",
  Reach: "Creators contacted through inbound or outbound reach-out.",
  "Reach Out": "Creators or collaborations at the first-contact stage.",
  "Reach Outs": "First-contact records in the current filter scope.",
  "Reach → Onboard": "Onboarded collaborations as a share of reach-outs.",
  "RO → Onboard": "Onboarded collaborations as a share of reach-outs.",
  "RO → Post": "Posted collaborations as a share of reach-outs.",
  Remaining: "Planned campaign cost that has not yet been used.",
  RTO: "Orders returned to origin after dispatch.",
  "RTO Rate": "Returned-to-origin orders as a share of dispatched orders.",
  RTOs: "Your assigned collaborations whose order was returned or cancelled.",
  "Total Creators": "Unique creators represented in the current filter scope.",
  "Total Posts": "Deliverables whose posting form has been completed.",
  "Total Reachouts": "Reach-out stage records assigned to you.",
  "Total Spend":
    "The total commercial amount recorded for collaborations in scope.",
  "Total w/ Garments":
    "Recorded creator commercial cost plus estimated garment cost.",
  "Tracking IDs": "Collaborations with a shipment tracking ID recorded.",
  Untested: "Eligible creatives that have not yet been matched to a Meta ad.",
  Utilisation: "Actual campaign cost as a share of approved budget.",
  Variance:
    "The difference between planned campaign cost and recorded actual cost.",
  "Winner Creators":
    "Unique creators with at least one ad classified as a winner.",
  Winners:
    "Ads with at least 50,000 impressions and a return on ad spend of 3 or more.",
  Overall:
    "Paid collaborations as a share of all reach-outs in the journey scope.",
};

// ── tile scaffolding ─────────────────────────────────────────────────────────

export function InfoDot({ text, title }: { text: string; title?: string }) {
  return <InfoTooltip title={title} content={text} />;
}

export function TileHead({
  icon,
  children,
  info,
  right,
}: {
  icon?: ReactNode;
  children: ReactNode;
  info?: string;
  right?: ReactNode;
}) {
  const title = typeof children === "string" ? children : "This view";
  const resolvedInfo =
    info ??
    `${title} shows the records currently in scope. It updates when you change the filters on this view.`;
  return (
    <div className="mb-2 flex items-center gap-1.5">
      {icon && <span className="text-text-tertiary">{icon}</span>}
      <span className="text-[0.66rem] font-bold uppercase tracking-[0.07em] text-text-secondary">
        {children}
      </span>
      <InfoDot text={resolvedInfo} title={title} />
      {right && <span className="ml-auto min-w-0">{right}</span>}
    </div>
  );
}

// ── hero KPI tile (top accent bar + tinted corner + count-up) ────────────────

export function HeroKpi({
  color,
  icon,
  label,
  value,
  suffix,
  sub,
  info,
  rupees = false,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  value: number;
  suffix?: string;
  sub: string;
  info?: string;
  /** ₹ compact formatting (en-IN grouping) for spend tiles. */
  rupees?: boolean;
}) {
  const resolvedInfo =
    info ??
    KPI_DEFINITIONS[label] ??
    `${sub}. This number includes records matching the filters currently applied to this view.`;
  return (
    <div className="bento-tile relative overflow-hidden rounded-[16px] border border-border bg-bg-white p-3.5">
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: color }}
        aria-hidden
      />
      <div className="mb-2 flex items-center gap-1.5 text-text-secondary">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-[8px]"
          style={{ background: `${color}1A`, color }}
        >
          {icon}
        </span>
        <span className="truncate text-[0.64rem] font-bold uppercase tracking-[0.05em]">
          {label}
        </span>
        <InfoDot text={resolvedInfo} title={label} />
      </div>
      <div className="text-[1.7rem] font-bold leading-none tabular-nums text-text-primary">
        {rupees && "₹"}
        <CountUp
          value={value}
          format={(x) => Math.round(x).toLocaleString("en-IN")}
        />
        {suffix}
      </div>
      <div className="mt-1.5 text-[0.68rem] leading-snug tabular-nums text-text-tertiary">
        {sub}
      </div>
    </div>
  );
}
