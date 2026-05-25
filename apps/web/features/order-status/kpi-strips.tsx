"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon,
  Banknote,
  Box,
  CheckCircle2,
  CircleDollarSign,
  IndianRupee,
  PackageCheck,
  RotateCcw,
  Tag,
  Ticket,
  TrendingUp,
  Truck,
  Users,
  XCircle,
} from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type {
  OrderStatusBucket,
  OrderStatusFilters,
  OrderStatusKpi,
} from "./types";

type Tone = "accent" | "muted" | "warning" | "success" | "info" | "danger";

interface KpiCardProps {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary: string;
  href?: string;
  active?: boolean;
}

/**
 * Single KPI tile — reuses Accounts Hub's `.acc-kpi` shell verbatim so
 * Order Status matches the rest of the app visually. Clickable variant
 * adds hover lift + active outline; the `href` makes it a Link tile.
 */
function KpiCard({
  tone,
  icon: Icon,
  label,
  primary,
  secondary,
  href,
  active,
}: KpiCardProps) {
  const cls = cn(
    "acc-kpi",
    `acc-kpi--${tone}`,
    href && "acc-kpi--clickable",
    active && "acc-kpi--active",
  );
  const body = (
    <>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          <Icon size={16} />
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary tabular">{primary}</div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </>
  );
  if (href) {
    return (
      <Link href={href as never} className={cls} scroll={false}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

function buildBucketHref(
  bucket: OrderStatusBucket,
  params: OrderStatusFilters,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, String(v));
  }
  if (bucket === "all") sp.delete("status");
  else sp.set("status", bucket);
  const q = sp.toString();
  return q ? `/order-status?${q}` : `/order-status`;
}

export function OrderVolumeStrip({
  kpi,
  activeBucket,
  currentParams,
}: {
  kpi: OrderStatusKpi;
  activeBucket: OrderStatusBucket;
  currentParams: OrderStatusFilters;
}) {
  return (
    <section>
      <div className="acc-kpi-group">
        <Box size={13} aria-hidden /> Order volume
      </div>
      <div className="acc-kpi-grid order-status-kpi-grid">
        <KpiCard
          tone="accent"
          icon={PackageCheck}
          label="Total Orders"
          primary={String(kpi.total)}
          secondary="All scope"
          href={buildBucketHref("all", currentParams)}
          active={activeBucket === "all"}
        />
        <KpiCard
          tone="warning"
          icon={CircleDollarSign}
          label="Pending Dispatch"
          primary={String(kpi.pendingDispatch)}
          secondary="Awaiting fulfillment"
          href={buildBucketHref("pending", currentParams)}
          active={activeBucket === "pending"}
        />
        <KpiCard
          tone="info"
          icon={Truck}
          label="In Transit"
          primary={String(kpi.inTransit)}
          secondary="Shipped · en route"
          href={buildBucketHref("transit", currentParams)}
          active={activeBucket === "transit"}
        />
        <KpiCard
          tone="success"
          icon={CheckCircle2}
          label="Delivered"
          primary={String(kpi.delivered)}
          secondary={`${kpi.deliveryRate}% delivery rate`}
          href={buildBucketHref("delivered", currentParams)}
          active={activeBucket === "delivered"}
        />
        <KpiCard
          tone="danger"
          icon={RotateCcw}
          label="RTO"
          primary={String(kpi.rto + kpi.cancelledRto)}
          secondary={`${kpi.rtoRate}% RTO rate`}
          href={buildBucketHref("rto", currentParams)}
          active={activeBucket === "rto"}
        />
        <KpiCard
          tone="muted"
          icon={XCircle}
          label="Cancelled"
          primary={String(kpi.cancelled)}
          secondary="Pre / post-RTO"
          href={buildBucketHref("cancelled", currentParams)}
          active={activeBucket === "cancelled"}
        />
      </div>
    </section>
  );
}

export function CommerceIntelStrip({ kpi }: { kpi: OrderStatusKpi }) {
  return (
    <section className="mt-3">
      <div className="acc-kpi-group">
        <IndianRupee size={13} aria-hidden /> Commerce intel
      </div>
      <div className="acc-kpi-grid order-status-kpi-grid">
        <KpiCard
          tone="accent"
          icon={Banknote}
          label="Total Revenue"
          primary={formatRupees(kpi.totalRevenue)}
          secondary="Non-cancelled"
        />
        <KpiCard
          tone="info"
          icon={TrendingUp}
          label="Avg Order Value"
          primary={formatRupees(kpi.avgOrderValue)}
          secondary="Per non-cancelled"
        />
        <KpiCard
          tone="danger"
          icon={AlertOctagon}
          label="Refunds"
          primary={formatRupees(kpi.refundedAmount)}
          secondary={`${kpi.refundedCount} orders · ${kpi.refundRate}%`}
        />
        <KpiCard
          tone="info"
          icon={Users}
          label="Repeat Creators"
          primary={String(kpi.repeatCustomerCount)}
          secondary={`${kpi.repeatCustomerRate}% of orders`}
        />
        <KpiCard
          tone="muted"
          icon={Ticket}
          label="Discount Codes"
          primary={String(kpi.discountUsedCount)}
          secondary="Orders with codes"
        />
        <KpiCard
          tone="muted"
          icon={Tag}
          label="Tagged Orders"
          primary={String(kpi.taggedCount)}
          secondary="Shopify-tagged"
        />
      </div>
    </section>
  );
}
