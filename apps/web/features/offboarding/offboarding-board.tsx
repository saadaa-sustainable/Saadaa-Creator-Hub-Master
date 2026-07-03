"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
    <div className="campaign-list-view stage-campaign-list">
      {rows.map((r, index) => (
        <OffboardingListRow
          key={r.postId}
          row={r}
          index={index}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function offboardingTone(r: OffboardingRow) {
  return r.paymentStatus.toLowerCase() === "done"
    ? "var(--color-success-text)"
    : "var(--color-warning-text, #b57514)";
}

function offboardingProgress(r: OffboardingRow) {
  return r.paymentStatus.toLowerCase() === "done" ? 100 : 72;
}

function offboardingDeliverableCount(r: OffboardingRow) {
  return r.staticPosts + r.reels + r.stories;
}

function offboardingStyle(row: OffboardingRow, index: number) {
  return {
    "--campaign-accent": offboardingTone(row),
    "--campaign-progress": `${offboardingProgress(row)}%`,
    "--campaign-card-index": index,
  } as CSSProperties;
}

function OffboardingListRow({
  row,
  index,
  onOpen,
}: {
  row: OffboardingRow;
  index: number;
  onOpen: (row: OffboardingRow) => void;
}) {
  const collabId = collabIdOf(row);
  return (
    <article
      className="campaign-list-row stage-campaign-row"
      style={offboardingStyle(row, index)}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(row);
        }
      }}
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
              <strong>{row.postId || collabId || "—"}</strong>
            </span>
            <PaymentPill status={row.paymentStatus} />
          </div>
          <h3>{row.name || row.username || "—"}</h3>
          <p>
            @{row.username || "—"} · {row.campaign || "—"} ·{" "}
            {collabId || row.infId || "—"}
          </p>
        </div>
      </div>

      <div className="campaign-list-row__allocation stage-campaign-signal">
        <div>
          <span>Offboarding</span>
          <strong>{offboardingProgress(row)}%</strong>
        </div>
        <span className="campaign-card__progress-track" aria-hidden>
          <span />
        </span>
        <div className="campaign-list-row__reachouts">
          <span>{deliverablesLabel(row)}</span>
          <strong>{offboardingDeliverableCount(row)}</strong>
        </div>
      </div>

      <dl className="campaign-list-row__stats">
        <div>
          <dt>Order ID</dt>
          <dd>{row.orderId || "—"}</dd>
        </div>
        <div>
          <dt>Collab</dt>
          <dd>{row.collabType || "—"}</dd>
        </div>
        <div>
          <dt>Commercials</dt>
          <dd>{row.commercials > 0 ? formatRupees(row.commercials) : "—"}</dd>
        </div>
        <div>
          <dt>Reached Out</dt>
          <dd>{formatDate(row.reachoutDate)}</dd>
        </div>
      </dl>

      <div className="campaign-list-row__actions">
        <button
          type="button"
          className="campaign-list-action campaign-list-action--brief"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(row);
          }}
        >
          <Eye size={13} aria-hidden />
          Overview
        </button>
      </div>
    </article>
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
    <div className="campaign-card-grid stage-campaign-card-grid">
      {rows.map((r, index) => (
        <article
          key={r.postId}
          className="campaign-card stage-campaign-card"
          style={offboardingStyle(r, index)}
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
                    <strong>{r.postId || collabIdOf(r) || "—"}</strong>
                  </span>
                  <PaymentPill status={r.paymentStatus} />
                </div>
                <h3>{r.name || r.username || "—"}</h3>
                {r.username && (
                  <p className="campaign-card__message">@{r.username}</p>
                )}
              </div>
            </div>
          </div>

          <div className="campaign-card__meta-row">
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

          <div className="campaign-card__progress">
            <div>
              <span>Offboarding</span>
              <strong>{offboardingProgress(r)}% ready</strong>
            </div>
            <span className="campaign-card__progress-track" aria-hidden>
              <span />
            </span>
          </div>

          <dl className="campaign-card__facts">
            <div>
              <dt>Deliverables</dt>
              <dd>{deliverablesLabel(r)}</dd>
            </div>
            <div>
              <dt>Order ID</dt>
              <dd>{r.orderId || "—"}</dd>
            </div>
            <div>
              <dt>Commercials</dt>
              <dd>{r.commercials > 0 ? formatRupees(r.commercials) : "—"}</dd>
            </div>
            <div>
              <dt>Reached Out</dt>
              <dd>{formatDate(r.reachoutDate)}</dd>
            </div>
            <div>
              <dt>Followers</dt>
              <dd>{r.followers ? r.followers.toLocaleString("en-IN") : "—"}</dd>
            </div>
          </dl>

          <div className="campaign-card__actions">
            <button
              type="button"
              className="campaign-list-action campaign-list-action--brief"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(r);
              }}
            >
              <Eye size={12} aria-hidden />
              Overview
            </button>
          </div>
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
