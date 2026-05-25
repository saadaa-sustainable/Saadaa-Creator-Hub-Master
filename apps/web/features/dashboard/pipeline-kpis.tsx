import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Instagram,
  Send,
  Trophy,
  UserCheck,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { DashboardData } from "./types";

type Tone = "accent" | "muted" | "warning" | "success" | "info" | "danger";

const TONE: Record<Tone, string> = {
  accent: "acc-kpi--accent",
  muted: "acc-kpi--muted",
  warning: "acc-kpi--warning",
  success: "acc-kpi--success",
  info: "acc-kpi--info",
  danger: "acc-kpi--danger",
};

function Tile({
  tone,
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  primary: string | number;
  secondary: string;
}) {
  return (
    <div className={cn("acc-kpi", TONE[tone])}>
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

export function DashboardPipelineKpis({
  pipeline,
}: {
  pipeline: DashboardData["pipeline"];
}) {
  return (
    <section>
      <div className="acc-kpi-group">Pipeline</div>
      <div className="acc-kpi-grid acc-kpi-grid--six">
        <Tile
          tone="info"
          icon={Send}
          label="Reach Outs"
          primary={pipeline.reachOut}
          secondary="First contacts"
        />
        <Tile
          tone="accent"
          icon={UserCheck}
          label="Onboarded"
          primary={pipeline.onboarded}
          secondary={`Conversion ${pipeline.conversionPct}%`}
        />
        <Tile
          tone="success"
          icon={Instagram}
          label="Posted"
          primary={pipeline.posted}
          secondary={`Post rate ${pipeline.postRatePct}%`}
        />
        <Tile
          tone="warning"
          icon={Clock}
          label="Pending Content"
          primary={pipeline.pendingContent}
          secondary="Onboarded · no post yet"
        />
        <Tile
          tone="danger"
          icon={Wallet}
          label="Payment Pending"
          primary={pipeline.paymentPending}
          secondary="Awaiting UTR"
        />
        <Tile
          tone="muted"
          icon={Trophy}
          label="Ad Winners"
          primary={pipeline.adWinners}
          secondary="≥ 50K · ROAS ≥ 3"
        />
      </div>
    </section>
  );
}
