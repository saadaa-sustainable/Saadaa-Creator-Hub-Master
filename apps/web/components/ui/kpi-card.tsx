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
      className="flex min-w-[132px] flex-col gap-1 rounded-[var(--radius)] border border-border bg-bg-white px-3.5 py-2.5 shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-[0_10px_24px_-22px_rgba(22,21,19,0.3)]"
      role="figure"
      aria-label={label}
    >
      <div className="text-[0.64rem] uppercase tracking-[0.04em] font-semibold text-text-secondary">
        {label}
      </div>
      <div
        className={cn("font-emph text-kpi tabular", toneText[tone])}
        aria-busy={loading}
      >
        {loading ? (
          <span className="skeleton-shimmer inline-block h-6 w-16 rounded" />
        ) : (
          value
        )}
      </div>
      {sub && <div className="text-[0.66rem] text-text-tertiary">{sub}</div>}
    </div>
  );
}

export function KpiStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4"
      role="group"
      aria-label="Key performance indicators"
    >
      {children}
    </div>
  );
}
