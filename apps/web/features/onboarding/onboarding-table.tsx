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
  AlertTriangle,
  Eye,
  ExternalLink,
  Grid3X3,
  Inbox,
  Layers,
  Link as LinkIcon,
  List as ListIcon,
  Mail,
  Pencil,
  PackageCheck,
  Send,
  X,
} from "lucide-react";
import { Avatar, WorkflowStatusPill } from "@/components/ui";
import {
  formatDate,
  formatFollowers,
  formatRupees,
  workflowStatusLabel,
} from "@/lib/formatters";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { useLiveSearch } from "@/lib/live-search";
import { shopifyOrderAdminUrl } from "@/lib/shopify";
import {
  DeliverablesChip,
  EmailStatusCell,
  collabCommercialTotal,
  collabDeliverableBreakdown,
  collabIdLabel,
  collabSiblings,
  countCollabDeliverables,
  deliverableBreakdown,
  findRepresentativePostId,
  formatDeliverableCount,
  isCollabRepresentative,
  isOnboarded,
  isOverdue,
  PriorCollabChip,
} from "./columns";
import { OrderCreationModal } from "./order-form";
import { CollabEmailModal, type CollabEmailDraft } from "./collab-email-modal";
import { OnboardingEditModal } from "./onboarding-edit-modal";
import type { OnboardingRow } from "./types";

export interface OnboardingTableProps {
  rows: OnboardingRow[];
  initialView?: "list" | "cards";
}

