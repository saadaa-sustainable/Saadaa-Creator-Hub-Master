import { cn } from "@/lib/cn";
import type { PillTone } from "./status-pill";

export interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Extract<
    PillTone,
    "neutral" | "success" | "warning" | "danger" | "info" | "accent"
  >;
  loading?: boolean;
}

const toneText: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  neutral: "text-text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  accent: "text-text-primary",
};

export function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
  loading,
}: KpiCardProps) {
  return (
    <div
      className="rounded-[var(--radius)] border border-border bg-bg-white px-4 py-3 min-w-[140px] flex flex-col gap-1"
      role="figure"
      aria-label={label}
    >
      <div className="text-[0.7rem] uppercase tracking-[0.04em] font-semibold text-text-secondary">
        {label}
      </div>
      <div
        className={cn("font-emph text-kpi tabular", toneText[tone])}
        aria-busy={loading}
      >
        {loading ? (
          <span className="inline-block h-6 w-16 animate-pulse rounded bg-bg-muted" />
        ) : (
          value
        )}
      </div>
      {sub && <div className="text-[0.72rem] text-text-tertiary">{sub}</div>}
    </div>
  );
}

export function KpiStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
      role="group"
      aria-label="Key performance indicators"
    >
      {children}
    </div>
  );
}
