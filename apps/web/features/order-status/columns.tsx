"use client";

import { cn } from "@/lib/cn";
import type { OrderStatusBucket } from "./types";

const BUCKET_LABEL: Record<OrderStatusBucket, string> = {
  all: "—",
  pending: "Pending Dispatch",
  transit: "In Transit",
  delivered: "Delivered",
  rto: "RTO",
  cancelled: "Cancelled",
};

const BUCKET_TONE: Record<OrderStatusBucket, string> = {
  all: "",
  pending: "warning",
  transit: "info",
  delivered: "success",
  rto: "danger",
  cancelled: "muted",
};

/**
 * Status pill — colored by bucket. Live shopify tracking wins over manual
 * order_status when both present. Shows "(MANUAL)" suffix when shopify hasn't
 * synced yet so the operator knows the source.
 */
export function ShippingStatusPill({
  shipping,
  manual,
  bucket,
}: {
  shipping: string;
  manual: string;
  bucket: OrderStatusBucket;
}) {
  const label = shipping || manual || BUCKET_LABEL[bucket];
  const source = !shipping && manual ? "manual" : "";
  const tone = BUCKET_TONE[bucket];
  return (
    <span
      className={cn("os-status-pill", tone && `os-status-pill--${tone}`)}
      title={shipping ? "From Shopify tracking_status" : "Manual order_status — Shopify hasn't synced yet"}
    >
      {label}
      {source && <span className="os-status-pill__src">·M</span>}
    </span>
  );
}

export function OverduePill() {
  return <span className="os-overdue-pill" title="Past est_delivery">Overdue</span>;
}
