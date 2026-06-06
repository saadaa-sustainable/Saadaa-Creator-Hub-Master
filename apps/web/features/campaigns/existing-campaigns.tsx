"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ExternalLink,
  Eye,
  FileText,
  IndianRupee,
  Loader2,
  Pencil,
  Plus,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatRupees } from "@/lib/formatters";
import type { CampaignListRow } from "./queries";
import { fetchCampaignForEdit } from "./actions";
import { CampaignCreateForm } from "./create-form";
import type { CampaignCreateInput } from "./schema";

interface ExistingCampaignsProps {
  campaigns: CampaignListRow[];
  showCreateAction?: boolean;
}

interface EditTarget {
  campaignId: string;
  initial: CampaignCreateInput;
}

function normalizeNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function statusLabel(status: string | null | undefined): string {
  return status ? status.replace(/_/g, " ") : "active";
}

export function ExistingCampaigns({
  campaigns,
  showCreateAction = false,
}: ExistingCampaignsProps) {
  const [selected, setSelected] = useState<CampaignListRow | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [, startLoadEdit] = useTransition();

  const openEdit = (campaignId: string) => {
    setLoadingEditId(campaignId);
    startLoadEdit(async () => {
      const res = await fetchCampaignForEdit(campaignId);
      setLoadingEditId(null);
      if (!res) {
        toast.error(`Could not load ${campaignId} for editing.`);
        return;
      }
      setSelected(null);
      setEditTarget(res);
    });
  };
  const stats = useMemo(() => {
    const totalBudget = campaigns.reduce(
      (sum, c) => sum + (normalizeNumber(c.total_budget) ?? 0),
      0,
    );
    const totalTarget = campaigns.reduce(
      (sum, c) => sum + (normalizeNumber(c.no_of_creators) ?? 0),
      0,
    );
    return { totalBudget, totalTarget };
  }, [campaigns]);
  const { totalBudget, totalTarget } = stats;

  if (campaigns.length === 0) {
    return (
      <div className="campaign-empty-state">
        <FileText size={28} />
        <strong>No campaigns yet</strong>
        <span>
          Create the first campaign to unlock Reach Out and Onboarding filters.
        </span>
        {showCreateAction && (
          <Link href="/campaigns/new" className="btn btn-primary">
            <Plus size={14} />
            New Campaign
          </Link>
        )}
      </div>
    );
  }

  return (
    <section className="existing-campaigns">
      <div className="campaign-list-metrics" aria-label="Campaign summary">
        <div>
          <span>Campaigns</span>
          <strong>{campaigns.length}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{totalTarget || "—"}</strong>
        </div>
        <div>
          <span>Budget</span>
          <strong>{formatRupees(totalBudget)}</strong>
        </div>
      </div>

      <div className="campaign-card-grid">
        {campaigns.map((campaign) => {
          const target = normalizeNumber(campaign.no_of_creators);
          const budgetRows = campaign.budget_rows ?? [];
          const totalWithGarments = budgetRows.reduce(
            (sum, row) => sum + (normalizeNumber(row.total_with_garments) ?? 0),
            0,
          );

          return (
            <article
              key={campaign.campaign_id}
              className="campaign-card"
              role="button"
              tabIndex={0}
              aria-label={`View details for ${campaign.campaign_id}`}
              onClick={() => setSelected(campaign)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(campaign);
                }
              }}
            >
              <header className="campaign-card__head">
                <div className="min-w-0">
                  <div className="campaign-card__id-row">
                    <strong>{campaign.campaign_id}</strong>
                    <span className="campaign-status-pill">
                      {statusLabel(campaign.status)}
                    </span>
                  </div>
                  <h3>{campaign.campaign_name ?? "Untitled campaign"}</h3>
                </div>
                <div className="campaign-card__budget">
                  <span>Budget</span>
                  <strong>{formatRupees(campaign.total_budget)}</strong>
                </div>
              </header>

              {campaign.key_message && (
                <p className="campaign-card__message">{campaign.key_message}</p>
              )}

              <dl className="campaign-card__facts">
                <div>
                  <dt>
                    <Target size={12} />
                    Target
                  </dt>
                  <dd>{target ?? "—"}</dd>
                </div>
                <div>
                  <dt>
                    <CalendarDays size={12} />
                    Created
                  </dt>
                  <dd>{formatDate(campaign.created_at)}</dd>
                </div>
                <div>
                  <dt>
                    <IndianRupee size={12} />
                    With garments
                  </dt>
                  <dd>
                    {totalWithGarments ? formatRupees(totalWithGarments) : "—"}
                  </dd>
                </div>
              </dl>

              <footer className="campaign-card__actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(campaign);
                  }}
                >
                  <Eye size={12} />
                  View Details
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  disabled={loadingEditId === campaign.campaign_id}
                  onClick={(event) => {
                    event.stopPropagation();
                    openEdit(campaign.campaign_id);
                  }}
                >
                  {loadingEditId === campaign.campaign_id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Pencil size={12} />
                  )}
                  Edit
                </button>
                {campaign.brief_link && (
                  <a
                    href={campaign.brief_link}
                    target="_blank"
                    rel="noopener"
                    className="campaign-brief-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Brief <ExternalLink size={11} />
                  </a>
                )}
              </footer>
            </article>
          );
        })}
      </div>

      {selected && (
        <CampaignDetailsModal
          campaign={selected}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected.campaign_id)}
          editLoading={loadingEditId === selected.campaign_id}
        />
      )}

      {editTarget && (
        <CampaignEditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </section>
  );
}

