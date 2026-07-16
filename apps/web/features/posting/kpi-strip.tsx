import {
  AlarmClock,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Send,
} from "lucide-react";
import type { PostingKpi } from "./types";

/**
 * Posting KPI strip — closes the Analytics-Matrix gap (the Posting page had no
 * KPI strip). Reuses the shared `.acc-kpi-grid` / `.acc-kpi--{tone}` classes so
 * the visual + responsive bento pattern matches other stages. Rendered between
 * the filter bar and the board (filter-above-KPI rule). Counts are per-post_id
 * (one deliverable per row): Submitted = post_ids Posted, Posts Due = post_ids
 * yet to be submitted. (No separate "Pending" tile — it duplicated Posts Due.)
 */
export function PostingKpiStrip({ kpi }: { kpi: PostingKpi }) {
  return (
    <section className="acc-kpi-grid">
      <KpiCard
        tone="accent"
        icon={<ListChecks size={16} aria-hidden />}
        label="Posts Due"
        primary={String(kpi.totalPostsDue)}
        secondary="Post IDs yet to submit"
      />
      <KpiCard
        tone="success"
        icon={<Send size={16} aria-hidden />}
        label="Submitted"
        primary={String(kpi.totalPostsSubmitted)}
        secondary="Post IDs posted"
      />
      <KpiCard
        tone="info"
        icon={<CheckCircle2 size={16} aria-hidden />}
        label="Completion Rate"
        primary={`${kpi.completionRate}%`}
        secondary="Submitted ÷ total"
      />
      <KpiCard
        tone="danger"
        icon={<AlarmClock size={16} aria-hidden />}
        label="Delayed"
        primary={String(kpi.delayedPosts)}
        secondary="Posted after expected"
      />
      <KpiCard
        tone="warning"
        icon={<AlertTriangle size={16} aria-hidden />}
        label="Overdue"
        primary={String(kpi.overdue)}
        secondary=">15 days, no post yet"
      />
    </section>
  );
}

function KpiCard({
  tone,
  icon,
  label,
  primary,
  secondary,
}: {
  tone: "accent" | "muted" | "warning" | "success" | "info" | "danger";
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
