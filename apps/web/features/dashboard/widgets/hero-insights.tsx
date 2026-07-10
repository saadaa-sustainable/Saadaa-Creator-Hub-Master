import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { InfoDot } from "../bento-kit";
import { CountUpInt } from "../count-up-stats";

/**
 * Top-left bento hero — the "Growth insights ready" block (per dribbble ref),
 * translated to the new-project light palette. Big tagline + 2 CTAs + ambient
 * accent glow in the upper-right.
 */
export function DashboardHero({
  totalReachOut,
  totalPosted,
  conversionPct,
  postRatePct,
}: {
  totalReachOut: number;
  totalPosted: number;
  conversionPct: number;
  postRatePct: number;
}) {
  return (
    <article
      className={cn(
        "bento-tile relative h-full overflow-hidden rounded-2xl border border-border p-5",
        "bg-bg-white",
        "flex flex-col gap-3 min-h-[210px]",
      )}
    >
      <div className="relative z-10 inline-flex items-center gap-2 self-start rounded-full bg-bg-white/80 border border-border px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
        <Sparkles size={11} className="text-accent" aria-hidden />
        Saadaa Insights
        <InfoDot
          title="Pipeline pulse"
          text="A short summary of the current pipeline. Conversion compares onboarded collaborations with reach-outs; post rate compares completed posting forms with onboarded collaborations."
        />
      </div>

      <h2 className="relative z-10 font-emph text-[1.55rem] sm:text-[1.85rem] leading-[1.05] font-bold text-text-primary">
        Pipeline pulse is{" "}
        <span className="text-[#9a7a00]">
          {postRatePct >= 50
            ? "thriving"
            : postRatePct >= 20
              ? "warming up"
              : "ramping"}
        </span>
        .
      </h2>
      <p className="relative z-10 text-[0.82rem] leading-relaxed text-text-secondary max-w-md">
        <CountUpInt value={totalReachOut} /> reach-outs →{" "}
        <CountUpInt value={totalPosted} /> posts live. Conversion at{" "}
        <strong className="text-text-primary">
          <CountUpInt value={conversionPct} />%
        </strong>
        , post-rate at{" "}
        <strong className="text-text-primary">
          <CountUpInt value={postRatePct} />%
        </strong>{" "}
        across the live scope.
      </p>

      <div className="relative z-10 mt-auto flex flex-wrap items-center gap-2">
        <Link
          href={"/posting" as never}
          className="inline-flex items-center gap-1.5 rounded-full bg-text-primary text-bg-white px-3.5 py-1.5 text-[0.72rem] font-extrabold tracking-tight hover:bg-text-primary/90"
        >
          View Posting <ArrowUpRight size={12} aria-hidden />
        </Link>
        <Link
          href={"/accounts-hub" as never}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-white/70 px-3.5 py-1.5 text-[0.72rem] font-bold text-text-primary hover:bg-bg-white"
        >
          Accounts Hub
        </Link>
      </div>
    </article>
  );
}
