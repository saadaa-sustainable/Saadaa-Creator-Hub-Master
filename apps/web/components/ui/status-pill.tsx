import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import type {
  WorkflowStatus,
  AdResult,
  PaymentStatus,
} from "@/lib/supabase/types.gen";

/**
 * Status pill — replicates the legacy SPA pattern:
 * inline-block 2px 8px, 100px radius, 0.72rem 600 weight, border + bg from status token.
 */
const pill = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[0.72rem] font-semibold leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-bg-muted border-border text-text-secondary",
        success: "bg-success-bg border-success-mid text-success",
        warning: "bg-warning-bg border-warning-border text-warning",
        danger: "bg-danger-bg border-danger-mid text-danger",
        info: "bg-info-bg border-info-mid text-info",
        accent: "bg-accent-warm border-accent-amber text-text-primary",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type PillTone = NonNullable<VariantProps<typeof pill>["tone"]>;

export interface StatusPillProps extends VariantProps<typeof pill> {
  children: React.ReactNode;
  className?: string;
}

export function StatusPill({ tone, className, children }: StatusPillProps) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}

// ---------- domain-mapped helpers (so callers don't repeat the switch) ---------

const workflowToneMap: Record<WorkflowStatus, PillTone> = {
  "Reach Out": "info",
  "On Board": "accent",
  "Order Sent": "info",
  Posted: "success",
  Delivered: "success",
  RTO: "danger",
  Cancelled: "danger",
  "Cancelled After RTO": "danger",
  "Awaiting Reply": "warning",
  Declined: "neutral",
};

export function WorkflowStatusPill({ status }: { status: WorkflowStatus }) {
  return (
    <StatusPill tone={workflowToneMap[status] ?? "neutral"}>
      {status}
    </StatusPill>
  );
}

const adResultToneMap: Record<AdResult, PillTone> = {
  Winner: "success",
  ITE: "warning",
  Discarded: "danger",
  "Discarded but analyse": "info",
  Pending: "neutral",
};

export function AdResultPill({ result }: { result: AdResult | null }) {
  if (!result) return <StatusPill tone="neutral">—</StatusPill>;
  return <StatusPill tone={adResultToneMap[result]}>{result}</StatusPill>;
}

const paymentToneMap: Record<PaymentStatus, PillTone> = {
  "Not Due": "neutral",
  Due: "warning",
  Done: "success",
};

export function PaymentStatusPill({
  status,
}: {
  status: PaymentStatus | null;
}) {
  if (!status) return <StatusPill tone="neutral">—</StatusPill>;
  return <StatusPill tone={paymentToneMap[status]}>{status}</StatusPill>;
}
