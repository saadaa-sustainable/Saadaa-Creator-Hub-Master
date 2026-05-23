"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  Grid3X3,
  Inbox,
  List as ListIcon,
  Network,
  Send,
  Star,
} from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Avatar, PartnershipKeyEdit, WorkflowStatusPill } from "@/components/ui";
import { formatDate, formatFollowers, formatRupees } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  AdsRightsCell,
  DriveLinkCell,
  PostLinkCell,
  findParentPostId,
  formatDeliverables,
  isChildRow,
  isPosted,
  postingColumns,
} from "./columns";
import { PostingModal } from "./posting-form";
import { PostingOverviewModal } from "./posting-overview-modal";
import type { PostingRow } from "./types";

export interface PostingTableProps {
  rows: PostingRow[];
  initialView?: "list" | "cards";
}

export function PostingTable({
  rows,
  initialView = "list",
}: PostingTableProps) {
  const [selected, setSelected] = useState<PostingRow | null>(null);
  const [overviewRow, setOverviewRow] = useState<PostingRow | null>(null);
  const [view, setView] = useState<"list" | "cards">(initialView);

  // Mobile force-cards (matches onboarding behavior).
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

  const columnsWithActions = useMemo(
    () => [
      ...postingColumns,
      {
        id: "actions",
        header: "Action",
        cell: ({ row }: { row: { original: PostingRow } }) => {
          const r = row.original;
          if (isPosted(r)) {
            return (
              <span className="ob-row-action">
                <button
                  type="button"
                  className="action-btn action-btn--view"
                  onClick={() => setOverviewRow(r)}
                  aria-label="View posting overview"
                >
                  <Eye size={11} aria-hidden />
                  Overview
                </button>
              </span>
            );
          }
          return (
            <button
              type="button"
              className="action-btn"
              onClick={() => setSelected(r)}
            >
              <Send size={11} aria-hidden />
              Submit
            </button>
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      {selected && (
        <PostingModal
          open={!!selected}
          onClose={() => setSelected(null)}
          postId={selected.post_id}
          postIdShort={selected.post_id_short ?? undefined}
          creatorName={selected.creator?.inf_name}
          username={selected.creator?.username}
          adsUsageRights={selected.ads_usage_rights}
        />
      )}
      {overviewRow && (
        <PostingOverviewModal
          row={overviewRow}
          rows={rows}
          onClose={() => setOverviewRow(null)}
        />
      )}

      {/* View toggle — legacy `.ob-viewtoggle` (shared with onboarding). */}
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
          <DataTable<PostingRow>
            data={rows}
            columns={columnsWithActions}
            emptyTitle="No posting rows match these filters"
            emptyDescription="Try clearing filters or widening the onboarded date range."
            mobileCard={(r) => (
              <PostingCard
                r={r}
                rows={rows}
                onSubmit={setSelected}
                onOverview={setOverviewRow}
              />
            )}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card text-center py-10 text-text-tertiary">
          <Inbox size={28} className="mx-auto mb-2" />
          <p className="font-medium text-text-primary">
            No posting rows match these filters
          </p>
          <p className="text-sm">
            Try clearing filters or widening the onboarded date range.
          </p>
        </div>
      ) : (
        <div className="ob-card-grid">
          {rows.map((r) => (
            <PostingCard
              key={r.post_id}
              r={r}
              rows={rows}
              onSubmit={setSelected}
              onOverview={setOverviewRow}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Posting card — mirrors `ObCard` shell exactly. */
function PostingCard({
  r,
  rows,
  onSubmit,
  onOverview,
}: {
  r: PostingRow;
  rows: PostingRow[];
  onSubmit: (row: PostingRow) => void;
  onOverview: (row: PostingRow) => void;
}) {
  const posted = isPosted(r);
  const child = isChildRow(r);
  const hasSiblings = rows.some(
    (x) =>
      x &&
      x.inf_id === r.inf_id &&
      Number(x.collab_number ?? 1) === Number(r.collab_number ?? 1) &&
      Number(x.deliverable_index ?? 0) > 1,
  );

  return (
    <div
      className={cn(
        "ob-card",
        posted ? "ob-card-onboarded" : "ob-card-pending",
        child && "ob-card-child",
      )}
    >
      <div className="ob-card-head">
        <Avatar
          src={r.creator?.profile_pic}
          username={r.creator?.username}
          name={r.creator?.inf_name}
          size={44}
          className="ob-card-avatar"
        />
        <div className="ob-card-id">
          <div className="ob-card-name">
            {r.creator?.inf_name ?? r.creator?.username ?? "—"}
          </div>
          {r.creator?.username && (
            <div className="ob-card-handle">@{r.creator.username}</div>
          )}
        </div>
      </div>

      <div className="ob-card-pills">
        <span className="ob-card-stage-pill">
          <WorkflowStatusPill status={r.workflow_status} />
        </span>
        <span className="ob-card-stage-text">{r.workflow_status}</span>
        {r.campaign?.campaign_id && (
          <span className="campaign-chip">{r.campaign.campaign_id}</span>
        )}
        <span className="post-id tabular">{r.post_id_short ?? r.post_id}</span>
        {child ? (
          <span
            className="pill pill--child"
            title={`Child of ${findParentPostId(r, rows)}`}
          >
            <Network size={10} aria-hidden />
            Child {Number(r.deliverable_index ?? 0)}
          </span>
        ) : hasSiblings ? (
          <span
            className="pill pill--parent"
            title="Primary deliverable for this collab"
          >
            <Star size={10} aria-hidden />
            Parent
          </span>
        ) : null}
        {(r.nomenclature ?? r.content_type) && (
          <span className="pill pill--muted">
            {r.nomenclature ?? r.content_type}
          </span>
        )}
      </div>

      <dl className="ob-card-meta-grid">
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Followers</span>
          <span className="ob-card-meta-val tabular">
            {formatFollowers(r.creator?.followers)}
            {r.creator?.category && (
              <span className="ob-card-meta-sub"> · {r.creator.category}</span>
            )}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Collab</span>
          <span className="ob-card-meta-val">{r.collab_type ?? "—"}</span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Commercials</span>
          <span className="ob-card-meta-val tabular">
            {r.commercial_amount != null
              ? formatRupees(r.commercial_amount)
              : "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Deliverables</span>
          <span className="ob-card-meta-val tabular">
            {formatDeliverables(r)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Ads Rights</span>
          <span className="ob-card-meta-val">
            <AdsRightsCell r={r} />
          </span>
        </div>
        {(r.ads_usage_rights ?? "").trim() && (
          <div className="ob-card-meta ob-card-meta--full">
            <span className="ob-card-meta-label">Partnership Key</span>
            <span className="ob-card-meta-val">
              <PartnershipKeyEdit postId={r.post_id!} value={r.partnership_id} compact isPosted={posted} />
            </span>
          </div>
        )}
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Onboarded</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(r.onboard_date) ?? "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Post Date</span>
          <span className="ob-card-meta-val tabular">
            {formatDate(r.post_date) ?? "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Order ID</span>
          <span
            className="ob-card-meta-val tabular"
            style={
              r.order_id ? { color: "var(--color-success-text)" } : undefined
            }
          >
            {r.order_id ?? "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Live Link</span>
          <span className="ob-card-meta-val">
            <PostLinkCell url={r.post_link} />
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Drive</span>
          <span className="ob-card-meta-val">
            <DriveLinkCell url={r.download_link} />
          </span>
        </div>
      </dl>

      <div className="ob-card-actions">
        {posted ? (
          <button
            type="button"
            className="action-view"
            onClick={() => onOverview(r)}
          >
            <Eye size={12} aria-hidden />
            Overview
          </button>
        ) : (
          <button
            type="button"
            className="action-primary"
            onClick={() => onSubmit(r)}
          >
            <Send size={12} aria-hidden />
            Submit Posting
          </button>
        )}
      </div>
    </div>
  );
}
