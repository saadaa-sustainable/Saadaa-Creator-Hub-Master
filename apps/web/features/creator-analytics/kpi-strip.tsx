import Link from "next/link";
import { BarChart3, Megaphone, Trophy, UserRoundX } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/formatters";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { CreatorAdsKpi } from "./types";

/**
 * Clickable Meta Ads KPI tiles for the creator roster — rendered between the
 * filter bar and the board (filter-above-KPI rule), reusing the shared
 * `.acc-kpi` bento vocabulary. Each tile is a <Link> that sets the `ads`
 * filter param (clicking the active tile clears it); counts are full-base,
 * from the same cached `creator_ads_rollup` the page filter uses. "Ad Spend"
 * is informational only.
 */
export function CreatorAdsKpiStrip({
  kpi,
  active,
  sp,
}: {
  kpi: CreatorAdsKpi;
  active: string | null;
  sp: Record<string, string | undefined>;
}) {
  const hrefFor = (value: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v) next.set(k, v);
    }
    // Toggle: clicking the active tile clears the ads filter.
    if (active === value) next.delete("ads");
    else next.set("ads", value);
    next.delete("cpage");
    next.delete("page");
    return `/dashboard?${next.toString()}`;
  };

  return (
    <div className="acc-kpi-grid">
      <KpiTile
        tone="accent"
        icon={<Megaphone size={16} aria-hidden />}
        label="In Meta Ads"
        primary={String(kpi.inAds)}
        secondary="Creators with ≥1 ad"
        info="Unique creators with at least one Meta ad matched to their content. Each creator is counted once."
        href={hrefFor("in-ads")}
        active={active === "in-ads"}
      />
      <KpiTile
        tone="success"
        icon={<Trophy size={16} aria-hidden />}
        label="Winner Creators"
        primary={String(kpi.winners)}
        secondary="≥1 winner-class ad"
        info="Unique creators who have at least one ad classified as a Winner using the Ad Status performance rules."
        href={hrefFor("winners")}
        active={active === "winners"}
      />
      <KpiTile
        tone="warning"
        icon={<UserRoundX size={16} aria-hidden />}
        label="Winners · Not Working"
        primary={String(kpi.winnersIdle)}
        secondary="Winner ads, no live collab"
        info="Creators with proven winner ads but no current live collaboration in the active pipeline."
        href={hrefFor("winners-idle")}
        active={active === "winners-idle"}
      />
      <div className="relative min-w-0">
        <div className="acc-kpi acc-kpi--info h-full">
          <div className="acc-kpi__head">
            <span className="acc-kpi__icon" aria-hidden>
              <BarChart3 size={16} aria-hidden />
            </span>
            <span className="acc-kpi__label">Ad Spend</span>
          </div>
          <div className="acc-kpi__primary tabular">
            {formatRupees(kpi.spend)}
          </div>
          <div className="acc-kpi__secondary tabular">
            Across all creator ads
          </div>
        </div>
        <InfoTooltip
          title="Ad Spend"
          content="Total Meta spend across ads matched to creators in this roster. It is not the creator commercial payment amount."
          className="absolute right-2.5 top-2.5"
        />
      </div>
    </div>
  );
}

function KpiTile({
  tone,
  icon,
  label,
  primary,
  secondary,
  href,
  active,
  info,
}: {
  tone: "accent" | "success" | "warning";
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  href: string;
  active: boolean;
  info: string;
}) {
  return (
    <div className="relative min-w-0">
      <Link
        href={href as never}
        scroll={false}
        className={cn(
          "acc-kpi acc-kpi--clickable h-full",
          `acc-kpi--${tone}`,
          active && "acc-kpi--active",
        )}
        aria-pressed={active}
      >
        <div className="acc-kpi__head">
          <span className="acc-kpi__icon" aria-hidden>
            {icon}
          </span>
          <span className="acc-kpi__label">{label}</span>
        </div>
        <div className="acc-kpi__primary tabular">{primary}</div>
        <div className="acc-kpi__secondary tabular">{secondary}</div>
      </Link>
      <InfoTooltip
        title={label}
        content={info}
        className="absolute right-2.5 top-2.5"
      />
    </div>
  );
}
