import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock,
} from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import type { AccountsKpi } from "./types";

/**
 * 4-card Accounts Hub KPI strip — mirrors legacy `acc-kpi-grid`
 * (Index.html:6909-6930). KPIs always reflect the global corpus (NOT
 * filtered) so operators can track Done-vs-Due gap independently.
 */
export function AccountsKpiStrip({ kpi }: { kpi: AccountsKpi }) {
  return (
    <div className="acc-kpi-grid">
      <KpiCard
        tone="accent"
        icon={<CheckCircle2 size={16} aria-hidden />}
        label="Posts Done"
        primary={String(kpi.postsDone)}
        secondary={
          kpi.totalPayable > 0
            ? `${formatRupees(kpi.totalPayable)} payable`
            : "Pending payments"
        }
      />
      <KpiCard
        tone="muted"
        icon={<Clock size={16} aria-hidden />}
        label="Not Due"
        primary={String(kpi.notDue.count)}
        secondary={formatRupees(kpi.notDue.sum)}
      />
      <KpiCard
        tone="warning"
        icon={<CircleDollarSign size={16} aria-hidden />}
        label="Due"
        primary={String(kpi.due.count)}
        secondary={formatRupees(kpi.due.sum)}
      />
      <KpiCard
        tone="danger"
        icon={<AlertTriangle size={16} aria-hidden />}
        label="Partial / Outstanding"
        primary={String(kpi.partial.count)}
        secondary={
          kpi.partial.count > 0
            ? `${formatRupees(kpi.partial.sum)} balance pending`
            : "All settled"
        }
      />
      <KpiCard
        tone="success"
        icon={<Banknote size={16} aria-hidden />}
        label="Done"
        primary={String(kpi.done.count)}
        secondary={formatRupees(kpi.done.sum)}
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
  tone: "accent" | "muted" | "warning" | "success" | "danger";
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
