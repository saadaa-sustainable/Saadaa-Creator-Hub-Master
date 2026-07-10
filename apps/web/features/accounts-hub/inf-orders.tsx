"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Package,
  Search,
  X,
  Loader2,
  AlertTriangle,
  Download,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/cn";
import { formatRupees, formatDate } from "@/lib/formatters";
import type { InfOrderRow } from "./types";

const CSV_HEADERS = [
  "INF ID",
  "Post ID",
  "Collab ID",
  "Creator",
  "Username",
  "Campaign",
  "Campaign Name",
  "Collab Type",
  "Commercial (finalized)",
  "Garment Qty",
  "Products Sent",
  "Order ID",
  "Order Date",
  "Order Status",
  "Product Total",
  "Order Total",
  "Tracking",
  "Customer",
  "Phone",
  "Address",
  "Onboarded",
  "Deliverables",
] as const;

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Build + download a CSV of exactly the rows currently shown (filters applied). */
function downloadInfOrdersCsv(rows: InfOrderRow[]): void {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.inf_id,
        r.post_id,
        r.collab_id,
        r.inf_name,
        r.username,
        r.campaign_id,
        r.campaign_name,
        r.collab_type,
        r.commercial,
        r.garment_qty,
        r.garments_sent,
        r.order_id,
        r.order_date,
        r.order_status,
        r.product_total,
        r.order_total,
        r.tracking_status,
        r.customer_name,
        r.phone,
        r.address,
        r.onboard_date,
        r.deliverables,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inf-orders.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * "INF Orders" — order-detail view for the accounts team. Lists every collab
 * mapped to a Collab ID that has an order (Barter and Barter + Paid), with a
 * Collab Type filter. Unmapped orders are excluded (the API only returns rows
 * with a collab_id). Opens as a full modal from the Accounts Hub toolbar.
 */
export function InfOrdersButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="acc-export-bar__btn acc-export-bar__btn--primary"
        onClick={() => setOpen(true)}
        title="View all collab-mapped orders (Barter + Barter + Paid)"
      >
        <Package size={12} aria-hidden />
        INF Orders
      </button>
      {open && <InfOrdersModal onClose={() => setOpen(false)} />}
    </>
  );
}

function InfOrdersModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<InfOrderRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [campaign, setCampaign] = useState("");
  const [collabType, setCollabType] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    let alive = true;
    fetch("/api/accounts/inf-orders")
      .then(async (r) => {
        const payload = await r.json();
        if (!alive) return;
        if (!r.ok) setErr(payload.error ?? "Failed to load orders");
        else setRows(payload.rows as InfOrderRow[]);
      })
      .catch(() => alive && setErr("Failed to load orders"));
    return () => {
      alive = false;
    };
  }, []);

  const campaigns = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows ?? []) {
      if (r.campaign_id) set.set(r.campaign_id, r.campaign_name ?? r.campaign_id);
    }
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const ct = collabType.trim().toLowerCase();
    const { from, to } = dateRange;
    return (rows ?? []).filter((r) => {
      if (campaign && r.campaign_id !== campaign) return false;
      if (from || to) {
        const day = String(r.order_date ?? "").slice(0, 10);
        if (!day) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      if (ct) {
        const rowCt = (r.collab_type ?? "").trim().toLowerCase();
        if (ct === "barter") {
          // Pure barter only (exclude "barter + paid").
          if (rowCt !== "barter") return false;
        } else if (rowCt !== ct) return false;
      }
      if (needle) {
        const hay =
          `${r.inf_name ?? ""} ${r.username ?? ""} ${r.inf_id ?? ""} ${r.post_id} ${r.collab_id} ${r.order_id ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, campaign, collabType, dateRange]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label="INF Orders"
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding flex flex-col"
        style={{ maxWidth: 1100, width: "96vw", maxHeight: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Package size={16} aria-hidden />
            <div className="min-w-0">
              <h2 className="font-semibold">INF Orders</h2>
              <p className="text-[0.62rem] text-text-secondary">
                Collab-mapped orders — Barter &amp; Barter + Paid
                {rows ? ` · ${filtered.length} of ${rows.length}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        {/* Filters */}
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 px-3 pb-2 sm:px-4">
          <label className="onboarding-filter-field acc-filter-search">
            <span>
              <Search size={10} aria-hidden /> Search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="onboarding-filter-select"
              placeholder="Creator, INF ID, post/collab/order ID…"
            />
          </label>
          <label className="onboarding-filter-field">
            <span>Campaign</span>
            <SearchableSelect
              value={campaign}
              onChange={setCampaign}
              options={[
                { value: "", label: "All campaigns" },
                ...campaigns.map(([id, name]) => ({ value: id, label: name })),
              ]}
              placeholder="All campaigns"
              searchPlaceholder="Search campaigns…"
            />
          </label>
          <label className="onboarding-filter-field">
            <span>Collab Type</span>
            <SearchableSelect
              value={collabType}
              onChange={setCollabType}
              options={[
                { value: "", label: "All types" },
                { value: "Barter", label: "Barter" },
                { value: "Barter + Paid", label: "Barter + Paid" },
              ]}
              placeholder="All types"
              searchPlaceholder="Search…"
            />
          </label>
          <label className="onboarding-filter-field">
            <span>Order Date</span>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              label="Order Date"
            />
          </label>
        </div>

        {/* Body — vertical scroll here; the table scrolls horizontally on its own. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4">
          {err ? (
            <div className="ob-form-error-banner">
              <AlertTriangle size={14} aria-hidden />
              {err}
            </div>
          ) : rows == null ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-secondary">
              <Loader2 size={24} className="animate-spin" aria-hidden />
              <span className="text-sm">Loading orders…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-secondary">
              No orders match these filters.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[0.6rem] text-text-tertiary">
                  {filtered.length} order{filtered.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  className="acc-export-bar__btn"
                  onClick={() => downloadInfOrdersCsv(filtered)}
                  disabled={!filtered.length}
                  title="Download the rows shown (filters applied) as CSV"
                >
                  <Download size={12} aria-hidden />
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-[0.7rem] sm:text-xs min-w-[1200px]">
                <thead>
                  <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
                    <th className="text-left pb-2 pr-2">Creator</th>
                    <th className="text-left pb-2 px-1.5">INF ID</th>
                    <th className="text-left pb-2 px-1.5">Post ID</th>
                    <th className="text-left pb-2 px-1.5">Collab ID</th>
                    <th className="text-left pb-2 px-1.5">Campaign</th>
                    <th className="text-left pb-2 px-1.5">Collab Type</th>
                    <th className="text-right pb-2 px-1.5">Commercial</th>
                    <th className="text-right pb-2 px-1.5">Qty</th>
                    <th className="text-left pb-2 px-1.5">Products Sent</th>
                    <th className="text-left pb-2 px-1.5">Order ID</th>
                    <th className="text-left pb-2 px-1.5">Order Date</th>
                    <th className="text-left pb-2 px-1.5">Order Status</th>
                    <th className="text-right pb-2 px-1.5">Product Total</th>
                    <th className="text-right pb-2 px-1.5">Order Total</th>
                    <th className="text-left pb-2 px-1.5">Tracking</th>
                    <th className="text-left pb-2 px-1.5">Customer</th>
                    <th className="text-left pb-2 px-1.5">Phone</th>
                    <th className="text-left pb-2 pl-1.5">Address</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.collab_id}
                      className="border-t border-border hover:bg-bg-muted/40 transition-colors align-middle"
                    >
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar
                            src={r.profile_pic}
                            username={r.username}
                            name={r.inf_name}
                            size={26}
                          />
                          <div className="min-w-0">
                            <div className="font-extrabold text-text-primary truncate max-w-[140px]">
                              {r.inf_name ?? r.username ?? "—"}
                            </div>
                            {r.username && (
                              <div className="text-[0.55rem] text-text-tertiary truncate max-w-[140px]">
                                @{r.username}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-1.5 px-1.5 tabular text-text-secondary">
                        {r.inf_id ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 tabular text-text-secondary">
                        {r.post_id}
                        {r.deliverables > 1 && (
                          <span className="text-text-tertiary">
                            {" "}
                            +{r.deliverables - 1}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-1.5 tabular font-bold text-text-primary">
                        {r.collab_id}
                      </td>
                      <td className="py-1.5 px-1.5 text-text-secondary">
                        {r.campaign_id ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                            (r.collab_type ?? "").trim().toLowerCase() ===
                              "barter"
                              ? "border-border bg-bg-muted text-text-secondary"
                              : "border-[#3B6FD4]/25 bg-[#E8EEFB] text-[#3B6FD4]",
                          )}
                        >
                          {r.collab_type ?? "—"}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5 text-right tabular font-bold text-text-primary">
                        {formatRupees(r.commercial)}
                      </td>
                      <td className="py-1.5 px-1.5 text-right tabular text-text-secondary">
                        {r.garment_qty ?? "—"}
                      </td>
                      <td
                        className="py-1.5 px-1.5 text-text-secondary max-w-[220px] truncate"
                        title={r.garments_sent ?? undefined}
                      >
                        {r.garments_sent ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 tabular text-text-secondary">
                        {r.order_id ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 tabular text-text-tertiary">
                        {formatDate(r.order_date) ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 text-text-tertiary">
                        {r.order_status ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 text-right tabular text-text-primary font-semibold">
                        {r.product_total != null
                          ? formatRupees(r.product_total)
                          : "—"}
                      </td>
                      <td className="py-1.5 px-1.5 text-right tabular text-text-secondary">
                        {r.order_total != null ? formatRupees(r.order_total) : "—"}
                      </td>
                      <td className="py-1.5 px-1.5 text-text-tertiary">
                        {r.tracking_status ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 text-text-secondary max-w-[140px] truncate">
                        {r.customer_name ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 tabular text-text-tertiary">
                        {r.phone ?? "—"}
                      </td>
                      <td
                        className="py-1.5 pl-1.5 text-text-tertiary max-w-[240px] truncate"
                        title={r.address ?? undefined}
                      >
                        {r.address ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
