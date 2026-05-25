"use client";

import { Box, IndianRupee } from "lucide-react";
import Link from "next/link";
import { formatRupees } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { OrderStatusBucket, OrderStatusKpi } from "./types";

interface VolumeProps {
  kpi: OrderStatusKpi;
  activeBucket: OrderStatusBucket;
  buildHref: (bucket: OrderStatusBucket) => string;
}

/**
 * Top KPI strip — 6 clickable status buckets. Click any tile to filter the
 * table to that bucket. Mirrors legacy `.os-kpi-strip`.
 */
export function OrderVolumeStrip({ kpi, activeBucket, buildHref }: VolumeProps) {
  const tiles: Array<{
    key: OrderStatusBucket;
    label: string;
    value: number | string;
    sub: string;
    tone?: "warning" | "info" | "success" | "danger";
  }> = [
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
    <section className="os-kpi-block">
      <div className="os-section-title">
        <Box size={13} aria-hidden /> Order volume
      </div>
      <div className="os-kpi-strip">
        {tiles.map((t) => (
          <Link
            key={t.key}
            // typedRoutes can't infer dynamic query strings — cast to bypass.
            href={buildHref(t.key) as never}
            className={cn(
              "os-kpi",
              activeBucket === t.key && "os-kpi--active",
            )}
            scroll={false}
          >
            <div className="os-kpi-label">{t.label}</div>
            <div className={cn("os-kpi-val tabular", t.tone && `os-kpi-val--${t.tone}`)}>
              {t.value}
            </div>
            <div className="os-kpi-sub">{t.sub}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Bottom KPI strip — commerce intel (revenue / refunds / discount / repeat /
 * tags). Read-only, no click. Mirrors legacy `.os-kpi-strip.financial`.
 */
export function CommerceIntelStrip({ kpi }: { kpi: OrderStatusKpi }) {
  const tiles: Array<{ label: string; value: string; sub: string; tone?: string }> = [
    {
      label: "Total Revenue",
      value: formatRupees(kpi.totalRevenue),
      sub: "Non-cancelled · ₹",
    },
    {
      label: "Avg Order Value",
      value: formatRupees(kpi.avgOrderValue),
      sub: "Per non-cancelled",
    },
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
    {
      label: "Discount Codes",
      value: String(kpi.discountUsedCount),
      sub: "Orders with codes",
    },
    {
      label: "Tagged Orders",
      value: String(kpi.taggedCount),
      sub: "Shopify-tagged",
    },
  ];
  return (
    <section className="os-kpi-block">
      <div className="os-section-title">
        <IndianRupee size={13} aria-hidden /> Commerce intel
      </div>
      <div className="os-kpi-strip os-kpi-strip--financial">
        {tiles.map((t) => (
          <div key={t.label} className="os-kpi os-kpi--readonly">
            <div className="os-kpi-label">{t.label}</div>
            <div className={cn("os-kpi-val tabular", t.tone && `os-kpi-val--${t.tone}`)}>
              {t.value}
            </div>
            <div className="os-kpi-sub">{t.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
