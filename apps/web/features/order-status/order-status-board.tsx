"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Grid3X3, List as ListIcon, Truck } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import { OverduePill, ShippingStatusPill } from "./columns";
import type { OrderStatusFilters, OrderStatusRow } from "./types";

/**
 * Order Status board — view toggle + List / Cards.
 * Reuses existing shared classes from Onboarding/Posting so the visual
 * language stays consistent across stages:
 *   - `.ob-viewtoggle` for the List/Cards toggle.
 *   - `.ob-list-wrap` + table primitives for the list view.
 *   - `.ob-card-grid` + `.ob-card-*` for the card view.
 * Client-side search + financial + discount + repeat filters apply on top
 * of the URL-driven server filters (campaign + collab + status bucket).
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
        if (
          filters.financial === "partially_refunded" &&
          fs !== "partially_refunded"
        )
          return false;
        if (filters.financial === "pending" && fs !== "pending") return false;
      }
      if (filters.discount === "yes" && !r.discountCodes) return false;
      if (filters.discount === "no" && r.discountCodes) return false;
      if (filters.repeat === "yes" && r.customerOrderCount <= 1) return false;
      if (filters.repeat === "no" && r.customerOrderCount > 1) return false;
      if (q) {
        const hay = `${r.name} ${r.username} ${r.orderId} ${r.trackingId} ${r.campaign}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className="text-xs font-bold tabular text-text-secondary bg-bg-ecru border border-border rounded-full px-3 py-1">
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
            <ListIcon size={12} aria-hidden />
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cards"}
            className={cn(view === "cards" && "active")}
            onClick={() => setView("cards")}
          >
            <Grid3X3 size={12} aria-hidden />
            Cards
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ob-empty">
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
    <div className="ob-list-wrap">
      <table className="ob-list-table">
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
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar
                    src={r.profilePicUrl}
                    username={r.username}
                    name={r.name}
                    size={32}
                  />
                  <div className="flex flex-col min-w-0">
                    <strong className="truncate text-[0.84rem] text-text-primary">
                      {r.name || r.username || "—"}
                    </strong>
                    {r.username && (
                      <span className="truncate text-[0.7rem] text-text-tertiary">
                        @{r.username}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td>
                <span className="campaign-chip">{r.campaign || "—"}</span>
              </td>
              <td className="tabular whitespace-nowrap">
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
    <div className="ob-card-grid">
      {rows.map((r) => (
        <article
          key={r.postId}
          className={cn(
            "ob-card",
            r.bucket === "delivered"
              ? "ob-card-onboarded"
              : r.bucket === "rto" || r.isOverdue
                ? "ob-card-pending"
                : "",
          )}
        >
          <div className="ob-card-head">
            <Avatar
              src={r.profilePicUrl}
              username={r.username}
              name={r.name}
              size={40}
              className="ob-card-avatar"
            />
            <div className="ob-card-id min-w-0">
              <strong className="truncate">
                {r.name || r.username || "—"}
              </strong>
              <span className="truncate text-text-tertiary">@{r.username}</span>
            </div>
            <ShippingStatusPill
              shipping={r.shippingStatus}
              manual={r.orderStatus}
              bucket={r.bucket}
            />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="campaign-chip">{r.campaign || "—"}</span>
            {r.category && (
              <span className="pill pill--muted">{r.category}</span>
            )}
            {r.collabType && (
              <span className="pill pill--muted">{r.collabType}</span>
            )}
            {r.isOverdue && <OverduePill />}
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 bg-bg-base border border-border rounded-[10px]">
            <Meta label="Order ID" value={r.orderId} mono />
            <Meta label="Tracking" value={r.trackingId || "—"} mono />
            <Meta label="Est Delivery" value={formatDate(r.estDelivery)} />
            <Meta label="Delivery Date" value={formatDate(r.deliveryDate)} />
            <Meta
              label="Total"
              value={r.totalPrice > 0 ? formatRupees(r.totalPrice) : "—"}
              mono
            />
            <Meta
              label="Refund"
              value={r.refundAmount > 0 ? formatRupees(r.refundAmount) : "—"}
              danger={r.refundAmount > 0}
            />
          </dl>

          {r.fulfillmentEvents && (
            <div
              className="mt-2 text-[0.72rem] text-text-secondary truncate bg-bg-ecru border border-border rounded-md px-2.5 py-1.5"
              title={r.fulfillmentEvents}
            >
              <strong className="text-text-primary mr-1">Events:</strong>
              {r.fulfillmentEvents}
            </div>
          )}

          <footer className="flex justify-between items-center pt-2 mt-2 border-t border-border text-[0.72rem] text-text-tertiary">
            <span>Placed {formatDate(r.orderPlaced)}</span>
            <Link
              href={`/creators/${encodeURIComponent(r.username)}` as never}
              className="inline-flex items-center gap-1 font-semibold text-text-primary hover:text-accent"
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
    <div className="flex flex-col min-w-0 gap-0.5">
      <dt className="text-[0.58rem] font-bold uppercase tracking-[0.07em] text-text-tertiary">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-[0.82rem] font-semibold text-text-primary",
          mono && "tabular",
          danger && "text-danger",
          (!value || value === "—") && "text-text-tertiary font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
