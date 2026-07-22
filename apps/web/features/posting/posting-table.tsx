"use client";

import { useSearchParams } from "next/navigation";import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  Grid3X3,
  Inbox,
  Layers,
  List as ListIcon,
  Send,
} from "lucide-react";
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
import { firstNonEmptyString } from "@/lib/attribution";
import { useLiveSearch } from "@/lib/live-search";
import { isPastDue } from "@/lib/workflow";
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


/** Est-delivery-anchored overdue — same shared rule as the KPI tiles. */
function postingOverdue(r: PostingRow): boolean {
  const status = String(r.workflow_status ?? "").toLowerCase();
  if (status.includes("posted") || status.includes("delivered")) return false;
  return isPastDue(r.est_delivery, r.reach_out_date);
}

export function PostingTable({
  rows: allRows,
  initialView = "list",
}: PostingTableProps) {
  // Instant free-text search — client-side over the full loaded set (the
  // filter bar broadcasts keystrokes via lib/live-search). Same fields the
  // server needle used to match.
  const searchParams = useSearchParams();
  const liveQ = useLiveSearch("posting", searchParams.get("q") ?? "");
  const rows = useMemo<PostingRow[]>(() => {
    const needle = liveQ.trim().toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((r) => {
      const fields = [
        r.post_id,
        r.post_id_short,
        r.collab_id,
        r.order_id,
        r.campaign?.campaign_id,
        r.campaign?.campaign_name,
        r.creator?.inf_name,
        r.creator?.username,
        r.creator?.instagram_link,
        r.post_link,
      ];
      return fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
    });
  }, [allRows, liveQ]);
  const [selected, setSelected] = useState<PostingRow | null>(null);
  const [overviewRow, setOverviewRow] = useState<PostingRow | null>(null);
  const [view, setView] = useState<"list" | "cards">(initialView);
  // Render pagination — the full set is fetched (search/filters see everything);
  // only the DOM is windowed. "Show more" reveals the next page.
  const RENDER_PAGE = 30;
  const [visibleCount, setVisibleCount] = useState(RENDER_PAGE);
  // New filter/search result set → back to page one.
  useEffect(() => setVisibleCount(RENDER_PAGE), [rows]);

  // Collab-level grouping (2026-07-11): deliverable rows sharing a collab_id
  // collapse into ONE group when the collab has >1 deliverable row (stories
  // never spawn rows, so they're excluded by construction). Single-deliverable
  // collabs keep the classic per-row layout. Order preserved (fetch order).
  const groups = useMemo<Array<{ key: string; items: PostingRow[] }>>(() => {
    const map = new Map<string, PostingRow[]>();
    const order: string[] = [];
    for (const r of rows) {
      const k = collabIdLabel(r) || r.post_id || "";
      if (!map.has(k)) {
        map.set(k, []);
        order.push(k);
      }
      map.get(k)!.push(r);
    }
    return order.map((k) => ({ key: k, items: map.get(k)! }));
  }, [rows]);

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
          requireBank={
            (selected.collab_type ?? "").trim().toLowerCase() ===
              "barter + paid" &&
            // COLLAB-LEVEL: bank present on ANY deliverable of this collab
            // (e.g. filled while posting a sibling) satisfies the gate.
            !rows.some(
              (r) =>
                collabIdLabel(r) === collabIdLabel(selected) &&
                String(r.bank_number ?? "").trim() &&
                String(r.ifsc ?? "").trim(),
            )
          }
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
        groups.length === 0 ? (
          <PostingEmpty />
        ) : (
          <div className="campaign-list-view stage-campaign-list">
            {groups.slice(0, visibleCount).map((g, index) =>
              g.items.length === 1 ? (
                <PostingListRow
                  key={g.items[0].post_id}
                  r={g.items[0]}
                  index={index}
                  onSubmit={setSelected}
                  onOverview={setOverviewRow}
                />
              ) : (
                <CollabGroupSection
                  key={g.key}
                  group={g}
                  index={index}
                  onSubmit={setSelected}
                  onOverview={setOverviewRow}
                />
              ),
            )}
          </div>
        )
      ) : groups.length === 0 ? (
        <PostingEmpty />
      ) : (
        <div className="ob-card-grid">
          {groups.slice(0, visibleCount).map((g, index) =>
            g.items.length === 1 ? (
              <PostingCard
                key={g.items[0].post_id}
                r={g.items[0]}
                rows={rows}
                onSubmit={setSelected}
                onOverview={setOverviewRow}
              />
            ) : (
              <div key={g.key} style={{ gridColumn: "1 / -1" }}>
                <CollabGroupSection
                  group={g}
                  index={index}
                  onSubmit={setSelected}
                  onOverview={setOverviewRow}
                />
              </div>
            ),
          )}
        </div>
      )}

      {groups.length > visibleCount && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="rounded-[10px] border border-border bg-bg-white px-4 py-2 text-[0.8rem] font-semibold text-text-secondary transition-colors hover:bg-bg-muted"
            onClick={() => setVisibleCount((v) => v + 50)}
          >
            Show more ({groups.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </>
  );
}

/** Contextual attribution: posted rows show who posted (fallback: onboarder for
 *  rows predating the posted_by stamp), queue rows show who onboarded. */
function postingAttributionLabel(r: PostingRow): string | null {
  if (isPosted(r)) {
    const who = firstNonEmptyString(r.posted_by, r.onboarded_by, r.logged_by);
    return who ? `Posted by ${who}` : null;
  }
  const who = firstNonEmptyString(r.onboarded_by, r.logged_by);
  return who ? `Onboarded by ${who}` : null;
}

function postingDaysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Contextual age: posted rows → days since the post; queue rows → days since
 *  onboarding. Null when the date is missing. */
function postingAgeLabel(r: PostingRow): string | null {
  if (isPosted(r)) {
    const d = postingDaysAgo(r.post_date);
    return d == null ? null : `Posted ${d === 0 ? "today" : `${d}d ago`}`;
  }
  const d = postingDaysAgo(r.onboard_date);
  return d == null ? null : `Onboarded ${d === 0 ? "today" : `${d}d ago`}`;
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
          pic={r.post_thumbnail ?? r.creator?.profile_pic}
          mediaUrl={r.post_media}
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
          {(postingAttributionLabel(r) || postingAgeLabel(r)) && (
            <p>
              {postingAttributionLabel(r)}
              {postingAttributionLabel(r) && postingAgeLabel(r) ? " · " : ""}
              {postingAgeLabel(r)}
            </p>
          )}
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
          {/* Overdue REPLACES the label — the pill can never clip at narrow
              chip widths, and the red date doubles the signal. */}
          <dt className="flex items-center gap-1">
            {postingOverdue(r) ? (
              <span
                className="overdue-pill overdue-pill--tiny"
                title="Estimated delivery date has passed and this deliverable is not posted yet."
              >
                <AlertTriangle size={7} aria-hidden />
                Overdue
              </span>
            ) : (
              "Delivery"
            )}
          </dt>
          <dd className={postingOverdue(r) ? "!text-danger-text" : undefined}>
            {formatDate(r.est_delivery) ?? "—"}
          </dd>
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

/**
 * Collab-level group (2026-07-11): one section per collab_id with >1
 * deliverable row. The header shows the creator once + a chip per deliverable
 * (green ✓ submitted / amber pending) and "x/y submitted"; expanding reveals
 * the classic per-deliverable rows so each posting form is filed one by one.
 */
function CollabGroupSection({
  group,
  index,
  onSubmit,
  onOverview,
}: {
  group: { key: string; items: PostingRow[] };
  index: number;
  onSubmit: (row: PostingRow) => void;
  onOverview: (row: PostingRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rep = group.items[0];
  const total = group.items.length;
  const submitted = group.items.filter((r) => isPosted(r)).length;
  const allDone = submitted === total;

  const shortLabel = (r: PostingRow): string => {
    const short = r.post_id_short ?? r.post_id ?? "";
    const m = String(short).match(/P\d+$/i);
    return m ? m[0].toUpperCase() : String(short);
  };

  return (
    <article
      className="campaign-list-row stage-campaign-row"
      style={{
        ...postingStyle(rep, index),
        display: "block",
        ...(allDone
          ? { ["--campaign-accent" as string]: "var(--color-success-text)" }
          : {}),
      }}
    >
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-3 text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <InstagramPreviewCard
          pic={rep.post_thumbnail ?? rep.creator?.profile_pic}
          mediaUrl={rep.post_media}
          username={rep.creator?.username}
          size={46}
        />
        <div className="min-w-0 flex-1">
          <div className="campaign-card__id-row">
            {rep.campaign?.campaign_id && (
              <span className="campaign-card__id">
                <strong>{rep.campaign.campaign_id}</strong>
              </span>
            )}
            <span className="pill pill--muted inline-flex items-center gap-1">
              <Layers size={10} aria-hidden />
              {total} deliverables
            </span>
            <span
              className={cn(
                "pill inline-flex items-center gap-1 font-bold",
                allDone
                  ? "bg-success-bg text-success-text"
                  : "bg-warning-bg text-warning-text",
              )}
            >
              {submitted}/{total} submitted
            </span>
          </div>
          <h3 className="truncate">
            {rep.creator?.inf_name ?? rep.creator?.username ?? "—"}
          </h3>
          <p className="truncate">
            @{rep.creator?.username ?? "—"} · {group.key}
            {postingAttributionLabel(rep) && (
              <> · {postingAttributionLabel(rep)}</>
            )}
          </p>
        </div>

        {/* Per-deliverable status chips — pending forms stand out at a glance. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {group.items.map((r) => {
            const done = isPosted(r);
            return (
              <span
                key={r.post_id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-extrabold tabular whitespace-nowrap",
                  done
                    ? "border-success-text/30 bg-success-bg text-success-text"
                    : "border-warning-text/30 bg-warning-bg text-warning-text",
                )}
                title={`${r.post_id_short ?? r.post_id} — ${done ? "posted" : "posting form pending"}`}
              >
                {done ? (
                  <Check size={10} aria-hidden />
                ) : (
                  <Clock3 size={10} aria-hidden />
                )}
                {shortLabel(r)}
              </span>
            );
          })}
        </div>

        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            "shrink-0 text-text-tertiary transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="campaign-list-view stage-campaign-list mt-3 border-t border-border pt-3">
          {group.items.map((r, i) => (
            <PostingListRow
              key={r.post_id}
              r={r}
              index={i}
              onSubmit={onSubmit}
              onOverview={onOverview}
            />
          ))}
        </div>
      )}
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
          pic={r.post_thumbnail ?? r.creator?.profile_pic}
          mediaUrl={r.post_media}
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
        {postingAttributionLabel(r) && (
          <span className="pill pill--muted">{postingAttributionLabel(r)}</span>
        )}
        {postingAgeLabel(r) && (
          <span className="pill pill--muted">{postingAgeLabel(r)}</span>
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
          <span className="ob-card-meta-label">Est. Delivery</span>
          <span className="ob-card-meta-val ob-card-delivery-val tabular">
            {formatDate(r.est_delivery) ?? "—"}
            {postingOverdue(r) && (
              <button
                type="button"
                className="ob-card-overdue"
                aria-label="Estimated delivery date has passed and this deliverable is not posted yet."
                data-tooltip="Estimated delivery date has passed and this deliverable is not posted yet."
              >
                <AlertTriangle size={7} aria-hidden />
                Overdue
              </button>
            )}
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
