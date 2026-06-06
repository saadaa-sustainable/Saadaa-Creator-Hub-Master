"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid3X3, List as ListIcon, UserMinus } from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatRupees } from "@/lib/formatters";
import type { OffboardingFilters, OffboardingRow } from "./types";

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
          <OffboardingListTable rows={filtered} />
        </div>
      ) : (
        <div className="order-status-cards-panel">
          <OffboardingCardsGrid rows={filtered} />
        </div>
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

function OffboardingListTable({ rows }: { rows: OffboardingRow[] }) {
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
            <th>Collab</th>
            <th>Payment</th>
            <th className="text-right">Commercials</th>
            <th>Reached Out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.postId}>
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

function OffboardingCardsGrid({ rows }: { rows: OffboardingRow[] }) {
  return (
    <div className="ob-card-grid">
      {rows.map((r) => (
        <article key={r.postId} className="ob-card">
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