export function OnboardingTable({
  rows: allRows,
  initialView = "list",
}: OnboardingTableProps) {
  // Instant free-text search — applied here (client) over the full loaded set;
  // the filter bar broadcasts keystrokes via lib/live-search. Same fields the
  // server needle used to match.
  const searchParams = useSearchParams();
  const liveQ = useLiveSearch("onboarding", searchParams.get("q") ?? "");
  const rows = useMemo<OnboardingRow[]>(() => {
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
        r.email,
      ];
      return fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
    });
  }, [allRows, liveQ]);
  const [orderRow, setOrderRow] = useState<OnboardingRow | null>(null);
  const [overviewRow, setOverviewRow] = useState<OnboardingRow | null>(null);
  const [collabEmail, setCollabEmail] = useState<{
    postId: string;
    draft?: CollabEmailDraft;
  } | null>(null);
  const [view, setView] = useState<"list" | "cards">(initialView);
  const [repeatOpen, setRepeatOpen] = useState(false);
  // Render pagination — the full set is fetched (search/filters see everything);
  // only the DOM is windowed. "Show more" reveals the next page.
  const RENDER_PAGE = 30;
  const [visibleCount, setVisibleCount] = useState(RENDER_PAGE);
  // New filter/search result set → back to page one.
  useEffect(() => setVisibleCount(RENDER_PAGE), [rows]);

  // Collapse the board to ONE row per collab_id: render the collab
  // representative only (lowest post_id within each collab_id group).
  // Counts/breakdowns are pre-computed against the FULL `rows` set (so the other
  // deliverables still contribute) and stamped onto each representative. The
  // complete `rows` array is still passed to cards + the overview modal so the
  // per-deliverable list stays viewable.
  const parentRows = useMemo<OnboardingRow[]>(
    () =>
      rows
        .filter((r) => isCollabRepresentative(r, rows))
        .map((rep) => {
          const commercialTotal = collabCommercialTotal(rep, rows);
          return {
            ...rep,
            _collabDeliverableCount: countCollabDeliverables(rep, rows),
            _collabDeliverableBreakdown: collabDeliverableBreakdown(rep, rows),
            ...(commercialTotal != null
              ? { _collabCommercialTotal: commercialTotal }
              : {}),
          };
        }),
    [rows],
  );

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

  return (
    <>
      {orderRow && (
        <OrderCreationModal
          open={!!orderRow}
          onClose={() => setOrderRow(null)}
          id={orderRow.id}
          postId={orderRow.post_id ?? undefined}
          postIdShort={orderRow.post_id_short ?? undefined}
          collabId={collabIdLabel(orderRow)}
          creatorName={orderRow.creator?.inf_name}
          username={orderRow.creator?.username}
          initial={{
            collabType:
              orderRow.collab_type === "Barter" ||
              orderRow.collab_type === "Barter + Paid"
                ? orderRow.collab_type
                : undefined,
            commercials: orderRow.commercial_amount ?? undefined,
          }}
        />
      )}
      {repeatOpen && (
        <OrderCreationModal
          repeatMode
          open={repeatOpen}
          onClose={() => setRepeatOpen(false)}
          postId=""
        />
      )}
      {collabEmail && (
        <CollabEmailModal
          postId={collabEmail.postId}
          draft={collabEmail.draft}
          open={!!collabEmail}
          onClose={() => setCollabEmail(null)}
        />
      )}
      {overviewRow && (
        <OnboardingOverviewModal
          row={overviewRow}
          rows={rows}
          onClose={() => setOverviewRow(null)}
          onEmail={(postId) => setCollabEmail({ postId })}
        />
      )}

      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => setRepeatOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#F0C61E] bg-white px-3.5 py-2 text-sm font-semibold text-[#161513] transition-colors hover:bg-[#F0C61E]"
        >
          <Send size={13} aria-hidden />
          New collab (existing creator)
        </button>
      </div>

      <div className="stage-board-toolbar">
        <div className="stage-board-toolbar__copy">
          <span>
            {parentRows.length} row{parentRows.length === 1 ? "" : "s"}
          </span>
          <strong>
            {view === "list" ? "List view" : "Card view"} · creator onboarding
          </strong>
        </div>
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
      </div>

      {view === "list" ? (
        parentRows.length === 0 ? (
          <StageEmpty
            title="No onboarding rows match these filters"
            description="Try clearing filters or widening the reach-out date range."
          />
        ) : (
          <div className="campaign-list-view stage-campaign-list">
            {parentRows.slice(0, visibleCount).map((r, index) => (
              <OnboardingListRow
                key={r.post_id ?? r.id}
                r={r}
                rows={rows}
                index={index}
                onOpen={setOrderRow}
                onOverview={setOverviewRow}
                onEmail={(postId) => setCollabEmail({ postId })}
              />
            ))}
          </div>
        )
      ) : parentRows.length === 0 ? (
        <StageEmpty
          title="No onboarding rows match these filters"
          description="Try clearing filters or widening the reach-out date range."
        />
      ) : (
        <div className="ob-card-grid">
          {parentRows.slice(0, visibleCount).map((r) => (
            <ObCard
              key={r.post_id ?? r.id}
              r={r}
              rows={rows}
              onOpen={setOrderRow}
              onOverview={setOverviewRow}
              onEmail={(postId) => setCollabEmail({ postId })}
            />
          ))}
        </div>
      )}

      {parentRows.length > visibleCount && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="rounded-[10px] border border-border bg-bg-white px-4 py-2 text-[0.8rem] font-semibold text-text-secondary transition-colors hover:bg-bg-muted"
            onClick={() => setVisibleCount((v) => v + 50)}
          >
            Show more ({parentRows.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </>
  );
}

/** Contextual attribution: onboarded rows show who onboarded, queue rows who
 *  reached out. Null when the field is empty. */
function attributionLabel(r: OnboardingRow): string | null {
  if (isOnboarded(r)) {
    return r.onboarded_by ? `Onboarded by ${r.onboarded_by}` : null;
  }
  return r.logged_by ? `Reached out by ${r.logged_by}` : null;
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Contextual age: onboarded rows → days since onboarding; queue rows → days
 *  since the reach-out. Null when the date is missing. */
function ageLabel(r: OnboardingRow): string | null {
  if (isOnboarded(r)) {
    const d = daysAgo(r.onboard_date);
    return d == null ? null : `Onboarded ${d === 0 ? "today" : `${d}d ago`}`;
  }
  const d = daysAgo(r.reach_out_date);
  return d == null ? null : `Reached out ${d === 0 ? "today" : `${d}d ago`}`;
}

function onboardingTone(r: OnboardingRow) {
  if (isOnboarded(r)) return "var(--color-success-text)";
  if (isOverdue(r)) return "var(--color-danger-text, #cf3f33)";
  return "var(--color-warning-text, #b57514)";
}

function onboardingProgress(r: OnboardingRow) {
  if (isOnboarded(r)) return 100;
  if (r.order_id || r.tracking_id) return 58;
  if (r.collab_type || r.commercial_amount != null) return 32;
  return 14;
}

function stageStyle(accent: string, progress: number, index: number) {
  return {
    "--campaign-accent": accent,
    "--campaign-progress": `${Math.max(0, Math.min(100, progress))}%`,
    "--campaign-card-index": index,
  } as CSSProperties;
}

function StageEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="campaign-filter-empty">
      <Inbox size={28} aria-hidden />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function OnboardingListRow({
  r,
  rows,
  index,
  onOpen,
  onOverview,
  onEmail,
}: {
  r: OnboardingRow;
  rows: OnboardingRow[];
  index: number;
  onOpen: (row: OnboardingRow) => void;
  onOverview: (row: OnboardingRow) => void;
  onEmail: (postId: string) => void;
}) {
  const onboarded = isOnboarded(r);
  const overdue = isOverdue(r);
  const showMissingEmailAlert =
    onboarded && !r.collab_email_sent_at && !r.collab_email_skipped;
  const commercial =
    r._collabCommercialTotal ?? r.commercial_amount ?? undefined;

  return (
    <article
      className="campaign-list-row stage-campaign-row"
      style={stageStyle(onboardingTone(r), onboardingProgress(r), index)}
    >
      <div className="stage-campaign-identity">
        <Avatar
          src={r.creator?.profile_pic}
          username={r.creator?.username}
          name={r.creator?.inf_name}
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
            <PriorCollabChip r={r} />
          </div>
          <h3>{r.creator?.inf_name ?? r.creator?.username ?? "—"}</h3>
          <p>
            @{r.creator?.username ?? "—"} · {r.post_id_short ?? r.post_id} ·{" "}
            {collabIdLabel(r)}
            {attributionLabel(r) && <> · {attributionLabel(r)}</>}
            {ageLabel(r) && <> · {ageLabel(r)}</>}
          </p>
        </div>
      </div>

      <div className="campaign-list-row__allocation stage-campaign-signal">
        <div>
          <span>Stage Progress</span>
          <strong>{onboardingProgress(r)}%</strong>
        </div>
        <span className="campaign-card__progress-track" aria-hidden>
          <span />
        </span>
        <div className="campaign-list-row__reachouts">
          <span>
            <PackageCheck size={12} aria-hidden />
            {collabDeliverableBreakdown(r, rows)}
          </span>
          <strong>{r._collabDeliverableCount ?? 1}</strong>
        </div>
      </div>

      <dl className="campaign-list-row__stats">
        <div>
          <dt>Followers</dt>
          <dd>{formatFollowers(r.creator?.followers)}</dd>
        </div>
        <div>
          <dt>Commercials</dt>
          <dd>{commercial != null ? formatRupees(Number(commercial)) : "—"}</dd>
        </div>
        <div>
          <dt>Collab</dt>
          <dd>{r.collab_type ?? "—"}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          {/* dd default CSS is nowrap+ellipsis — that clipped the pill. */}
          <dd className="!whitespace-normal !overflow-visible">
            <span className="block tabular">
              {formatDate(r.est_delivery) ?? "—"}
            </span>
            {overdue && (
              <span
                className="overdue-pill overdue-pill--stack"
                title="Estimated delivery date has passed and this post is not marked Posted yet."
              >
                <AlertTriangle size={8} aria-hidden />
                Overdue
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="campaign-list-row__actions">
        {onboarded ? (
          <>
            {showMissingEmailAlert && (
              <button
                type="button"
                className="campaign-list-action campaign-list-action--danger"
                onClick={() => onEmail(findRepresentativePostId(r, rows))}
              >
                <Send size={13} aria-hidden />
                Email
              </button>
            )}
            {r.order_id && (
              <a
                className="campaign-list-action campaign-list-action--shopify"
                href={
                  shopifyOrderAdminUrl(r.order_id, r._shopifyInternalId) ??
                  undefined
                }
                target="_blank"
                rel="noopener noreferrer"
                title={`Open order ${r.order_id} in Shopify admin`}
              >
                <ExternalLink size={13} aria-hidden />
                View Order
              </a>
            )}
            <button
              type="button"
              className="campaign-list-action campaign-list-action--brief"
              onClick={() => onOverview(r)}
            >
              <Eye size={13} aria-hidden />
              Overview
            </button>
          </>
        ) : (
          <button
            type="button"
            className="campaign-list-action campaign-list-action--brief"
            onClick={() => onOpen(r)}
          >
            <Send size={13} aria-hidden />
            Submit
          </button>
        )}
      </div>
    </article>
  );
}

function ObCard({
  r,
  rows,
  onOpen,
  onOverview,
  onEmail,
}: {
  r: OnboardingRow;
  rows: OnboardingRow[];
  onOpen: (row: OnboardingRow) => void;
  onOverview: (row: OnboardingRow) => void;
  onEmail: (postId: string) => void;
}) {
  const onboarded = isOnboarded(r);
  const overdue = isOverdue(r);
  const overdueInfo =
    "Estimated delivery date has passed and this post is not marked Posted yet.";
  const showMissingEmailAlert =
    onboarded && !r.collab_email_sent_at && !r.collab_email_skipped;

  return (
    <div
      className={cn(
        "ob-card",
        onboarded ? "ob-card-onboarded" : "ob-card-pending",
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
        <span className="ob-card-stage-text">
          {workflowStatusLabel(r.workflow_status)}
        </span>
        {r.reachout_direction === "inbound" && (
          <span className="pill pill--info">Inbound</span>
        )}
        {r.campaign?.campaign_id && (
          <span className="campaign-chip">{r.campaign.campaign_id}</span>
        )}
        <span className="post-id tabular">{r.post_id_short ?? r.post_id}</span>
        <span
          className="campaign-chip tabular"
          title="Collab ID — groups all deliverables of this collaboration"
        >
          {collabIdLabel(r)}
        </span>
        <PriorCollabChip r={r} />
        {(r.nomenclature ?? r.content_type) && (
          <span className="pill pill--muted">
            {r.nomenclature ?? r.content_type}
          </span>
        )}
        {attributionLabel(r) && (
          <span className="pill pill--muted">{attributionLabel(r)}</span>
        )}
        {ageLabel(r) && (
          <span className="pill pill--muted">{ageLabel(r)}</span>
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
            {(r._collabCommercialTotal ?? r.commercial_amount) != null
              ? formatRupees(
                  r._collabCommercialTotal ?? (r.commercial_amount as number),
                )
              : "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Deliverables</span>
          <span className="ob-card-meta-val tabular">
            {collabDeliverableBreakdown(r, rows)}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Barter</span>
          <span className="ob-card-meta-val tabular">
            {r.barter_amount != null
              ? formatRupees(Number(r.barter_amount))
              : "—"}
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
          <span className="ob-card-meta-label">Est. Delivery</span>
          <span className="ob-card-meta-val ob-card-delivery-val tabular">
            {formatDate(r.est_delivery) ?? "—"}
            {overdue && (
              <button
                type="button"
                className="ob-card-overdue"
                aria-label={overdueInfo}
                data-tooltip={overdueInfo}
              >
                <AlertTriangle size={7} aria-hidden />
                Overdue
              </button>
            )}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Tracking</span>
          <span className="ob-card-meta-val tabular">
            {r.tracking_id ?? "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Garment Qty</span>
          <span className="ob-card-meta-val tabular">
            {r.garment_qty ?? "—"}
          </span>
        </div>
        <div className="ob-card-meta">
          <span className="ob-card-meta-label">Payment</span>
          <span className="ob-card-meta-val">{r.payment_status ?? "—"}</span>
        </div>
      </dl>

      {onboarded && !showMissingEmailAlert && (
        <div className="ob-card-email-row">
          <span className="ob-card-meta-label">Email</span>
          <EmailStatusCell r={r} rows={rows} onSend={onEmail} />
        </div>
      )}

      <div className="ob-card-actions">
        {onboarded ? (
          <>
            {showMissingEmailAlert && (
              <button
                type="button"
                className="action-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  // Email targets the collab representative; post_id is non-null
                  // on onboarded rows (this button only renders then).
                  onEmail(findRepresentativePostId(r, rows));
                }}
                aria-label="Send collab email"
              >
                <Send size={12} aria-hidden />
                Send Email
              </button>
            )}
            {r.order_id && (
              <a
                className="action-shopify"
                href={
                  shopifyOrderAdminUrl(r.order_id, r._shopifyInternalId) ??
                  undefined
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Open order ${r.order_id} in Shopify admin`}
              >
                <ExternalLink size={12} aria-hidden />
                View Order
              </a>
            )}
            <button
              type="button"
              className="action-view"
              onClick={() => onOverview(r)}
            >
              <Eye size={12} aria-hidden />
              Overview
            </button>
          </>
        ) : (
          <button
            type="button"
            className="action-primary"
            onClick={() => onOpen(r)}
          >
            <Send size={12} aria-hidden />
            Submit
          </button>
        )}
      </div>
    </div>
  );
}

function OnboardingOverviewModal({
  row,
  rows,
  onClose,
  onEmail,
}: {
  row: OnboardingRow;
  rows: OnboardingRow[];
  onClose: () => void;
  onEmail: (postId: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // The board passes a parent row in; gather its siblings so the per-deliverable
  // breakdown (the collapsed children) stays viewable here.
  const siblings = collabSiblings(row, rows).sort(
    (a, b) => Number(a.deliverable_index ?? 1) - Number(b.deliverable_index ?? 1),
  );
  const deliverableRows = siblings.length > 0 ? siblings : [row];
  const deliverableCount = countCollabDeliverables(row, rows);
  const isMulti = deliverableCount > 1;
  const canSendEmail =
    isOnboarded(row) &&
    !row.collab_email_sent_at &&
    !row.collab_email_skipped;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding">
      <div className="modal-panel modal-panel--lg modal-panel--onboarding ob-overview-modal">
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={16} aria-hidden />
            <h2 className="font-semibold">Onboarding Overview</h2>
            <span className="chip text-[10px] tabular">
              {row.post_id_short ?? row.post_id}
            </span>
            <span
              className="tabular text-[0.66rem] text-text-tertiary"
              title="Collab ID — groups all deliverables of this collaboration"
            >
              {collabIdLabel(row)}
            </span>
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
                src={row.creator?.profile_pic}
                username={row.creator?.username}
                name={row.creator?.inf_name}
                size={48}
              />
              <div className="ob-overview-identity">
                <strong>
                  {row.creator?.inf_name ?? row.creator?.username ?? "—"}
                </strong>
                <span>@{row.creator?.username ?? "—"}</span>
              </div>
              <WorkflowStatusPill status={row.workflow_status} />
            </div>
            <div className="ob-overview-pills">
              <DeliverablesChip r={row} rows={rows} />
              <span
                className="campaign-chip tabular"
                title="Collab ID — groups all deliverables of this collaboration"
              >
                {collabIdLabel(row)}
              </span>
              <span className="campaign-chip">
                {row.campaign?.campaign_id ?? "—"}
              </span>
              {row.nomenclature && (
                <span className="pill pill--muted" title="Nomenclature">
                  {row.nomenclature}
                </span>
              )}
              {row.content_type && (
                <span className="pill pill--info" title="Content Type">
                  {row.content_type}
                </span>
              )}
            </div>
          </section>

          <section className="ob-overview-grid">
            <OverviewItem label="Post ID" value={row.post_id} mono />
            <OverviewItem label="Collab ID" value={collabIdLabel(row)} mono />
            {row.logged_by && (
              <OverviewItem label="Reached Out By" value={row.logged_by} />
            )}
            {isOnboarded(row) && row.onboarded_by && (
              <OverviewItem label="Onboarded By" value={row.onboarded_by} />
            )}
            <OverviewItem
              label="Deliverables"
              value={formatDeliverableCount(deliverableCount)}
            />
            <OverviewItem label="Collab" value={row.collab_type ?? "—"} />
            <OverviewItem
              label="Commercials"
              value={
                (row._collabCommercialTotal ?? row.commercial_amount) != null
                  ? formatRupees(
                      row._collabCommercialTotal ??
                        (row.commercial_amount as number),
                    )
                  : "—"
              }
              mono
            />
            <OverviewItem
              label="Barter Amount"
              value={
                row.barter_amount != null
                  ? formatRupees(Number(row.barter_amount))
                  : "—"
              }
              mono
            />
            <OverviewItem
              label="Deliverable Mix"
              value={collabDeliverableBreakdown(row, rows)}
              mono
            />
            <OverviewItem
              label="Order ID"
              value={
                row.order_id ? (
                  <a
                    className="ob-order-link"
                    href={
                      shopifyOrderAdminUrl(
                        row.order_id,
                        row._shopifyInternalId,
                      ) ?? undefined
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open order ${row.order_id} in Shopify admin`}
                  >
                    {row.order_id}
                    <ExternalLink size={11} aria-hidden />
                  </a>
                ) : (
                  "—"
                )
              }
              mono
            />
            <OverviewItem
              label="Order Status"
              value={row.order_status ?? "—"}
            />
            <OverviewItem
              label="Tracking ID"
              value={row.tracking_id ?? "—"}
              mono
            />
            <OverviewItem
              label="Garment Qty"
              value={row.garment_qty ?? "—"}
              mono
            />
            <OverviewItem
              label="Garments Sent"
              value={row.garments_sent ?? "—"}
            />
            <OverviewItem
              label="Est. Delivery"
              value={
                <>
                  {formatDate(row.est_delivery) ?? "—"}
                  {isOverdue(row) && (
                    <span
                      className="overdue-pill overdue-pill--inline"
                      title="Estimated delivery date has passed and this post is not marked Posted yet."
                    >
                      <AlertTriangle size={8} aria-hidden />
                      Overdue
                    </span>
                  )}
                </>
              }
              mono
            />
            <OverviewItem
              label="Payment Status"
              value={row.payment_status ?? "—"}
            />
            <OverviewItem label="Email" value={row.email ?? "—"} />
            <OverviewItem
              label="Nomenclature"
              value={row.nomenclature ?? "—"}
            />
            <OverviewItem
              label="Content Type"
              value={row.content_type ?? "—"}
            />
          </section>

          {isMulti && (
            <section className="mt-3">
              <div className="mb-2 flex items-center gap-2 text-[0.78rem] text-text-secondary">
                <Layers size={13} aria-hidden />
                <strong className="text-text-primary">
                  Deliverables in this collab
                </strong>
                <span className="pill pill--parent">
                  {formatDeliverableCount(deliverableCount)}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {deliverableRows.map((d) => {
                  const isPrimary = isCollabRepresentative(d, rows);
                  return (
                    <li
                      key={d.post_id}
                      className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-bg-surface px-2.5 py-1.5"
                    >
                      <span className="tabular text-[0.7rem] font-semibold text-text-tertiary">
                        #{Number(d.deliverable_index ?? 1)}
                      </span>
                      <span className="text-[0.78rem] text-text-primary capitalize">
                        {d.deliverable_type ?? deliverableBreakdown(d)}
                      </span>
                      <span className="post-id tabular">
                        {d.post_id_short ?? d.post_id}
                      </span>
                      <span
                        className="tabular text-[0.66rem] text-text-tertiary"
                        title="Collab ID — groups all deliverables of this collaboration"
                      >
                        {collabIdLabel(d)}
                      </span>
                      {isPrimary ? (
                        <span
                          className="pill pill--muted"
                          title="Payment + collab email live on this row"
                        >
                          Primary
                        </span>
                      ) : (
                        <span
                          className="pill pill--linked"
                          title="Payment + email handled on the primary row"
                        >
                          <LinkIcon size={9} aria-hidden />
                          Linked
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="ob-overview-note mt-2">
                One collab, one payment. Each deliverable is posted individually
                in the Posting stage; payment + the collab email stay on the
                primary row.
              </p>
            </section>
          )}
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {row.order_id && (
            <a
              className="btn btn-ghost ob-overview-shopify"
              href={
                shopifyOrderAdminUrl(row.order_id, row._shopifyInternalId) ??
                undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              title={`Open order ${row.order_id} in Shopify admin`}
            >
              <ExternalLink size={14} aria-hidden />
              View Order
            </a>
          )}
          {isOnboarded(row) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditOpen(true)}
              title="Edit this onboarding (held for admin approval)"
            >
              <Pencil size={14} aria-hidden />
              Edit Onboarding
            </button>
          )}
          {canSendEmail && (
            <button
              type="button"
              className="btn-primary-cta"
              onClick={() => {
                // Email targets the collab representative; post_id is non-null
                // here (canSendEmail ⇒ onboarded).
                onEmail(findRepresentativePostId(row, rows));
                onClose();
              }}
            >
              <Mail size={14} aria-hidden />
              Send Collab Email
            </button>
          )}
        </footer>
      </div>
      {editOpen && (
        <OnboardingEditModal
          collabId={collabIdLabel(row)}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}

function OverviewItem({
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