function CampaignEditModal({
  target,
  onClose,
}: {
  target: EditTarget;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel campaign-edit-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <strong>{target.campaignId}</strong>
            </div>
            <h2>Edit campaign</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close edit campaign"
          >
            <X size={14} />
          </button>
        </header>
        <div className="modal-body campaign-edit-body">
          <CampaignCreateForm
            mode="edit"
            campaignId={target.campaignId}
            initial={target.initial}
            onEdited={onClose}
          />
        </div>
      </div>
    </div>
  );
}

function CampaignDetailsModal({
  campaign,
  onClose,
  onEdit,
  editLoading,
}: {
  campaign: CampaignListRow;
  onClose: () => void;
  onEdit: () => void;
  editLoading: boolean;
}) {
  const target = normalizeNumber(campaign.no_of_creators);
  const budgetRows = campaign.budget_rows ?? [];
  const totalWithGarments = budgetRows.reduce(
    (sum, row) => sum + (normalizeNumber(row.total_with_garments) ?? 0),
    0,
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel campaign-detail-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <strong>{campaign.campaign_id}</strong>
              <span className="campaign-status-pill">
                {statusLabel(campaign.status)}
              </span>
            </div>
            <h2>{campaign.campaign_name ?? "Untitled campaign"}</h2>
          </div>
          <div className="modal-head__actions">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={onEdit}
              disabled={editLoading}
            >
              {editLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Pencil size={12} />
              )}
              Edit
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close campaign details"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="modal-body campaign-detail-body">
          <dl className="campaign-detail-grid">
            <div>
              <dt>Campaign ID</dt>
              <dd>{campaign.campaign_id}</dd>
            </div>
            <div>
              <dt>Target creators</dt>
              <dd>{target ?? "—"}</dd>
            </div>
            <div>
              <dt>Comp budget</dt>
              <dd>{formatRupees(campaign.total_budget)}</dd>
            </div>
            <div>
              <dt>With garments</dt>
              <dd>
                {totalWithGarments ? formatRupees(totalWithGarments) : "—"}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(campaign.created_at)}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>
                {formatDate(campaign.start_date)} to{" "}
                {formatDate(campaign.end_date)}
              </dd>
            </div>
          </dl>

          {campaign.key_message && (
            <section className="campaign-detail-section">
              <h3>Key Message</h3>
              <p>{campaign.key_message}</p>
            </section>
          )}

          <section className="campaign-detail-section">
            <h3>Links</h3>
            <div className="campaign-link-row">
              {campaign.brief_link ? (
                <a href={campaign.brief_link} target="_blank" rel="noopener">
                  Creator brief <ExternalLink size={12} />
                </a>
              ) : (
                <span>No creator brief</span>
              )}
              {campaign.internal_brief_link ? (
                <a
                  href={campaign.internal_brief_link}
                  target="_blank"
                  rel="noopener"
                >
                  Internal brief <ExternalLink size={12} />
                </a>
              ) : (
                <span>No internal brief</span>
              )}
            </div>
          </section>

          <section className="campaign-detail-section">
            <h3>Budget Lines</h3>
            {budgetRows.length === 0 ? (
              <p>No budget lines found.</p>
            ) : (
              <div className="campaign-budget-lines">
                {budgetRows.map((row) => (
                  <div key={row.id} className="campaign-budget-line">
                    <div>
                      <strong>{row.tier ?? "Tier"}</strong>
                      <span>
                        {row.collab_type ?? "Collab"} /{" "}
                        {row.campaign_name ??
                          campaign.campaign_name ??
                          "Segment"}
                      </span>
                      <em>{row.month_label ?? "No month label"}</em>
                    </div>
                    <dl>
                      <div>
                        <dt>No.</dt>
                        <dd>{row.num_influencers ?? 0}</dd>
                      </div>
                      <div>
                        <dt>Avg comp</dt>
                        <dd>{formatRupees(row.avg_comp)}</dd>
                      </div>
                      <div>
                        <dt>Comp total</dt>
                        <dd>{formatRupees(row.total_cost)}</dd>
                      </div>
                      <div>
                        <dt>Min G</dt>
                        <dd>{row.min_garments ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Max G</dt>
                        <dd>{row.max_garments ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Est garment</dt>
                        <dd>{formatRupees(row.est_garment_cost)}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>{formatRupees(row.total_with_garments)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
