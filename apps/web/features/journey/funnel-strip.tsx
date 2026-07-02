import {
  CreditCard,
  Instagram,
  TrendingDown,
  UserRoundCheck,
} from "lucide-react";
import { HeroKpi } from "@/features/dashboard/bento-kit";
import type { JourneyFunnel } from "./types";

/**
 * Journey funnel conversion strip — Reachout → Onboarding → Posting → Payment.
 * Closes the Analytics-Matrix gap (the existing Journey KPI strip showed only
 * absolute counts, no conversion rates). Renders bento-kit `HeroKpi` tiles in
 * the shared `.acc-kpi-grid`; stage colors follow STAGE_SERIES (reach indigo,
 * onboard purple, posted green) with the overall reach→paid tile in amber.
 * Rates are stage-to-stage; the secondary line shows the raw collab counts.
 */

/**
 * Split a one-decimal percentage so HeroKpi's integer count-up renders the
 * exact same string as `${v}%` — the integer part animates, `.d%` rides the
 * static suffix (suffix is just "%" when the rate has no decimal).
 */
function pctParts(v: number): { value: number; suffix: string } {
  const tenths = Math.round(v * 10) % 10;
  return { value: Math.trunc(v), suffix: tenths ? `.${tenths}%` : "%" };
}

export function JourneyFunnelStrip({ funnel }: { funnel: JourneyFunnel }) {
  const reachOnboard = pctParts(funnel.reachToOnboard);
  const onboardPost = pctParts(funnel.onboardToPost);
  const postPaid = pctParts(funnel.postToPayment);
  const overall = pctParts(
    funnel.reached > 0
      ? Math.round((funnel.paid / funnel.reached) * 1000) / 10
      : 0,
  );

  return (
    <div className="acc-kpi-grid bento-stagger">
      <HeroKpi
        color="#3B6FD4"
        icon={<UserRoundCheck size={14} aria-hidden />}
        label="Reach → Onboard"
        value={reachOnboard.value}
        suffix={reachOnboard.suffix}
        sub={`${funnel.onboarded}/${funnel.reached} collabs`}
      />
      <HeroKpi
        color="#7B4FBF"
        icon={<Instagram size={14} aria-hidden />}
        label="Onboard → Posted"
        value={onboardPost.value}
        suffix={onboardPost.suffix}
        sub={`${funnel.posted}/${funnel.onboarded} collabs`}
      />
      <HeroKpi
        color="#4F7C4D"
        icon={<CreditCard size={14} aria-hidden />}
        label="Posted → Paid"
        value={postPaid.value}
        suffix={postPaid.suffix}
        sub={`${funnel.paid}/${funnel.posted} collabs`}
      />
      <HeroKpi
        color="#B57514"
        icon={<TrendingDown size={14} aria-hidden />}
        label="Overall"
        value={overall.value}
        suffix={overall.suffix}
        sub={`${funnel.paid}/${funnel.reached} reach → paid`}
      />
    </div>
  );
}
