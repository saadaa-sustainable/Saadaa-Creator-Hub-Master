"use client";
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Grid3X3,
  History,
  Inbox,
  List as ListIcon,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  Avatar,
  DeactivatedBadge,
  StatusPill,
  WorkflowStatusPill,
} from "@/components/ui";
import { PartnershipBadge } from "@/components/ui/status-pill";
import { cn } from "@/lib/cn";
import { formatDate, formatFollowers } from "@/lib/formatters";
import type { WorkflowStatus } from "@/lib/supabase/types.gen";
import { loadCreatorCollabHistory } from "./actions";
import type { CreatorAnalyticsRow, CreatorCollab } from "./types";

export interface CreatorAnalyticsViewProps {
  /** ONE page of creators (server-paginated, already ordered followers desc). */
  rows: CreatorAnalyticsRow[];
  /** Full filtered creator count across all pages (drives the pager). */
  total: number;
  /** 1-based current page. */
  page: number;
  pageSize: number;
  initialView?: "list" | "cards";
}

/** "Historic" / "New" chip from creators.creator_type. */
function CreatorTypeChip({ type }: { type: string | null }) {
  if (type === "new_creator") {
    return (
      <StatusPill tone="info">
        <Sparkles size={10} aria-hidden />
        New
      </StatusPill>
    );
  }
  // Default + historic_creator both read "Historic" (legacy roster).
  return (
    <StatusPill tone="neutral">
      <History size={10} aria-hidden />
      Historic
    </StatusPill>
  );
}

/** "5 (2 live · 3 historic)" — total with live/historic split. */
function collabSummary(r: CreatorAnalyticsRow): string {
  return `${r.total_collab_count} (${r.live_collab_count} live · ${r.historic_collab_count} historic)`;
}

