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

const BUCKET_CLS: Record<OrderStatusBucket, string> = {
  all: "bg-bg-white text-text-secondary border-border",
  pending: "bg-warning-bg text-warning border-warning/20",
  transit: "bg-[#EAF1FB] text-[#2C4A8C] border-[rgba(59,111,212,0.2)]",
  delivered: "bg-success-bg text-success border-success/20",
  rto: "bg-danger-bg text-danger border-danger/20",
  cancelled: "bg-bg-white text-text-tertiary border-border",
};

/**
 * Status pill — colored by bucket. Live shopify tracking wins over manual
 * order_status when both present. Shows ·M suffix when shopify hasn't synced
 * yet so the operator knows the source.
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
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.66rem] font-bold tracking-[0.04em] px-2 py-0.5 rounded-full border whitespace-nowrap",
        BUCKET_CLS[bucket],
      )}
      title={
        shipping
          ? "From Shopify tracking_status"
          : "Manual order_status — Shopify hasn't synced yet"
      }
    >
      {label}
      {source && (
        <span className="text-[0.56rem] font-extrabold text-text-tertiary">
          ·M
        </span>
      )}
    </span>
  );
}

export function OverduePill() {
  return (
    <span
      className="inline-flex items-center text-[0.6rem] font-extrabold tracking-[0.05em] uppercase px-1.5 py-0.5 rounded-full bg-danger-bg text-danger border border-danger/20 ml-1.5"
      title="Past est_delivery"
    >
      Overdue
    </span>
  );
}
