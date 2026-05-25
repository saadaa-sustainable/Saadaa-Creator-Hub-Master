"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Grid3X3, List as ListIcon, ExternalLink, Truck } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import { OverduePill, ShippingStatusPill } from "./columns";
import type { OrderStatusFilters, OrderStatusRow } from "./types";

/**
 * Order Status board — view toggle + List/Cards. Client-side search +
 * financial + discount + repeat filters apply on top of the URL-driven
 * server filters (campaign + collab + status bucket).
 */
export function OrderStatusBoard({
  rows,
  initialView = "list",
  filters,
}: {
  rows: OrderStatusRow[];
  initialView?: "list" | "cards";
  filters: OrderStatusFilters;
}) {
  const [view, setView] = useState<"list" | "cards">(initialView);

  const filtered = useMemo(() => {
    const q = (filters.search ?? "").trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.status && filters.status !== "all" && r.bucket !== filters.status)
        return false;
      if (filters.financial) {
        const fs = String(r.financialStatus ?? "").toLowerCase();
        if (filters.financial === "paid" && fs !== "paid") return false;
        if (filters.financial === "refunded" && fs !== "refunded") return false;
        if (filters.financial === "partially_refunded" && fs !== "partially_refunded")
          return false;
        if (filters.financial === "pending" && fs !== "pending") return false;
      }
      if (filters.discount === "yes" && !r.discountCodes) return false;
      if (filters.discount === "no" && r.discountCodes) return false;
      if (filters.repeat === "yes" && r.customerOrderCount <= 1) return false;
      if (filters.repeat === "no" && r.customerOrderCount > 1) return false;
      if (q) {
        const hay =
          `${r.name} ${r.username} ${r.orderId} ${r.trackingId} ${r.campaign}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  return (
    <section className="onboarding-stage__board">
      <div className="os-toolbar">
        <span className="os-toolbar__count tabular">
          {filtered.length} order{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="ob-viewtoggle" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={cn(view === "list" && "active")}
            onClick={() => setView("list")}
          >
            <ListIcon size={12} aria-hidden /> List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards"}
            className={cn(view === "cards" && "active")}
            onClick={() => setView("cards")}
          >
            <Grid3X3 size={12} aria-hidden /> Cards
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="os-empty">
          <Truck size={28} aria-hidden />
          <p>No orders match these filters.</p>
        </div>
      ) : view === "list" ? (
        <OrderListTable rows={filtered} />
      ) : (
        <OrderCardsGrid rows={filtered} />
      )}
    </section>
  );
}

function OrderListTable({ rows }: { rows: OrderStatusRow[] }) {
  return (
    <div className="os-table-wrap">
      <table className="os-table">
        <thead>
          <tr>
            <th>Creator</th>
            <th>Campaign</th>
            <th>Order ID</th>
            <th>Status</th>
            <th>Tracking</th>
            <th>Est Delivery</th>
            <th className="text-right">Total</th>
            <th>Placed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.postId}>
              <td>
                <div className="os-cell-creator">
                  <Avatar src={r.profilePicUrl} username={r.username} name={r.name} size={32} />
                  <div className="os-cell-creator__text">
                    <strong>{r.name || r.username || "—"}</strong>
                    {r.username && <span>@{r.username}</span>}
                  </div>
                </div>
              </td>
              <td>
                <span className="campaign-chip">{r.campaign || "—"}</span>
              </td>
              <td className="tabular">
                {r.orderId}
                {r.isOverdue && (
                  <>
                    {" "}
                    <OverduePill />
                  </>
                )}
              </td>
              <td>
                <ShippingStatusPill
                  shipping={r.shippingStatus}
                  manual={r.orderStatus}
                  bucket={r.bucket}
                />
              </td>
              <td className="tabular">{r.trackingId || "—"}</td>
              <td className="tabular">{formatDate(r.estDelivery)}</td>
              <td className="text-right tabular">
                {r.totalPrice > 0 ? formatRupees(r.totalPrice) : "—"}
              </td>
              <td className="tabular">{formatDate(r.orderPlaced)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderCardsGrid({ rows }: { rows: OrderStatusRow[] }) {
  return (
    <div className="os-cards-grid">
      {rows.map((r) => (
        <article key={r.postId} className={cn("os-card", r.isOverdue && "os-card--overdue")}>
          <header className="os-card-head">
            <Avatar src={r.profilePicUrl} username={r.username} name={r.name} size={40} />
            <div className="os-card-identity">
              <strong>{r.name || r.username || "—"}</strong>
              <span>@{r.username}</span>
            </div>
            <ShippingStatusPill
              shipping={r.shippingStatus}
              manual={r.orderStatus}
              bucket={r.bucket}
            />
          </header>
          <div className="os-card-pills">
            <span className="campaign-chip">{r.campaign || "—"}</span>
            {r.category && <span className="pill pill--muted">{r.category}</span>}
            {r.collabType && <span className="pill pill--muted">{r.collabType}</span>}
            {r.isOverdue && <OverduePill />}
          </div>
          <div className="os-card-meta-grid">
            <Meta label="Order ID" value={r.orderId} mono />
            <Meta label="Tracking" value={r.trackingId || "—"} mono />
            <Meta label="Est Delivery" value={formatDate(r.estDelivery)} />
            <Meta label="Delivery Date" value={formatDate(r.deliveryDate)} />
            <Meta label="Total" value={r.totalPrice > 0 ? formatRupees(r.totalPrice) : "—"} mono />
            <Meta
              label="Refund"
              value={r.refundAmount > 0 ? formatRupees(r.refundAmount) : "—"}
              danger={r.refundAmount > 0}
            />
          </div>
          {r.fulfillmentEvents && (
            <div className="os-card-events" title={r.fulfillmentEvents}>
              <strong>Events:</strong> {r.fulfillmentEvents}
            </div>
          )}
          <footer className="os-card-foot">
            <span>Placed {formatDate(r.orderPlaced)}</span>
            <Link
              href={`/creators/${encodeURIComponent(r.username)}`}
              className="os-card-foot__link"
            >
              Open creator <ExternalLink size={11} aria-hidden />
            </Link>
          </footer>
        </article>
      ))}
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
  danger,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="os-card-meta">
      <span className="os-card-meta-label">{label}</span>
      <span
        className={cn(
          "os-card-meta-val",
          mono && "tabular",
          danger && "os-card-meta-val--danger",
          (!value || value === "—") && "os-card-meta-val--muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}
