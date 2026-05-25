"use client";

import Link from "next/link";
import { Box, IndianRupee } from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type {
  OrderStatusBucket,
  OrderStatusFilters,
  OrderStatusKpi,
} from "./types";

interface VolumeProps {
  kpi: OrderStatusKpi;
  activeBucket: OrderStatusBucket;
  currentParams: OrderStatusFilters;
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

const TONE_TEXT = {
  neutral: "text-text-primary",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
  danger: "text-danger",
} as const;

type Tone = keyof typeof TONE_TEXT;

interface TileProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  href?: string;
  active?: boolean;
}

function Tile({ label, value, sub, tone = "neutral", href, active }: TileProps) {
  const body = (
    <>
      <div className="text-[0.6rem] font-bold uppercase tracking-[0.08em] text-text-tertiary truncate">
        {label}
      </div>
      <div
        className={cn(
          "font-emph text-[1.35rem] leading-tight font-bold tabular truncate mt-1",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[0.68rem] text-text-tertiary truncate mt-0.5">
          {sub}
        </div>
      )}
    </>
  );

  const baseCls =
    "block min-w-0 rounded-[var(--radius)] border border-border bg-bg-white px-3.5 py-3 transition";
  const clickableCls =
    "hover:-translate-y-0.5 hover:border-text-primary hover:shadow-[0_6px_14px_-8px_rgba(22,21,19,0.12)]";
  const activeCls = "border-text-primary shadow-[0_0_0_2px_rgba(22,21,19,0.05)]";

  if (href) {
    return (
      <Link
        href={href as never}
        scroll={false}
        className={cn(baseCls, clickableCls, active && activeCls)}
      >
        {body}
      </Link>
    );
  }
  return <div className={baseCls}>{body}</div>;
}

function StripHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2 ml-1 text-[0.66rem] font-bold uppercase tracking-[0.08em] text-text-secondary">
      {icon}
      {label}
    </div>
  );
}

export function OrderVolumeStrip({
  kpi,
  activeBucket,
  currentParams,
}: VolumeProps) {
  const tiles: Array<{ key: OrderStatusBucket; label: string; value: number; sub: string; tone?: Tone }> = [
    { key: "all", label: "Total Orders", value: kpi.total, sub: "All scope" },
    {
      key: "pending",
      label: "Pending Dispatch",
      value: kpi.pendingDispatch,
      sub: "Awaiting fulfillment",
      tone: "warning",
    },
    {
      key: "transit",
      label: "In Transit",
      value: kpi.inTransit,
      sub: "Shipped, en route",
      tone: "info",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: kpi.delivered,
      sub: `${kpi.deliveryRate}% delivery rate`,
      tone: "success",
    },
    {
      key: "rto",
      label: "RTO",
      value: kpi.rto + kpi.cancelledRto,
      sub: `${kpi.rtoRate}% RTO rate`,
      tone: "danger",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: kpi.cancelled,
      sub: "Pre / post-RTO",
    },
  ];
  return (
    <section className="mb-4">
      <StripHeader icon={<Box size={13} aria-hidden />} label="Order volume" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {tiles.map((t) => (
          <Tile
            key={t.key}
            label={t.label}
            value={t.value}
            sub={t.sub}
            tone={t.tone}
            href={buildBucketHref(t.key, currentParams)}
            active={activeBucket === t.key}
          />
        ))}
      </div>
    </section>
  );
}

export function CommerceIntelStrip({ kpi }: { kpi: OrderStatusKpi }) {
  const tiles: Array<{ label: string; value: string; sub: string; tone?: Tone }> = [
    { label: "Total Revenue", value: formatRupees(kpi.totalRevenue), sub: "Non-cancelled" },
    { label: "Avg Order Value", value: formatRupees(kpi.avgOrderValue), sub: "Per non-cancelled" },
    {
      label: "Refunds",
      value: formatRupees(kpi.refundedAmount),
      sub: `${kpi.refundedCount} orders · ${kpi.refundRate}%`,
      tone: "danger",
    },
    {
      label: "Repeat Creators",
      value: String(kpi.repeatCustomerCount),
      sub: `${kpi.repeatCustomerRate}% of orders`,
      tone: "info",
    },
    { label: "Discount Codes", value: String(kpi.discountUsedCount), sub: "Orders with codes" },
    { label: "Tagged Orders", value: String(kpi.taggedCount), sub: "Shopify-tagged" },
  ];
  return (
    <section className="mb-4">
      <StripHeader icon={<IndianRupee size={13} aria-hidden />} label="Commerce intel" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {tiles.map((t) => (
          <Tile key={t.label} label={t.label} value={t.value} sub={t.sub} tone={t.tone} />
        ))}
      </div>
    </section>
  );
}
