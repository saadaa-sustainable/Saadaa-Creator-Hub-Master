import { cva, type VariantProps } from "class-variance-authority";
import { Ban, Handshake } from "lucide-react";
import { cn } from "@/lib/cn";
import { workflowStatusLabel } from "@/lib/formatters";
import {
  PARTNERSHIP_STATE_LABELS,
  parseStoredPartnershipState,
  type PartnershipState,
} from "@/lib/partnership";
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

/**
 * Deactivated badge — shown on any creator surface (cards, analytics, pickers)
 * when `creators.is_active = false` (dead/mangled IG handle, no profile_id, or
 * Meta Invalid-user-id). Renders nothing when the creator is active or unknown.
 * One shared component so the label stays identical everywhere.
 */
export function DeactivatedBadge({
  isActive,
  className,
}: {
  isActive?: boolean | null;
  className?: string;
}) {
  if (isActive !== false) return null;
  return (
    <StatusPill tone="danger" className={className}>
      <Ban size={10} aria-hidden />
      Deactivated
    </StatusPill>
  );
}

/**
 * Partnership badge — the creator's Meta branded-content permission state
 * (posts.partnership_status, stamped by lib/partnership-sync.ts). One shared
 * component so the labels stay identical on every surface (posting form,
 * board, journey, accounts hub). Renders nothing when no state is stored —
 * pass showEmpty to render the "No partnership yet" neutral pill instead.
 */
const partnershipToneMap: Record<PartnershipState, PillTone> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  revoked: "danger",
  none: "neutral",
  unknown: "neutral",
};

export function PartnershipBadge({
  status,
  showEmpty = false,
  className,
}: {
  /** Raw posts.partnership_status value (or a PartnershipState). */
  status?: string | null;
  showEmpty?: boolean;
  className?: string;
}) {
  const state = parseStoredPartnershipState(status);
  if (!state) {
    if (!showEmpty) return null;
    return (
      <StatusPill tone="neutral" className={className}>
        <Handshake size={10} aria-hidden />
        {PARTNERSHIP_STATE_LABELS.none}
      </StatusPill>
    );
  }
  return (
    <StatusPill tone={partnershipToneMap[state]} className={className}>
      <Handshake size={10} aria-hidden />
      {PARTNERSHIP_STATE_LABELS[state]}
    </StatusPill>
  );
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
  Offboarding: "neutral",
  Offboarded: "neutral",
  "Awaiting Reply": "warning",
  Declined: "neutral",
};

export function WorkflowStatusPill({ status }: { status: WorkflowStatus }) {
  return (
    <StatusPill tone={workflowToneMap[status] ?? "neutral"}>
      {workflowStatusLabel(status)}
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
  Partial: "warning",
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
