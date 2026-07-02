import { HourglassIcon, Megaphone, Trophy, XCircle } from "lucide-react";
import { HeroKpi } from "@/features/dashboard/bento-kit";
import type { AdStatusKpi } from "./types";

/**
 * KPI strip for the Ad Status stage — bento-kit `HeroKpi` tiles inside the
 * shared `.acc-kpi-grid` (mobile stays paired 2-up). Labels/values/subs are
 * byte-identical to the previous acc-kpi cards; only the visual layer changed.
 * Semantic colors: volume indigo, pending amber, success green, risk red.
 */
export function AdStatusKpiStrip({ kpi }: { kpi: AdStatusKpi }) {
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
          color="#4F7C4D"
          icon={<Trophy size={14} aria-hidden />}
          label="Winners"
          value={kpi.winners}
          sub="Top-performing creatives"
        />
        <HeroKpi
          color="#C0392B"
          icon={<XCircle size={14} aria-hidden />}
          label="Discarded"
          value={kpi.discarded}
          sub="Failed performance"
        />
      </div>
    </section>
  );
}
