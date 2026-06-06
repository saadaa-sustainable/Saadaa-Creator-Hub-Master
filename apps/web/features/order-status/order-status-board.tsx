"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ExternalLink,
  Eye,
  Grid3X3,
  IndianRupee,
  List as ListIcon,
  PackageCheck,
  ReceiptText,
  Route,
  Truck,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import { OverduePill, ShippingStatusPill } from "./columns";
import type { OrderStatusFilters, OrderStatusRow } from "./types";

/**
 * Post ID with adjacent muted Collab ID secondary — primary post_id unchanged,
 * collab_id rendered inline as a small muted secondary (middot separator).
 * Mirrors the shared `PostIdWithCollab` pattern from the Posting stage so the
 * deliverable id always reads "post id · collab id". Reuses the shared
 * `.post-id-cell` / `.post-id` classes (no globals.css edits).
 */
function PostIdWithCollab({ row }: { row: OrderStatusRow }) {
  if (!row.postId) return <>—</>;
  return (
    <span className="post-id-cell">
      <span className="post-id tabular">{row.postId}</span>
      {row.collabId && (
        <span className="text-[0.7rem] text-text-tertiary tabular">
          · {row.collabId}
        </span>
      )}
    </span>
  );
}

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
  initialView = "cards",
  filters,
}: {
  rows: OrderStatusRow[];
  initialView?: "list" | "cards";
  filters: OrderStatusFilters;
}) {
  const [view, setView] = useState<"list" | "cards">(initialView);
  const [overviewRow, setOverviewRow] = useState<OrderStatusRow | null>(null);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const forceCardsOnMobile = () => {
      if (mobileQuery.matches) setView("cards");
    };

    forceCardsOnMobile();
    mobileQuery.addEventListener("change", forceCardsOnMobile);
    return () => mobileQuery.removeEventListener("change", forceCardsOnMobile);
  }, []);

  const filtered = useMemo(() => {
    const q = (filters.search ?? "").trim().toLowerCase();
    return rows.filter((r) => {
      if (
        filters.status &&
        filters.status !== "all" &&
        r.bucket !== filters.status
      )
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
        const hay =
          `${r.name} ${r.username} ${r.orderId} ${r.trackingId} ${r.campaign}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  return (
    <section className="mt-4">
      {overviewRow && (
        <OrderStatusOverviewModal
          row={overviewRow}
          onClose={() => setOverviewRow(null)}
        />
      )}
      <div className="order-status-board-toolbar">
        <span className="text-xs font-bold tabular text-text-secondary bg-bg-ecru border border-border rounded-full px-3 py-1">
          {filtered.length} order{filtered.length === 1 ? "" : "s"}
        </span>
        <div
          className="ob-viewtoggle order-status-viewtoggle"
          role="tablist"
          aria-label="View"
        >
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
        <div className="order-status-list-panel">
          <OrderListTable rows={filtered} onOverview={setOverviewRow} />
        </div>
      ) : (
        <div className="order-status-cards-panel">
          <OrderCardsGrid rows={filtered} onOverview={setOverviewRow} />
        </div>
      )}
    </section>
  );
}

function OrderListTable({
  rows,
  onOverview,
}: {
  rows: OrderStatusRow[];
  onOverview: (row: OrderStatusRow) => void;
}) {
  return (
    <div className="ob-list-wrap">
      <table className="ob-list-table">
        <thead>
          <tr>
            <th>Post ID</th>
            <th>Collab ID</th>
            <th>INF ID</th>
            <th>Creator</th>
            <th>Campaign</th>
            <th>Order ID</th>
            <th>Status</th>
            <th>Tracking</th>
            <th>Est Delivery</th>
            <th className="text-right">Total</th>
            <th>Placed</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.postId}>
              <td className="tabular whitespace-nowrap">
                <span className="post-id tabular">{r.postId || "—"}</span>
              </td>
              <td className="tabular whitespace-nowrap">
                {r.collabId ? (
                  <span
                    className="campaign-chip tabular"
                    title="Groups all deliverables of this collaboration"
                  >
                    {r.collabId}
                  </span>
                ) : (
                  <span className="text-text-tertiary">—</span>
                )}
              </td>
              <td className="tabular whitespace-nowrap">{r.infId || "—"}</td>
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
                <span>
                  {r.orderId}
                  {r.isOverdue && (
                    <>
                      {" "}
                      <OverduePill />
                    </>
                  )}
                </span>
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
              <td>
                <button
                  type="button"
                  className="order-status-pill-button"
                  onClick={() => onOverview(r)}
                >
                  Overview <ExternalLink size={11} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderCardsGrid({
  rows,
  onOverview,
}: {
  rows: OrderStatusRow[];
  onOverview: (row: OrderStatusRow) => void;
}) {
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
              size={44}
              className="ob-card-avatar"
            />
            <div className="ob-card-id min-w-0">
              <div className="ob-card-name">{r.name || r.username || "—"}</div>
              {r.username && (
                <div className="ob-card-handle">@{r.username}</div>
              )}
            </div>
          </div>

          <div className="ob-card-pills">
            <ShippingStatusPill
              shipping={r.shippingStatus}
              manual={r.orderStatus}
              bucket={r.bucket}
            />
            <span className="campaign-chip">{r.campaign || "—"}</span>
            {r.category && (
              <span className="pill pill--muted">{r.category}</span>
            )}
            {r.collabType && (
              <span className="pill pill--muted">{r.collabType}</span>
            )}
            {r.isOverdue && <OverduePill />}
          </div>

          <dl className="ob-card-meta-grid order-status-card-meta">
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Order ID</span>
              <span className="ob-card-meta-val tabular">{r.orderId}</span>
              <PostIdWithCollab row={r} />
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Tracking</span>
              <span className="ob-card-meta-val tabular">
                {r.trackingId || "—"}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Est. Delivery</span>
              <span className="ob-card-meta-val tabular">
                {formatDate(r.estDelivery)}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Delivered</span>
              <span className="ob-card-meta-val tabular">
                {formatDate(r.deliveryDate)}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Total</span>
              <span className="ob-card-meta-val tabular">
                {r.totalPrice > 0 ? formatRupees(r.totalPrice) : "—"}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Refund</span>
              <span
                className={cn(
                  "ob-card-meta-val tabular",
                  r.refundAmount > 0 && "text-danger",
                )}
              >
                {r.refundAmount > 0 ? formatRupees(r.refundAmount) : "—"}
              </span>
            </div>
          </dl>

          <div className="order-status-card-meta-row">
            {r.fulfillmentEvents && (
              <div
                className="order-status-card-events"
                title={r.fulfillmentEvents}
              >
                <strong className="text-text-primary mr-1">Events:</strong>
                {r.fulfillmentEvents}
              </div>
            )}
            <div className="order-status-card-placed">
              Placed {formatDate(r.orderPlaced)}
            </div>
          </div>

          <footer className="order-status-card-actions">
            <button
              type="button"
              className="action-btn action-btn--view order-status-card-action-btn"
              onClick={() => onOverview(r)}
              aria-label="View order overview"
            >
              <Eye size={12} aria-hidden />
              Overview
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}

function OrderStatusOverviewModal({
  row,
  onClose,
}: {
  row: OrderStatusRow;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Order overview for ${row.name || row.username || row.orderId}`}
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding order-status-overview-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <ReceiptText size={16} aria-hidden />
            <h2>Order Overview</h2>
            <span className="chip tabular">{row.orderId}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close order overview"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="modal-body order-status-overview-body">
          <section className="order-status-overview-hero">
            <Avatar
              src={row.profilePicUrl}
              username={row.username}
              name={row.name}
              size={48}
            />
            <div className="min-w-0">
              <strong>{row.name || row.username || "—"}</strong>
              {row.username && <span>@{row.username}</span>}
            </div>
            <ShippingStatusPill
              shipping={row.shippingStatus}
              manual={row.orderStatus}
              bucket={row.bucket}
            />
          </section>

          <section className="order-status-overview-grid">
            <OverviewTile
              icon={<PackageCheck size={14} aria-hidden />}
              label="Campaign"
              value={row.campaign || "—"}
            />
            <OverviewTile
              icon={<ReceiptText size={14} aria-hidden />}
              label="Order ID"
              value={row.orderId}
              mono
            />
            <OverviewTile
              icon={<ReceiptText size={14} aria-hidden />}
              label="Post ID"
              value={
                row.postId
                  ? row.collabId
                    ? `${row.postId} · ${row.collabId}`
                    : row.postId
                  : "—"
              }
              mono
            />
            <OverviewTile
              icon={<Route size={14} aria-hidden />}
              label="Tracking"
              value={row.trackingId || "—"}
              mono
            />
            <OverviewTile
              icon={<CalendarDays size={14} aria-hidden />}
              label="Placed"
              value={formatDate(row.orderPlaced)}
            />
            <OverviewTile
              icon={<Truck size={14} aria-hidden />}
              label="Est. Delivery"
              value={formatDate(row.estDelivery)}
            />
            <OverviewTile
              icon={<PackageCheck size={14} aria-hidden />}
              label="Delivered"
              value={formatDate(row.deliveryDate)}
            />
            <OverviewTile
              icon={<IndianRupee size={14} aria-hidden />}
              label="Total"
              value={row.totalPrice > 0 ? formatRupees(row.totalPrice) : "—"}
              mono
            />
            <OverviewTile
              icon={<IndianRupee size={14} aria-hidden />}
              label="Refund"
              value={
                row.refundAmount > 0 ? formatRupees(row.refundAmount) : "—"
              }
              mono
              danger={row.refundAmount > 0}
            />
          </section>

          <section className="order-status-overview-grid order-status-overview-grid--compact">
            <OverviewTile label="Category" value={row.category || "—"} />
            <OverviewTile label="Collab" value={row.collabType || "—"} />
            <OverviewTile
              label="Garment Qty"
              value={row.garmentQty == null ? "—" : String(row.garmentQty)}
              mono
            />
            <OverviewTile
              label="Financial"
              value={row.financialStatus || "—"}
            />
            <OverviewTile
              label="Repeat Orders"
              value={String(row.customerOrderCount || 0)}
              mono
            />
          </section>

          <GarmentsSentPanel value={row.garmentsSent} />

          {row.fulfillmentEvents && (
            <section className="order-status-overview-events">
              <span>Fulfillment Events</span>
              <p>{row.fulfillmentEvents}</p>
            </section>
          )}
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function GarmentsSentPanel({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const text = value.trim();
  const LIMIT = 64;
  const truncates = text.length > LIMIT;
  // Word-boundary aware preview — split at last space within LIMIT.
  const splitAt = truncates
    ? Math.max(text.lastIndexOf(" ", LIMIT), LIMIT)
    : text.length;
  const previewText = text.slice(0, splitAt).trimEnd();
  const display = !truncates
    ? text || "—"
    : open
      ? text
      : `${previewText}…`;

  return (
    <div className="order-status-garments-panel">
      <div className="order-status-garments-panel__head">
        <span className="order-status-garments-title">
          <span>
            <PackageCheck size={14} aria-hidden />
            Garments Sent
          </span>
          <strong className={open ? "order-status-garments-text--full" : ""}>
            {display}
          </strong>
        </span>
        {truncates && (
          <button
            type="button"
            className="order-status-garments-more"
            onClick={() => setOpen((s) => !s)}
            aria-expanded={open}
          >
            {open ? "Less…" : "More…"}
          </button>
        )}
      </div>
    </div>
  );
}

function OverviewTile({
  icon,
  label,
  value,
  mono,
  danger,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="order-status-overview-tile">
      <span>
        {icon}
        {label}
      </span>
      <strong className={cn(mono && "tabular", danger && "text-danger")}>
        {value || "—"}
      </strong>
    </div>
  );
}
