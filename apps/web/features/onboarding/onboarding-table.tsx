"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Eye,
  Grid3X3,
  Inbox,
  Layers,
  Link as LinkIcon,
  List as ListIcon,
  Mail,
  Send,
  X,
} from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Avatar, WorkflowStatusPill } from "@/components/ui";
import {
  formatDate,
  formatFollowers,
  formatRupees,
  workflowStatusLabel,
} from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  DeliverablesChip,
  EmailStatusCell,
  collabCommercialTotal,
  collabDeliverableBreakdown,
  collabIdLabel,
  collabSiblings,
  countCollabDeliverables,
  deliverableBreakdown,
  formatDeliverableCount,
  isCollabRepresentative,
  isOnboarded,
  isOverdue,
  onboardingColumns,
} from "./columns";
import { OrderCreationModal } from "./order-form";
import { CollabEmailModal, type CollabEmailDraft } from "./collab-email-modal";
import type { OnboardingRow } from "./types";

export interface OnboardingTableProps {
  rows: OnboardingRow[];
  initialView?: "list" | "cards";
}

export function OnboardingTable({
  rows,
  initialView = "list",
}: OnboardingTableProps) {
  const [orderRow, setOrderRow] = useState<OnboardingRow | null>(null);
  const [overviewRow, setOverviewRow] = useState<OnboardingRow | null>(null);
  const [collabEmail, setCollabEmail] = useState<{
    postId: string;
    draft?: CollabEmailDraft;
  } | null>(null);
  const [view, setView] = useState<"list" | "cards">(initialView);

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

  const columnsWithActions = useMemo(
    () => [
      ...onboardingColumns.filter((column) => column.id !== "email"),
      {
        id: "email",
        header: "Email",
        cell: ({
          row,
          table,
        }: {
          row: { original: OnboardingRow };
          table: { options: { data: unknown[] } };
        }) => (
          <EmailStatusCell
            r={row.original}
            rows={table.options.data as OnboardingRow[]}
            onSend={(postId) => setCollabEmail({ postId })}
          />
        ),
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }: { row: { original: OnboardingRow } }) => {
          const r = row.original;
          const onboarded = isOnboarded(r);
          if (onboarded) {
            return (
              <span className="ob-row-action">
                <button
                  type="button"
                  className="action-btn action-btn--view"
                  onClick={() => setOverviewRow(r)}
                  aria-label="View overview"
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
              onClick={() => setOrderRow(r)}
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
      {orderRow && (
        <OrderCreationModal
          open={!!orderRow}
          onClose={() => setOrderRow(null)}
          postId={orderRow.post_id}
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
          <DataTable<OnboardingRow>
            data={parentRows}
            columns={columnsWithActions}
            emptyTitle="No onboarding rows match these filters"
            emptyDescription="Try clearing filters or widening the reach-out date range."
            mobileCard={(r) => (
              <ObCard
                r={r}
                rows={rows}
                onOpen={setOrderRow}
                onOverview={setOverviewRow}
                onEmail={(postId) => setCollabEmail({ postId })}
              />
            )}
          />
        </div>
      ) : parentRows.length === 0 ? (
        <div className="glass-card text-center py-10 text-text-tertiary">
          <Inbox size={28} className="mx-auto mb-2" />
          <p className="font-medium text-text-primary">
            No onboarding rows match these filters
          </p>
          <p className="text-sm">
            Try clearing filters or widening the reach-out date range.
          </p>
        </div>
      ) : (
        <div className="ob-card-grid">
          {parentRows.map((r) => (
            <ObCard
              key={r.post_id}
              r={r}
              rows={rows}
              onOpen={setOrderRow}
              onOverview={setOverviewRow}
              onEmail={(postId) => setCollabEmail({ postId })}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Legacy-parity card (renderObCards). */
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
  // The board renders one card per collab (parent only). Count the whole
  // collab's deliverables so a multi-deliverable collab reads as one entity.
  const deliverableCount = countCollabDeliverables(r, rows);
  const hasMultiple = deliverableCount > 1;
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
        <DeliverablesChip r={r} rows={rows} />
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
            {formatDeliverableCount(deliverableCount)}
            <span className="ob-card-meta-sub">
              {" · "}
              {collabDeliverableBreakdown(r, rows)}
            </span>
            {hasMultiple && onboarded && (
              <button
                type="button"
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-border bg-bg-surface px-2 py-0.5 text-[0.62rem] font-semibold text-text-secondary transition-colors hover:bg-bg-ecru"
                onClick={(e) => {
                  e.stopPropagation();
                  onOverview(r);
                }}
                title="See each deliverable in this collab"
              >
                <Layers size={9} aria-hidden />
                View {deliverableCount}
              </button>
            )}
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
                  onEmail(r.post_id);
                }}
                aria-label="Send collab email"
              >
                <Send size={12} aria-hidden />
                Send Email
              </button>
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
            <OverviewItem label="Order ID" value={row.order_id ?? "—"} mono />
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
              value={formatDate(row.est_delivery) ?? "—"}
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
          {canSendEmail && (
            <button
              type="button"
              className="btn-primary-cta"
              onClick={() => {
                onEmail(row.post_id);
                onClose();
              }}
            >
              <Mail size={14} aria-hidden />
              Send Collab Email
            </button>
          )}
        </footer>
      </div>
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
