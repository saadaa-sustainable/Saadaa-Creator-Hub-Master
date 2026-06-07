"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Eye, Grid3X3, List as ListIcon, UserMinus, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import type { OffboardingFilters, OffboardingRow } from "./types";

/** "1P : 1R" — Static Posts : Reels (: Stories only when present). */
function deliverablesLabel(r: OffboardingRow): string {
  return `${r.staticPosts}P : ${r.reels}R${r.stories > 0 ? ` : ${r.stories}S` : ""}`;
}

/**
 * Offboarding board — view toggle + List / Cards. Reuses the shared
 * `.ob-viewtoggle` / `.ob-list-*` / `.ob-card-*` primitives so the terminal
 * stage matches Onboarding / Order Status visually. Read-only ledger; the
 * "Move to Offboarding" entry point lives in its own panel above the board.
 */
export function OffboardingBoard({
  rows,
  initialView = "cards",
  filters,
}: {
  rows: OffboardingRow[];
  initialView?: "list" | "cards";
  filters: OffboardingFilters;
}) {
  const [view, setView] = useState<"list" | "cards">(initialView);
  const [selected, setSelected] = useState<OffboardingRow | null>(null);

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
      if (filters.paymentStatus && r.paymentStatus !== filters.paymentStatus)
        return false;
      if (q) {
        const hay = `${r.name} ${r.username} ${r.orderId} ${r.campaign}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  return (
    <section className="mt-4">
      <div className="order-status-board-toolbar">
        <span className="text-xs font-bold tabular text-text-secondary bg-bg-ecru border border-border rounded-full px-3 py-1">
          {filtered.length} collab{filtered.length === 1 ? "" : "s"}
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
          <UserMinus size={28} aria-hidden />
          <p>No collabs in the Offboarding stage.</p>
        </div>
      ) : view === "list" ? (
        <div className="order-status-list-panel">
          <OffboardingListTable rows={filtered} onOpen={setSelected} />
        </div>
      ) : (
        <div className="order-status-cards-panel">
          <OffboardingCardsGrid rows={filtered} onOpen={setSelected} />
        </div>
      )}

      {selected && (
        <OffboardingDetailModal
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

// Collab ID for display — prefer the stamped collab_id, fall back to the
// legacy inf_id||'-C'||collab_number shape for older rows that predate the
// stamped column.
function collabIdOf(r: OffboardingRow): string | null {
  return (
    r.collabId ??
    (r.infId ? `${r.infId}-C${Number(r.collabNumber ?? 1)}` : null)
  );
}

function PaymentPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s === "done"
      ? "bg-success-bg text-success border-success/20"
      : s === "due"
        ? "bg-warning-bg text-warning border-warning/20"
        : "bg-bg-white text-text-tertiary border-border";
  const label = s === "done" ? "Paid" : status || "Not Due";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.66rem] font-bold tracking-[0.04em] px-2 py-0.5 rounded-full border whitespace-nowrap",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function OffboardingListTable({
  rows,
  onOpen,
}: {
  rows: OffboardingRow[];
  onOpen: (row: OffboardingRow) => void;
}) {
  return (
    <div className="ob-list-wrap">
      <table className="ob-list-table">
        <thead>
          <tr>
            <th>Creator</th>
            <th>Post ID</th>
            <th>Collab ID</th>
            <th>INF ID</th>
            <th>Campaign</th>
            <th>Deliverables</th>
            <th>Order ID</th>
            <th>Collab</th>
            <th>Payment</th>
            <th className="text-right">Commercials</th>
            <th>Reached Out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.postId}
              role="button"
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => onOpen(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(r);
                }
              }}
            >
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
              <td className="tabular whitespace-nowrap">
                <span className="post-id tabular">{r.postId || "—"}</span>
              </td>
              <td className="tabular whitespace-nowrap">
                {collabIdOf(r) ? (
                  <span
                    className="campaign-chip tabular"
                    title="Groups all deliverables of this collaboration"
                  >
                    {collabIdOf(r)}
                  </span>
                ) : (
                  <span className="text-text-tertiary">—</span>
                )}
              </td>
              <td className="tabular whitespace-nowrap">{r.infId || "—"}</td>
              <td>
                <span className="campaign-chip">{r.campaign || "—"}</span>
              </td>
              <td className="tabular whitespace-nowrap text-text-secondary">
                {deliverablesLabel(r)}
              </td>
              <td className="tabular whitespace-nowrap">{r.orderId || "—"}</td>
              <td>{r.collabType || "—"}</td>
              <td>
                <PaymentPill status={r.paymentStatus} />
              </td>
              <td className="text-right tabular">
                {r.commercials > 0 ? formatRupees(r.commercials) : "—"}
              </td>
              <td className="tabular">{formatDate(r.reachoutDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OffboardingCardsGrid({
  rows,
  onOpen,
}: {
  rows: OffboardingRow[];
  onOpen: (row: OffboardingRow) => void;
}) {
  return (
    <div className="ob-card-grid">
      {rows.map((r) => (
        <article
          key={r.postId}
          className="ob-card cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label={`View details for ${r.postId}`}
          onClick={() => onOpen(r)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(r);
            }
          }}
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
              {r.username && <div className="ob-card-handle">@{r.username}</div>}
            </div>
          </div>

          <div className="ob-card-pills">
            {r.postId && <span className="post-id tabular">{r.postId}</span>}
            {collabIdOf(r) && (
              <span
                className="campaign-chip tabular"
                title="Collab ID — groups all deliverables of this collaboration"
              >
                {collabIdOf(r)}
              </span>
            )}
            <PaymentPill status={r.paymentStatus} />
            <span className="campaign-chip">{r.campaign || "—"}</span>
            {r.category && <span className="pill pill--muted">{r.category}</span>}
            {r.collabType && (
              <span className="pill pill--muted">{r.collabType}</span>
            )}
          </div>

          <dl className="ob-card-meta-grid">
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Deliverables</span>
              <span className="ob-card-meta-val tabular">
                {deliverablesLabel(r)}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Order ID</span>
              <span className="ob-card-meta-val tabular">
                {r.orderId || "—"}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Commercials</span>
              <span className="ob-card-meta-val tabular">
                {r.commercials > 0 ? formatRupees(r.commercials) : "—"}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Reached Out</span>
              <span className="ob-card-meta-val tabular">
                {formatDate(r.reachoutDate)}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Followers</span>
              <span className="ob-card-meta-val tabular">
                {r.followers ? r.followers.toLocaleString("en-IN") : "—"}
              </span>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function OffboardingDetailModal({
  row,
  onClose,
}: {
  row: OffboardingRow;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const collabId = collabIdOf(row);
  const items: Array<[string, ReactNode]> = [
    ["Post ID", row.postId || "—"],
    ["Collab ID", collabId || "—"],
    ["INF ID", row.infId || "—"],
    ["Campaign", row.campaign || "—"],
    ["Collab Type", row.collabType || "—"],
    ["Deliverables", deliverablesLabel(row)],
    ["Ads Usage Rights", row.adsUsageRights || "—"],
    ["Commercials", row.commercials > 0 ? formatRupees(row.commercials) : "—"],
    ["Order ID", row.orderId || "—"],
    ["Order Status", row.orderStatus || "—"],
    ["Tracking ID", row.trackingId || "—"],
    ["Payment", row.paymentStatus || "—"],
    ["Onboarded", formatDate(row.onboardDate)],
    ["Est. Delivery", formatDate(row.estDelivery)],
    ["Reached Out", formatDate(row.reachoutDate)],
    [
      "Followers",
      row.followers ? row.followers.toLocaleString("en-IN") : "—",
    ],
    ["Category", row.category || "—"],
    [
      "Post Link",
      row.postLink ? (
        <a
          href={row.postLink}
          target="_blank"
          rel="noopener"
          className="text-link"
        >
          Open
        </a>
      ) : (
        "—"
      ),
    ],
  ];

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding" onClick={onClose}>
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding ob-overview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={16} aria-hidden />
            <h2 className="font-semibold">Offboarding Overview</h2>
            <span className="chip text-[10px] tabular">{row.postId}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="modal-body ob-overview-body">
          <section className="ob-overview-card">
            <div className="ob-overview-head">
              <Avatar
                src={row.profilePicUrl}
                username={row.username}
                name={row.name}
                size={48}
              />
              <div className="ob-overview-identity">
                <strong>{row.name || row.username || "—"}</strong>
                <span>@{row.username || "—"}</span>
              </div>
              <PaymentPill status={row.paymentStatus} />
            </div>
            <div className="ob-overview-pills">
              {collabId && (
                <span className="campaign-chip tabular" title="Collab ID">
                  {collabId}
                </span>
              )}
              <span className="campaign-chip">{row.campaign || "—"}</span>
              <span className="pill pill--muted">Offboarded</span>
            </div>
          </section>

          <section className="ob-overview-grid">
            {items.map(([label, value]) => (
              <div className="ob-overview-item" key={label}>
                <span>{label}</span>
                <strong className="tabular">{value}</strong>
              </div>
            ))}
          </section>
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
