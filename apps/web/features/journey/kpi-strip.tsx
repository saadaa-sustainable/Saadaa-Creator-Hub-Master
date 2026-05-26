import { Send, Users, Instagram, XCircle } from "lucide-react";
import type { JourneyKpi } from "./types";

/**
 * 4-card Journey KPI strip — mirrors structure of accounts-hub kpi-strip.tsx.
 * Tone classes use the acc-kpi-* pattern from globals.css.
 */
export function JourneyKpiStrip({ kpi }: { kpi: JourneyKpi }) {
  return (
    <div className="acc-kpi-grid">
      <KpiCard
        tone="accent"
        icon={<Send size={16} aria-hidden />}
        label="In Pipeline"
        primary={String(kpi.inPipeline)}
        secondary="total posts tracked"
      />
      <KpiCard
        tone="info"
        icon={<Users size={16} aria-hidden />}
        label="Active"
        primary={String(kpi.active)}
        secondary="reach out + on board"
      />
      <KpiCard
        tone="success"
        icon={<Instagram size={16} aria-hidden />}
        label="Posted"
        primary={String(kpi.posted)}
        secondary="posted + delivered"
      />
      <KpiCard
        tone="danger"
        icon={<XCircle size={16} aria-hidden />}
        label="Closed"
        primary={String(kpi.closed)}
        secondary="RTO + cancelled"
      />
    </div>
  );
}

function KpiCard({
  tone,
  icon,
  label,
  primary,
  secondary,
}: {
  tone: "accent" | "info" | "success" | "danger";
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className={`acc-kpi acc-kpi--${tone}`}>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          {icon}
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary tabular">{primary}</div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </div>
  );
}
