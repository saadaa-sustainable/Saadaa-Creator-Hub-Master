import {
  BarChart3,
  Crown,
  Gauge,
  HourglassIcon,
  Megaphone,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";
import { HeroKpi } from "@/features/dashboard/bento-kit";
import type { AdStatusKpi } from "./types";

/**
 * KPI strip for the Ad Status stage — bento-kit `HeroKpi` tiles inside the
 * shared `.acc-kpi-grid` (mobile stays paired 2-up). Pipeline tiles first
 * (Eligible / Untested / In Meta Ads), then the six warehouse categories in
 * best→worst order, mirroring the Creative Testing Dashboard. Semantic
 * colors: volume indigo, pending amber, winner-class green, risk red.
 */
export function AdStatusKpiStrip({ kpi }: { kpi: AdStatusKpi }) {
  const c = kpi.categories;
  return (
    <section>
      <div className="acc-kpi-grid bento-stagger">
        <HeroKpi
          color="#3B6FD4"
          icon={<Megaphone size={14} aria-hidden />}
          label="Eligible"
          value={kpi.totalEligible}
          sub="Posted + ads rights"
        />
        <HeroKpi
          color="#B57514"
          icon={<HourglassIcon size={14} aria-hidden />}
          label="Untested"
          value={kpi.pendingClassification}
          sub="Awaiting warehouse sync"
        />
        <HeroKpi
          color="#7B4FBF"
          icon={<BarChart3 size={14} aria-hidden />}
          label="In Meta Ads"
          value={kpi.inMetaAds}
          sub="Matched in warehouse"
        />
        <HeroKpi
          color="#3D6B3B"
          icon={<Crown size={14} aria-hidden />}
          label="Incr. Winners"
          value={c.incrementalWinners}
          sub="All four gates passed"
        />
        <HeroKpi
          color="#4F7C4D"
          icon={<Trophy size={14} aria-hidden />}
          label="Winners"
          value={c.winners}
          sub="Scale + returns proven"
        />
        <HeroKpi
          color="#3B6FD4"
          icon={<Target size={14} aria-hidden />}
          label="P0 Analysis"
          value={c.p0}
          sub="Scale + visitor cost pass"
        />
        <HeroKpi
          color="#B57514"
          icon={<Gauge size={14} aria-hidden />}
          label="P1 Analysis"
          value={c.p1}
          sub="Scale gate only"
        />
        <HeroKpi
          color="#B57514"
          icon={<TrendingUp size={14} aria-hidden />}
          label="P2 Analysis"
          value={c.p2}
          sub="Returns without scale"
        />
        <HeroKpi
          color="#C0392B"
          icon={<XCircle size={14} aria-hidden />}
          label="Discarded"
          value={c.discarded}
          sub="No gates cleared"
        />
      </div>
    </section>
  );
}
