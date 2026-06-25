"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Grid3X3,
  History,
  Inbox,
  List as ListIcon,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Avatar, StatusPill, WorkflowStatusPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatFollowers } from "@/lib/formatters";
import type { ColumnDef } from "@tanstack/react-table";
import type { WorkflowStatus } from "@/lib/supabase/types.gen";
import type { CreatorAnalyticsRow, CreatorCollab } from "./types";

export interface CreatorAnalyticsViewProps {
  rows: CreatorAnalyticsRow[];
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

  const columns = useMemo<ColumnDef<CreatorAnalyticsRow>[]>(
    () => [
      {
        id: "creator",
        accessorFn: (r) => r.inf_name ?? r.username ?? "",
        header: "Creator",
        cell: ({ row }) => <CreatorCell r={row.original} />,
      },
      {
        id: "inf_id",
        header: "INF ID",
        accessorKey: "inf_id",
        cell: ({ row }) => (
          <span className="tabular text-[0.78rem]">{row.original.inf_id}</span>
        ),
      },
      {
        id: "type",
        header: "Type",
        accessorKey: "creator_type",
        cell: ({ row }) => <CreatorTypeChip type={row.original.creator_type} />,
      },
      {
        id: "stage",
        header: "Current Stage",
        accessorKey: "current_stage",
        cell: ({ row }) => <StageCell stage={row.original.current_stage} />,
      },
      {
        id: "tier",
        header: "Tier",
        accessorKey: "category",
        cell: ({ row }) =>
          row.original.category ? (
            <span className="campaign-chip">{row.original.category}</span>
          ) : (
            <span className="text-text-tertiary">—</span>
          ),
      },
      {
        id: "followers",
        header: "Followers",
        accessorFn: (r) => r.followers ?? 0,
        cell: ({ row }) => (
          <span className="tabular">
            {formatFollowers(row.original.followers)}
          </span>
        ),
      },
      {
        id: "collabs",
        header: "Collabs",
        accessorFn: (r) => r.total_collab_count,
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap text-[0.78rem]">
            {collabSummary(row.original)}
          </span>
        ),
      },
      {
        id: "deliverables",
        header: "Deliverables",
        accessorFn: (r) => r.deliverable_count,
        cell: ({ row }) => (
          <span className="tabular">{row.original.deliverable_count}</span>
        ),
      },
      {
        id: "last_post",
        header: "Last Post",
        accessorFn: (r) => r.last_post_date ?? "",
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap text-[0.78rem]">
            {formatDate(row.original.last_post_date)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "History",
        cell: ({ row }) => (
          <button
            type="button"
            className="action-btn action-btn--view"
            onClick={() => setDetailRow(row.original)}
            aria-label={`View collab history for ${
              row.original.inf_name ?? row.original.username
            }`}
          >
            <History size={11} aria-hidden />
            History
          </button>
        ),
      },
    ],
    [],
  );

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

      {view === "list" ? (
        <div className="ob-list-wrap">
          <DataTable<CreatorAnalyticsRow>
            data={rows}
            columns={columns}
            emptyTitle="No creators match these filters"
            emptyDescription="Try clearing filters or widening the date ranges."
            mobileCard={(r) => (
              <CreatorCard r={r} onOpen={() => setDetailRow(r)} />
            )}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card text-center py-10 text-text-tertiary">
          <Inbox size={28} className="mx-auto mb-2" />
          <p className="font-medium text-text-primary">
            No creators match these filters
          </p>
          <p className="text-sm">
            Try clearing filters or widening the date ranges.
          </p>
        </div>
      ) : (
        <div className="ob-card-grid">
          {rows.map((r) => (
            <CreatorCard
              key={r.inf_id}
              r={r}
              onOpen={() => setDetailRow(r)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CreatorCell({ r }: { r: CreatorAnalyticsRow }) {
  return (
    <div className="ob-creator-cell">
      <Avatar
        src={r.profile_pic}
        username={r.username}
        name={r.inf_name}
        size={46}
        className="ob-creator-avatar"
      />
      <div className="min-w-0">
        <div className="creator-name">{r.inf_name ?? "—"}</div>
        <div className="creator-handle">@{r.username || "—"}</div>
      </div>
    </div>
  );
}

function CreatorCard({
  r,
  onOpen,
}: {
  r: CreatorAnalyticsRow;
  onOpen: () => void;
}) {
  return (
    <div className="ob-card">
      <div className="ob-card-head">
        <Avatar
          src={r.profile_pic}
          username={r.username}
          name={r.inf_name}
          size={44}
          className="ob-card-avatar"
        />
        <div className="ob-card-id">
          <div className="ob-card-name">{r.inf_name ?? (r.username || "—")}</div>
          {r.username && <div className="ob-card-handle">@{r.username}</div>}
        </div>
      </div>

      <div className="ob-card-pills">
        <CreatorTypeChip type={r.creator_type} />
        {r.current_stage && <StageCell stage={r.current_stage} />}
        <span className="post-id tabular">{r.inf_id}</span>
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
          <span className="ob-card-meta-label">Collabs</span>
          <span className="ob-card-meta-val tabular">{collabSummary(r)}</span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Deliverables</span>
          <span className="ob-card-meta-val tabular">
            {r.deliverable_count}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Last Post</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(r.last_post_date)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Region</span>
          <span className="ob-card-meta-val">{r.state ?? "—"}</span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Reach Out</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(r.reach_out_from)}
          </span>
        </div>
      </dl>

      <div className="ob-card-actions">
        <button type="button" className="action-view" onClick={onOpen}>
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
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const breakdown = Object.entries(row.collab_type_breakdown);

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
          <div className="flex items-center gap-1.5">
            {row.username && (
              <a
                href={`/creators/${encodeURIComponent(row.username)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="action-btn action-btn--view"
                aria-label={`View profile for ${row.inf_name ?? row.username}`}
              >
                <UserRound size={11} aria-hidden />
                View Profile
              </a>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </header>

        <div className="modal-body ob-overview-body">
          <section className="ob-overview-card">
            <div className="ob-overview-head">
              <Avatar
                src={row.profile_pic}
                username={row.username}
                name={row.inf_name}
                size={48}
              />
              <div className="ob-overview-identity">
                <strong>{row.inf_name ?? (row.username || "—")}</strong>
                <span>@{row.username || "—"}</span>
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
            <DetailItem
              label="Collab Types"
              value={
                breakdown.length
                  ? breakdown.map(([k, v]) => `${k}: ${v}`).join(" · ")
                  : "—"
              }
            />
          </section>

          <section className="mt-3">
            <div className="mb-2 flex items-center gap-2 text-[0.78rem] text-text-secondary">
              <History size={13} aria-hidden />
              <strong className="text-text-primary">
                Every collaboration
              </strong>
              <span className="pill pill--parent">{row.collabs.length}</span>
            </div>
            {row.collabs.length === 0 ? (
              <p className="ob-overview-note">
                No collaborations recorded for this creator yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {row.collabs.map((c, i) => (
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
