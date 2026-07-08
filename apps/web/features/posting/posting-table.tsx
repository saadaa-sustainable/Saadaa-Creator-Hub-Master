"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Eye, Grid3X3, Inbox, List as ListIcon, Send } from "lucide-react";
import { PartnershipKeyEdit, WorkflowStatusPill } from "@/components/ui";
import { InstagramPreviewCard } from "@/components/ui/instagram-preview";
import { PartnershipBadge } from "@/components/ui/status-pill";
import {
  formatDate,
  formatFollowers,
  formatRupees,
  workflowStatusLabel,
} from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  AdsRightsCell,
  CollabIdBadge,
  DriveLinkCell,
  PostIdWithCollab,
  PostLinkCell,
  collabIdLabel,
  formatDeliverables,
  isPosted,
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

  return (
    <>
      {selected && (
        <PostingModal
          open={!!selected}
          onClose={() => setSelected(null)}
          // Posting rows are always onboarded — post_id is non-null here.
          postId={selected.post_id ?? ""}
          postIdShort={selected.post_id_short ?? undefined}
          collabId={collabIdLabel(selected)}
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

      <div className="stage-board-toolbar">
        <div className="stage-board-toolbar__copy">
          <span>
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </span>
          <strong>
            {view === "list" ? "List view" : "Card view"} · posting data
          </strong>
        </div>
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
      </div>

      {view === "list" ? (
        rows.length === 0 ? (
          <PostingEmpty />
        ) : (
          <div className="campaign-list-view stage-campaign-list">
            {rows.map((r, index) => (
              <PostingListRow
                key={r.post_id}
                r={r}
                index={index}
                onSubmit={setSelected}
                onOverview={setOverviewRow}
              />
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <PostingEmpty />
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

function postingTone(r: PostingRow) {
  return isPosted(r)
    ? "var(--color-success-text)"
    : "var(--color-warning-text, #b57514)";
}

function postingProgress(r: PostingRow) {
  if (isPosted(r)) return 100;
  if (r.partnership_id || r.post_link || r.download_link) return 68;
  if (r.ads_usage_rights) return 42;
  return 18;
}

function postingStyle(r: PostingRow, index: number) {
  return {
    "--campaign-accent": postingTone(r),
    "--campaign-progress": `${postingProgress(r)}%`,
    "--campaign-card-index": index,
  } as CSSProperties;
}

function PostingEmpty() {
  return (
    <div className="campaign-filter-empty">
      <Inbox size={28} aria-hidden />
      <strong>No posting rows match these filters</strong>
      <span>Try clearing filters or widening the onboarded date range.</span>
    </div>
  );
}

function PostingListRow({
  r,
  index,
  onSubmit,
  onOverview,
}: {
  r: PostingRow;
  index: number;
  onSubmit: (row: PostingRow) => void;
  onOverview: (row: PostingRow) => void;
}) {
  const posted = isPosted(r);

  return (
    <article
      className="campaign-list-row stage-campaign-row"
      style={postingStyle(r, index)}
    >
      <div className="stage-campaign-identity">
        <InstagramPreviewCard
          link={r.post_link}
          pic={r.creator?.profile_pic}
          username={r.creator?.username}
          size={46}
        />
        <div className="campaign-list-row__main">
          <div className="campaign-card__id-row">
            {r.campaign?.campaign_id && (
              <span className="campaign-card__id">
                <strong>{r.campaign.campaign_id}</strong>
              </span>
            )}
            <span className="campaign-status-pill">
              {workflowStatusLabel(r.workflow_status)}
            </span>
          </div>
          <h3>{r.creator?.inf_name ?? r.creator?.username ?? "—"}</h3>
          <p>
            @{r.creator?.username ?? "—"} · {r.post_id_short ?? r.post_id} ·{" "}
            {collabIdLabel(r)}
          </p>
        </div>
      </div>

      <div className="campaign-list-row__allocation stage-campaign-signal">
        <div>
          <span>Posting Progress</span>
          <strong>{postingProgress(r)}%</strong>
        </div>
        <span className="campaign-card__progress-track" aria-hidden>
          <span />
        </span>
        <div className="campaign-list-row__reachouts">
          <span>{formatDeliverables(r)}</span>
          <strong>{posted ? 1 : 0}</strong>
        </div>
      </div>

      <dl className="campaign-list-row__stats">
        <div>
          <dt>Followers</dt>
          <dd>{formatFollowers(r.creator?.followers)}</dd>
        </div>
        <div>
          <dt>Commercials</dt>
          <dd>
            {r.commercial_amount != null
              ? formatRupees(r.commercial_amount)
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Rights</dt>
          <dd>{r.ads_usage_rights || "—"}</dd>
        </div>
        <div>
          <dt>Post Date</dt>
          <dd>{formatDate(r.post_date) ?? "—"}</dd>
        </div>
      </dl>

      <div className="campaign-list-row__actions">
        {posted ? (
          <button
            type="button"
            className="campaign-list-action campaign-list-action--brief"
            onClick={() => onOverview(r)}
            aria-label="View posting overview"
          >
            <Eye size={13} aria-hidden />
            Overview
          </button>
        ) : (
          <button
            type="button"
            className="campaign-list-action campaign-list-action--brief"
            onClick={() => onSubmit(r)}
          >
            <Send size={13} aria-hidden />
            Submit
          </button>
        )}
      </div>
    </article>
  );
}

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

  return (
    <div
      className={cn(
        "ob-card",
        posted ? "ob-card-onboarded" : "ob-card-pending",
      )}
    >
      <div className="ob-card-head">
        <InstagramPreviewCard
          link={r.post_link}
          pic={r.creator?.profile_pic}
          username={r.creator?.username}
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
        <span className="ob-card-stage-text">
          {workflowStatusLabel(r.workflow_status)}
        </span>
        {r.campaign?.campaign_id && (
          <span className="campaign-chip">{r.campaign.campaign_id}</span>
        )}
        <PostIdWithCollab r={r} />
        <CollabIdBadge r={r} rows={rows} />
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
            <span className="ob-card-meta-label">Partnership</span>
            <span className="ob-card-meta-val flex flex-wrap items-center gap-1.5">
              <PartnershipBadge status={r.partnership_status} showEmpty compact />
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
