"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarCheck,
  Download,
  ExternalLink,
  Eye,
  Film,
  Layers,
  Link as LinkIcon,
  ShieldCheck,
  X,
} from "lucide-react";
import { PartnershipKeyEdit, WorkflowStatusPill } from "@/components/ui";
import { InstagramPreviewCard } from "@/components/ui/instagram-preview";
import { formatDate, formatRupees } from "@/lib/formatters";
import { isPastDue } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import {
  collabDeliverableCount,
  collabIdLabel,
  formatDeliverables,
} from "./columns";
import type { PostingRow } from "./types";

/**
 * Posting Overview modal — read-only summary of all submitted posting data
 * for a Posted row. Mirrors `OnboardingOverviewModal` shell exactly.
 */
export function PostingOverviewModal({
  row,
  rows,
  onClose,
}: {
  row: PostingRow;
  rows: PostingRow[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!mounted) return null;

  const collabId = collabIdLabel(row);
  const collabCount = collabDeliverableCount(row, rows);

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding">
      <div className="modal-panel modal-panel--lg modal-panel--onboarding ob-overview-modal">
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={16} aria-hidden />
            <h2 className="font-semibold">Posting Overview</h2>
            <span className="chip text-[10px] tabular">
              {row.post_id_short ?? row.post_id}
            </span>
            <span className="text-[0.7rem] text-text-tertiary tabular">
              · {collabId}
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
              <InstagramPreviewCard
                link={row.post_link}
                pic={row.creator?.profile_pic}
                username={row.creator?.username}
                size={56}
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
              <span
                className="campaign-chip tabular"
                title={
                  collabCount > 1
                    ? `${collabCount} deliverables share this Collab ID`
                    : "Collab ID — groups all deliverables of this collaboration"
                }
              >
                {collabCount > 1 && <Layers size={10} aria-hidden />}
                {collabId}
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
              {row.ads_usage_rights && (
                <span className="pill pill--info" title="Ads Usage Rights">
                  <ShieldCheck size={10} aria-hidden />
                  Ads: {row.ads_usage_rights}
                </span>
              )}
            </div>
          </section>

          <section className="ob-overview-grid">
            <OverviewItem
              label="Post ID"
              value={
                <span className="inline-flex items-baseline gap-1">
                  {row.post_id}
                  <span className="text-[0.7rem] text-text-tertiary tabular">
                    · {collabId}
                  </span>
                </span>
              }
              mono
            />
            <OverviewItem label="Collab ID" value={collabId} mono />
            <OverviewItem
              label="Post Date"
              value={
                <span className="inline-flex items-center gap-1">
                  <CalendarCheck size={10} aria-hidden />
                  {formatDate(row.post_date) ?? "—"}
                </span>
              }
              mono
            />
            <OverviewItem
              label="Onboarded"
              value={formatDate(row.onboard_date) ?? "—"}
              mono
            />
            <OverviewItem
              label="Est. Delivery"
              value={
                <>
                  {formatDate(row.est_delivery) ?? "—"}
                  {!String(row.workflow_status ?? "")
                    .toLowerCase()
                    .includes("posted") &&
                    !String(row.workflow_status ?? "")
                      .toLowerCase()
                      .includes("delivered") &&
                    isPastDue(row.est_delivery, row.reach_out_date) && (
                      <span
                        className="ob-card-overdue"
                        title="Estimated delivery date has passed and this deliverable is not posted yet."
                      >
                        <AlertTriangle size={7} aria-hidden />
                        Overdue
                      </span>
                    )}
                </>
              }
              mono
            />
            {row.onboarded_by && (
              <OverviewItem label="Onboarded By" value={row.onboarded_by} />
            )}
            {row.posted_by && (
              <OverviewItem label="Posted By" value={row.posted_by} />
            )}
            <OverviewItem
              label="Deliverables"
              value={formatDeliverables(row)}
              mono
            />
            <OverviewItem label="Collab" value={row.collab_type ?? "—"} />
            <OverviewItem
              label="Commercials"
              value={
                row.commercial_amount != null
                  ? formatRupees(row.commercial_amount)
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
              label="Ads Usage Rights"
              value={row.ads_usage_rights ?? "—"}
            />
            <div className="ob-overview-item">
              <span>Partnership Key</span>
              <PartnershipKeyEdit
                // Posting rows are always onboarded — post_id is non-null here.
                postId={row.post_id ?? ""}
                value={row.partnership_id}
              />
            </div>
            <OverviewItem
              label="Nomenclature"
              value={row.nomenclature ?? "—"}
            />
            <OverviewItem
              label="Content Type"
              value={row.content_type ?? "—"}
            />
          </section>

          <section className="pt-overview-links">
            <LinkRow
              icon={<LinkIcon size={12} aria-hidden />}
              label="Live Post URL"
              url={row.post_link}
            />
            <LinkRow
              icon={<Download size={12} aria-hidden />}
              label="Drive Download Link"
              url={row.download_link}
            />
            <LinkRow
              icon={<Film size={12} aria-hidden />}
              label="Raw Footage Dump"
              url={row.raw_dump}
            />
          </section>

          {collabCount > 1 && (
            <div className="ob-overview-note">
              Posting is tracked per deliverable. This deliverable belongs to
              Collab <strong>{collabId}</strong>, which has {collabCount}{" "}
              deliverables in total. Payment is raised once per Collab ID.
            </div>
          )}
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {row.post_link && (
            <a
              href={row.post_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary-cta"
            >
              <ExternalLink size={14} aria-hidden />
              <span className="hidden sm:inline">Open on </span>Instagram
            </a>
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

function LinkRow({
  icon,
  label,
  url,
}: {
  icon: ReactNode;
  label: string;
  url?: string | null;
}) {
  const hasUrl = !!url && /^https?:\/\//i.test(url);
  return (
    <div className="pt-overview-link-row">
      <div className="pt-overview-link-label">
        {icon}
        <span>{label}</span>
      </div>
      {hasUrl ? (
        <a
          href={url!}
          target="_blank"
          rel="noopener noreferrer"
          className="pt-overview-link-btn"
          title={url ?? undefined}
        >
          <ExternalLink size={11} aria-hidden />
          Open
        </a>
      ) : (
        <span
          className="pt-overview-link-na"
          aria-disabled
          title="No link provided"
        >
          NA
        </span>
      )}
    </div>
  );
}
