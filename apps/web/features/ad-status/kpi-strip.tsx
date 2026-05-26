"use client";

import { AlertTriangle, HourglassIcon, Megaphone, Trophy, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AdStatusKpi } from "./types";

type Tone = "accent" | "muted" | "warning" | "success" | "info" | "danger";

interface KpiCardProps {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary: string;
}

function KpiCard({ tone, icon: Icon, label, primary, secondary }: KpiCardProps) {
  return (
    <div className={cn("acc-kpi", `acc-kpi--${tone}`)}>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          <Icon size={16} />
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary tabular">{primary}</div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </div>
  );
}

export function AdStatusKpiStrip({
  kpi,
  warehouseConnected,
}: {
  kpi: AdStatusKpi;
  warehouseConnected: boolean;
}) {
  return (
    <section>
      {!warehouseConnected && (
        <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 mb-3">
          <AlertTriangle size={13} aria-hidden />
          Meta Ads warehouse not configured — In Meta Ads count shows 0. Set
          META_ADS_SUPABASE_URL + META_ADS_SUPABASE_SERVICE_KEY to connect.
        </div>
      )}
      <div className="acc-kpi-grid">
        <KpiCard
          tone="accent"
          icon={Megaphone}
          label="Eligible"
          primary={String(kpi.totalEligible)}
          secondary="Posted + ads rights"
        />
        <KpiCard
          tone="warning"
          icon={HourglassIcon}
          label="Untested"
          primary={String(kpi.pendingClassification)}
          secondary="Awaiting warehouse sync"
        />
        <KpiCard
          tone="success"
          icon={Trophy}
          label="Winners"
          primary={String(kpi.winners)}
          secondary="Top-performing creatives"
        />
        <KpiCard
          tone="danger"
          icon={XCircle}
          label="Discarded"
          primary={String(kpi.discarded)}
          secondary="Failed performance"
        />
      </div>
    </section>
  );
}
