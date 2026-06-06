import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Clock, IndianRupee, UserMinus } from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { OffboardingKpi } from "./types";

type Tone = "accent" | "muted" | "warning" | "success";

function KpiCard({
  tone,
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary: string;
}) {
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

export function OffboardingKpiStrip({ kpi }: { kpi: OffboardingKpi }) {
  return (
    <section>
      <div className="acc-kpi-group">
        <UserMinus size={13} aria-hidden /> Offboarding overview
      </div>
      <div className="acc-kpi-grid">
        <KpiCard
        tone="muted"
        icon={UserMinus}
        label="Offboarding"
        primary={String(kpi.total)}
        secondary="collabs in terminal stage"
      />
      <KpiCard
        tone="warning"
        icon={Clock}
        label="Awaiting Payment"
        primary={String(kpi.awaitingPayment)}
        secondary="still due in Accounts Hub"
      />
      <KpiCard
        tone="success"
        icon={CheckCircle2}
        label="Fully Paid"
        primary={String(kpi.paid)}
        secondary="payment marked Done"
      />
      <KpiCard
        tone="accent"
        icon={IndianRupee}
        label="Committed Spend"
        primary={formatRupees(kpi.totalCommercials)}
        secondary="agreed commercials total"
      />
      </div>
    </section>
  );
}
