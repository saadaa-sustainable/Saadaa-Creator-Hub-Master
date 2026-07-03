"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
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
    <div className="campaign-list-view stage-campaign-list">
      {rows.map((r, index) => (
        <OrderStatusListRow
          key={`${r.postId}-${r.orderId}`}
          row={r}
          index={index}
          onOverview={onOverview}
        />
      ))}
    </div>
  );
}

function orderStatusTone(r: OrderStatusRow) {
  if (r.bucket === "delivered") return "var(--color-success-text)";
  if (r.bucket === "rto" || r.isOverdue) return "var(--color-danger-text, #cf3f33)";
  if (r.bucket === "transit") return "#3b6fd4";
  return "var(--color-warning-text, #b57514)";
}

function orderStatusProgress(r: OrderStatusRow) {
  if (r.bucket === "delivered") return 100;
  if (r.bucket === "transit") return 64;
  if (r.bucket === "rto") return 18;
  if (r.trackingId) return 48;
  return 24;
}

function orderStatusStyle(row: OrderStatusRow, index: number) {
  return {
    "--campaign-accent": orderStatusTone(row),
    "--campaign-progress": `${orderStatusProgress(row)}%`,
    "--campaign-card-index": index,
  } as CSSProperties;
}

function OrderStatusListRow({
  row,
  index,
  onOverview,
}: {
  row: OrderStatusRow;
  index: number;
  onOverview: (row: OrderStatusRow) => void;
}) {
  return (
    <article
      className="campaign-list-row stage-campaign-row"
      style={orderStatusStyle(row, index)}
    >
      <div className="stage-campaign-identity">
        <Avatar
          src={row.profilePicUrl}
          username={row.username}
          name={row.name}
          size={46}
        />
        <div className="campaign-list-row__main">
          <div className="campaign-card__id-row">
            <span className="campaign-card__id">
              <strong>{row.postId || row.orderId}</strong>
            </span>
            <ShippingStatusPill
              shipping={row.shippingStatus}
              manual={row.orderStatus}
              bucket={row.bucket}
            />
            {row.isOverdue && <OverduePill />}
          </div>
          <h3>{row.name || row.username || "—"}</h3>
          <p>
            @{row.username || "—"} · {row.campaign || "—"} ·{" "}
            {row.collabId || row.infId || "—"}
          </p>
        </div>
      </div>

      <div className="campaign-list-row__allocation stage-campaign-signal">
        <div>
          <span>Fulfillment</span>
          <strong>{orderStatusProgress(row)}%</strong>
        </div>
        <span className="campaign-card__progress-track" aria-hidden>
          <span />
        </span>
        <div className="campaign-list-row__reachouts">
          <span>
            <Truck size={12} aria-hidden />
            {row.trackingId || "No tracking"}
          </span>
          <strong>{row.customerOrderCount || 0}</strong>
        </div>
      </div>

      <dl className="campaign-list-row__stats">
        <div>
          <dt>Order ID</dt>
          <dd>{row.orderId || "—"}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{row.totalPrice > 0 ? formatRupees(row.totalPrice) : "—"}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{formatDate(row.estDelivery)}</dd>
        </div>
        <div>
          <dt>Placed</dt>
          <dd>{formatDate(row.orderPlaced)}</dd>
        </div>
      </dl>

      <div className="campaign-list-row__actions">
        <button
          type="button"
          className="campaign-list-action campaign-list-action--brief"
          onClick={() => onOverview(row)}
        >
          <Eye size={13} aria-hidden />
          Overview
        </button>
      </div>
    </article>
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
    <div className="campaign-card-grid stage-campaign-card-grid">
      {rows.map((r, index) => (
        <article
          key={r.postId}
          className="campaign-card stage-campaign-card"
          style={orderStatusStyle(r, index)}
        >
          <div className="campaign-card__head">
            <div className="stage-campaign-card-head">
              <Avatar
                src={r.profilePicUrl}
                username={r.username}
                name={r.name}
                size={46}
              />
              <div className="min-w-0">
                <div className="campaign-card__id-row">
                  <span className="campaign-card__id">
                    <strong>{r.postId || r.orderId}</strong>
                  </span>
                  <ShippingStatusPill
                    shipping={r.shippingStatus}
                    manual={r.orderStatus}
                    bucket={r.bucket}
                  />
                </div>
                <h3>{r.name || r.username || "—"}</h3>
                {r.username && (
                  <p className="campaign-card__message">@{r.username}</p>
                )}
              </div>
            </div>
          </div>

          <div className="campaign-card__meta-row">
            {r.collabId && (
              <span className="campaign-chip tabular">{r.collabId}</span>
            )}
            <span className="campaign-chip">{r.campaign || "—"}</span>
            {r.category && (
              <span className="pill pill--muted">{r.category}</span>
            )}
            {r.collabType && (
              <span className="pill pill--muted">{r.collabType}</span>
            )}
            {r.isOverdue && <OverduePill />}
          </div>

          <div className="campaign-card__progress">
            <div>
              <span>Fulfillment</span>
              <strong>{orderStatusProgress(r)}% ready</strong>
            </div>
            <span className="campaign-card__progress-track" aria-hidden>
              <span />
            </span>
          </div>

          <dl className="campaign-card__facts">
            <div>
              <dt>Order ID</dt>
              <dd>{r.orderId}</dd>
            </div>
            <div>
              <dt>Tracking</dt>
              <dd>{r.trackingId || "—"}</dd>
            </div>
            <div>
              <dt>Est. Delivery</dt>
              <dd>{formatDate(r.estDelivery)}</dd>
            </div>
            <div>
              <dt>Delivered</dt>
              <dd>{formatDate(r.deliveryDate)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{r.totalPrice > 0 ? formatRupees(r.totalPrice) : "—"}</dd>
            </div>
            <div>
              <dt>Refund</dt>
              <dd className={cn(r.refundAmount > 0 && "text-danger")}>
                {r.refundAmount > 0 ? formatRupees(r.refundAmount) : "—"}
              </dd>
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

          <footer className="campaign-card__actions">
            <button
              type="button"
              className="campaign-list-action campaign-list-action--brief"
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