function StageCell({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-text-tertiary">—</span>;
  return <WorkflowStatusPill status={stage as WorkflowStatus} />;
}

export function CreatorAnalyticsView({
  rows,
  total,
  page,
  pageSize,
  initialView = "list",
}: CreatorAnalyticsViewProps) {
  const [view, setView] = useState<"list" | "cards">(initialView);
  const [detailRow, setDetailRow] = useState<CreatorAnalyticsRow | null>(null);

  // Force cards-only on mobile (≤768px); restore previous view on desktop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      if (mq.matches) setView("cards");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const isEmpty = rows.length === 0;

  return (
    <>
      {detailRow && (
        <CreatorHistoryModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
        />
      )}

      {/* View toggle (legacy `.ob-viewtoggle`) */}
      <div className="ob-viewtoggle" role="tablist" aria-label="View mode">
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

      {isEmpty ? (
        <div className="glass-card text-center py-10 text-text-tertiary">
          <Inbox size={28} className="mx-auto mb-2" />
          <p className="font-medium text-text-primary">
            No creators match these filters
          </p>
          <p className="text-sm">
            Try clearing filters or widening the date ranges.
          </p>
        </div>
      ) : view === "list" ? (
        <CreatorListTable rows={rows} onOpen={setDetailRow} />
      ) : (
        <div className="ob-card-grid">
          {rows.map((r, index) => (
            <CreatorCard
              key={r.inf_id}
              r={r}
              index={index}
              onOpen={() => setDetailRow(r)}
            />
          ))}
        </div>
      )}

      <CreatorPager total={total} page={page} pageSize={pageSize} />
    </>
  );
}

/** Desktop table of the current page, with a mobile card stack fallback. */
function CreatorListTable({
  rows,
  onOpen,
}: {
  rows: CreatorAnalyticsRow[];
  onOpen: (r: CreatorAnalyticsRow) => void;
}) {
  return (
    <div className="campaign-list-view stage-campaign-list">
      {rows.map((r, index) => (
        <CreatorListRow
          key={r.inf_id}
          r={r}
          index={index}
          onOpen={() => onOpen(r)}
        />
      ))}
    </div>
  );
}

/**
 * Server-driven pager mirroring the Historic Creators picker footer
 * ("X–Y of Z · Prev N/M Next"). Prev/Next are <Link>s that flip `?cpage`
 * while preserving the active tab and every current filter param — changing the
 * page re-renders the server tab body with a new offset, so there's no heavy
 * client state here.
 */
function CreatorPager({
  total,
  page,
  pageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const hrefForPage = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("cpage");
    else next.set("cpage", String(p));
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  const navBtn =
    "inline-flex items-center gap-1 rounded-[8px] border border-[#E7E2D2] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6E695E] transition-colors hover:bg-[#F5F1EC]";
  const navDisabled =
    "inline-flex items-center gap-1 rounded-[8px] border border-[#E7E2D2] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6E695E] opacity-40 pointer-events-none";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-bg-white px-3.5 py-2.5 shadow-sm">
      <span className="text-[12px] text-text-secondary">
        {total === 0
          ? "0 creators"
          : `${rangeStart}–${rangeEnd} of ${total.toLocaleString(
              "en-IN",
            )} creator${total === 1 ? "" : "s"}`}
      </span>
      <div className="flex items-center gap-1.5">
        {atStart ? (
          <span className={navDisabled} aria-disabled>
            <ChevronLeft size={13} aria-hidden />
            Prev
          </span>
        ) : (
          <Link
            href={hrefForPage(page - 1) as never}
            scroll={false}
            className={navBtn}
            aria-label="Previous page"
            rel="prev"
          >
            <ChevronLeft size={13} aria-hidden />
            Prev
          </Link>
        )}
        <span className="px-1 text-[12px] tabular text-text-tertiary">
          {page} / {totalPages}
        </span>
        {atEnd ? (
          <span className={navDisabled} aria-disabled>
            Next
            <ChevronRight size={13} aria-hidden />
          </span>
        ) : (
          <Link
            href={hrefForPage(page + 1) as never}
            scroll={false}
            className={navBtn}
            aria-label="Next page"
            rel="next"
          >
            Next
            <ChevronRight size={13} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

function creatorTone(r: CreatorAnalyticsRow) {
  if (r.is_active === false) return "var(--color-danger-text, #cf3f33)";
  if (r.creator_type === "new_creator") return "#3b6fd4";
  return "var(--color-success-text)";
}

function creatorProgress(r: CreatorAnalyticsRow) {
  if (r.total_collab_count <= 0) return 12;
  return Math.min(100, Math.max(18, Math.round(r.live_collab_count * 100 / r.total_collab_count)));
}

function creatorStyle(r: CreatorAnalyticsRow, index: number) {
  return {
    "--campaign-accent": creatorTone(r),
    "--stage-accent": creatorTone(r),
    "--campaign-progress": `${creatorProgress(r)}%`,
    "--campaign-card-index": index,
  } as CSSProperties;
}

function CreatorListRow({
  r,
  index,
  onOpen,
}: {
  r: CreatorAnalyticsRow;
  index: number;
  onOpen: () => void;
}) {
  return (
    <article
      className="campaign-list-row stage-campaign-row"
      style={creatorStyle(r, index)}
    >
      <div className="stage-campaign-identity">
        <Avatar
          src={r.profile_pic}
          username={r.username}
          name={r.inf_name}
          size={46}
        />
        <div className="campaign-list-row__main">
          <div className="campaign-card__id-row">
            <span className="campaign-card__id">
              <strong>{r.inf_id}</strong>
            </span>
            <CreatorTypeChip type={r.creator_type} />
            <DeactivatedBadge isActive={r.is_active} />
          </div>
          <h3>{r.inf_name ?? (r.username || "—")}</h3>
          <p>
            @{r.username || "—"} · {r.category ?? "No tier"} ·{" "}
            {formatFollowers(r.followers)}
          </p>
        </div>
      </div>

      <div className="campaign-list-row__allocation stage-campaign-signal">
        <div>
          <span>Live Collabs</span>
          <strong>{creatorProgress(r)}%</strong>
        </div>
        <span className="campaign-card__progress-track" aria-hidden>
          <span />
        </span>
        <div className="campaign-list-row__reachouts">
          <span>{r.current_stage ? <StageCell stage={r.current_stage} /> : "No stage"}</span>
          <strong>{r.live_collab_count}</strong>
        </div>
      </div>

      <dl className="campaign-list-row__stats">
        <div>
          <dt>Followers</dt>
          <dd>{formatFollowers(r.followers)}</dd>
        </div>
        <div>
          <dt>Collabs</dt>
          <dd>{collabSummary(r)}</dd>
        </div>
        <div>
          <dt>Deliverables</dt>
          <dd>{r.deliverable_count}</dd>
        </div>
        <div>
          <dt>Last Post</dt>
          <dd>{formatDate(r.last_post_date)}</dd>
        </div>
      </dl>

      <div className="campaign-list-row__actions">
        <button
          type="button"
          className="campaign-list-action campaign-list-action--brief"
          onClick={onOpen}
          aria-label={`View collab history for ${r.inf_name ?? r.username}`}
        >
          <History size={13} aria-hidden />
          History
        </button>
      </div>
    </article>
  );
}

function CreatorCard({
  r,
  index,
  onOpen,
}: {
  r: CreatorAnalyticsRow;
  index: number;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "ob-card",
        r.is_active === false ? "ob-card-pending" : "ob-card-onboarded",
      )}
      style={creatorStyle(r, index)}
    >
      <div className="ob-card-head">
        <Avatar
          src={r.profile_pic}
          username={r.username}
          name={r.inf_name}
          size={44}
          className="ob-card-avatar"
        />
        <div className="ob-card-id">
          <div className="ob-card-name">
            {r.inf_name ?? (r.username || "—")}
          </div>
          {r.username && <div className="ob-card-handle">@{r.username}</div>}
        </div>
      </div>

      <div className="ob-card-pills">
        <span className="campaign-chip tabular">{r.inf_id}</span>
        <CreatorTypeChip type={r.creator_type} />
        <DeactivatedBadge isActive={r.is_active} />
        {r.current_stage && <StageCell stage={r.current_stage} />}
        <PartnershipBadge status={r.partnership_status} compact />
        {r.category && <span className="campaign-chip">{r.category}</span>}
      </div>

      <dl className="ob-card-meta-grid">
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Followers</span>
          <span className="ob-card-meta-val tabular">
            {formatFollowers(r.followers)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Region</span>
          <span className="ob-card-meta-val">{r.state ?? "—"}</span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Collabs</span>
          <span className="ob-card-meta-val tabular">{collabSummary(r)}</span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Last Post</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(r.last_post_date)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Deliverables</span>
          <span className="ob-card-meta-val tabular">
            {r.deliverable_count}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Reach Out</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(r.reach_out_from)}
          </span>
        </div>
      </dl>

      <div className="ob-card-actions">
        <button
          type="button"
          className="action-view"
          onClick={onOpen}
        >
          <History size={12} aria-hidden />
          History
        </button>
      </div>
    </div>
  );
}

function CreatorHistoryModal({
  row,
  onClose,
}: {
  row: CreatorAnalyticsRow;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [collabs, setCollabs] = useState<CreatorCollab[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // On-demand: load this creator's collab history when the modal opens.
  useEffect(() => {
    let cancelled = false;
    setCollabs(null);
    setError(null);
    loadCreatorCollabHistory(row.inf_id)
      .then((list) => {
        if (!cancelled) setCollabs(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load history");
          setCollabs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row.inf_id]);

  if (!mounted) return null;

  const loading = collabs === null;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding" onClick={onClose}>
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding ob-overview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <History size={16} aria-hidden />
            <h2 className="font-semibold">Collab History</h2>
            <span className="chip text-[10px] tabular">{row.inf_id}</span>
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
                src={row.profile_pic}
                username={row.username}
                name={row.inf_name}
                size={48}
                interactive={false}
              />
              <div className="ob-overview-identity">
                <strong>{row.inf_name ?? (row.username || "—")}</strong>
                <span>@{row.username || "—"}</span>
                {row.username && (
                  <a
                    href={
                      row.instagram_link ||
                      `https://www.instagram.com/${row.username}/`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-[#3B6FD4] hover:underline"
                  >
                    <ExternalLink size={11} aria-hidden />
                    View Profile
                  </a>
                )}
              </div>
              <CreatorTypeChip type={row.creator_type} />
            </div>
            <div className="ob-overview-pills">
              {row.current_stage && (
                <WorkflowStatusPill
                  status={row.current_stage as WorkflowStatus}
                />
              )}
              {row.category && (
                <span className="campaign-chip">{row.category}</span>
              )}
              <span className="pill pill--muted tabular">
                {formatFollowers(row.followers)} followers
              </span>
            </div>
          </section>

          <section className="ob-overview-grid">
            <DetailItem label="Total Collabs" value={collabSummary(row)} />
            <DetailItem label="Deliverables" value={row.deliverable_count} />
            <DetailItem label="Region" value={row.state ?? "—"} />
            <DetailItem
              label="Last Onboard"
              value={formatDate(row.last_onboard_date)}
              mono
            />
            <DetailItem
              label="Last Post"
              value={formatDate(row.last_post_date)}
              mono
            />
            <DetailItem
              label="Reach Out Window"
              value={`${formatDate(row.reach_out_from)} → ${formatDate(
                row.reach_out_to,
              )}`}
              mono
            />
            <DetailItem label="Collab Types" value={row.collab_types ?? "—"} />
          </section>

          <section className="mt-3">
            <div className="mb-2 flex items-center gap-2 text-[0.78rem] text-text-secondary">
              <History size={13} aria-hidden />
              <strong className="text-text-primary">Every collaboration</strong>
              {!loading && !error && (
                <span className="pill pill--parent">{collabs.length}</span>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-text-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span className="text-[0.78rem]">Loading collab history…</span>
              </div>
            ) : error ? (
              <p className="ob-overview-note text-danger-text">{error}</p>
            ) : collabs.length === 0 ? (
              <p className="ob-overview-note">
                No collaborations recorded for this creator yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {collabs.map((c, i) => (
                  <CollabRow key={`${c.collabId}-${c.source}-${i}`} c={c} />
                ))}
              </ul>
            )}
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

function CollabRow({ c }: { c: CreatorCollab }) {
  const hasLink = !!c.postLink && /^https?:\/\//i.test(c.postLink.trim());
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-bg-surface px-2.5 py-1.5">
      <span className="post-id tabular">{c.collabId}</span>
      {c.contentType && (
        <span className="pill pill--muted">{c.contentType}</span>
      )}
      <span className="tabular text-[0.72rem] text-text-secondary">
        {formatDate(c.postDate)}
      </span>
      {c.paymentStatus && (
        <span className="pill pill--muted">{c.paymentStatus}</span>
      )}
      {c.source === "historic" ? (
        <span className="pill pill--muted" title="From the legacy archive">
          <History size={9} aria-hidden />
          Historic
        </span>
      ) : (
        <span className="pill pill--info" title="From the live system">
          <Sparkles size={9} aria-hidden />
          Live
        </span>
      )}
      {hasLink && (
        <a
          href={c.postLink!.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="action-btn action-btn--view ml-auto"
          aria-label={`Open Instagram post for ${c.collabId}`}
          title="Open Instagram post"
        >
          <ExternalLink size={11} aria-hidden />
          Post
        </a>
      )}
    </li>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="ob-overview-item">
      <span>{label}</span>
      <strong className={cn(mono && "tabular")}>{value}</strong>
    </div>
  );
}
