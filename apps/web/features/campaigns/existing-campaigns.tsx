"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  CalendarDays,
  ExternalLink,
  Eye,
  FileText,
  Hash,
  IndianRupee,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/ui/view-mode-toggle";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatRupees } from "@/lib/formatters";
import type { CampaignListRow } from "./queries";
import { closeCampaign, fetchCampaignForEdit, reopenCampaign } from "./actions";
import { CampaignCreateForm } from "./create-form";
import type { CampaignCreateInput } from "./schema";

const CAMPAIGN_CARD_ACCENTS = ["#B57514", "#3B6FD4", "#4F7C4D", "#7B4FBF"];
const CAMPAIGN_VIEW_STORAGE_KEY = "creatorhub:existing-campaigns:view";
const CAMPAIGN_VIEW_OPTIONS: ViewMode[] = ["cards", "list"];

type CampaignStatusFilter =
  | "all"
  | "active"
  | "closed"
  | "with-brief"
  | "missing-brief";

type CampaignSort =
  | "newest"
  | "oldest"
  | "budget-desc"
  | "budget-asc"
  | "target-desc";

type CampaignViewMode = Extract<ViewMode, "cards" | "list">;

const STATUS_FILTER_OPTIONS: Array<{
  value: CampaignStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All campaigns" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "with-brief", label: "With brief" },
  { value: "missing-brief", label: "Missing brief" },
];

const SORT_OPTIONS: Array<{ value: CampaignSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "budget-desc", label: "Budget high to low" },
  { value: "budget-asc", label: "Budget low to high" },
  { value: "target-desc", label: "Target high to low" },
];

interface ExistingCampaignsProps {
  campaigns: CampaignListRow[];
  showCreateAction?: boolean;
  /** Campaign Owner + Global Admin: may edit / close / reopen campaigns. */
  canManage?: boolean;
}

function isClosedStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "closed";
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

function campaignWindowLabel(campaign: CampaignListRow): string {
  if (campaign.start_date && campaign.end_date) {
    return `${formatDate(campaign.start_date)} - ${formatDate(
      campaign.end_date,
    )}`;
  }
  if (campaign.start_date) return `From ${formatDate(campaign.start_date)}`;
  if (campaign.end_date) return `Until ${formatDate(campaign.end_date)}`;
  return "No campaign window";
}

function campaignAccent(campaign: CampaignListRow, index = 0): string {
  if (isClosedStatus(campaign.status)) return "#6E695E";
  const seed = normalizeNumber(campaign.campaign_num) ?? index;
  return CAMPAIGN_CARD_ACCENTS[Math.abs(seed) % CAMPAIGN_CARD_ACCENTS.length];
}

function dateTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function campaignSearchText(campaign: CampaignListRow): string {
  const budgetText = (campaign.budget_rows ?? [])
    .flatMap((row) => [
      row.tier,
      row.collab_type,
      row.campaign_name,
      row.month_label,
    ])
    .filter(Boolean)
    .join(" ");

  return [
    campaign.campaign_id,
    campaign.campaign_name,
    campaign.key_message,
    statusLabel(campaign.status),
    campaignWindowLabel(campaign),
    budgetText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ExistingCampaigns({
  campaigns,
  showCreateAction = false,
  canManage = false,
}: ExistingCampaignsProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<CampaignListRow | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [campaignIdFilter, setCampaignIdFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [sortBy, setSortBy] = useState<CampaignSort>("newest");
  const [viewMode, setViewMode] = useState<CampaignViewMode>("cards");
  const [, startLoadEdit] = useTransition();
  const [, startStatus] = useTransition();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CAMPAIGN_VIEW_STORAGE_KEY);
      if (stored === "cards" || stored === "list") {
        setViewMode(stored);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const changeStatus = (campaignId: string, action: "close" | "reopen") => {
    setStatusBusyId(campaignId);
    startStatus(async () => {
      const res =
        action === "close"
          ? await closeCampaign(campaignId)
          : await reopenCampaign(campaignId);
      setStatusBusyId(null);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update campaign status.");
        return;
      }
      toast.success(
        action === "close" ? "Campaign closed." : "Campaign reopened.",
      );
      setSelected(null);
      router.refresh();
    });
  };

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

  const campaignIds = useMemo(
    () =>
      Array.from(new Set(campaigns.map((campaign) => campaign.campaign_id)))
        .filter(Boolean)
        .sort((a, b) => {
          const aNum =
            normalizeNumber(
              campaigns.find((c) => c.campaign_id === a)?.campaign_num,
            ) ?? 0;
          const bNum =
            normalizeNumber(
              campaigns.find((c) => c.campaign_id === b)?.campaign_num,
            ) ?? 0;
          return bNum - aNum || b.localeCompare(a);
        }),
    [campaigns],
  );

  const campaignIdOptions = useMemo(
    () => [
      {
        value: "all",
        label: "All campaign IDs",
        hint: `${campaigns.length} campaigns`,
      },
      ...campaignIds.map((campaignId) => {
        const campaign = campaigns.find((c) => c.campaign_id === campaignId);
        return {
          value: campaignId,
          label: campaignId,
          hint: campaign?.campaign_name ?? undefined,
        };
      }),
    ],
    [campaignIds, campaigns],
  );

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const next = campaigns.filter((campaign) => {
      const isClosed = isClosedStatus(campaign.status);
      const hasBrief = Boolean(campaign.brief_link);
      const idMatch =
        campaignIdFilter === "all" || campaign.campaign_id === campaignIdFilter;
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "active" && !isClosed) ||
        (statusFilter === "closed" && isClosed) ||
        (statusFilter === "with-brief" && hasBrief) ||
        (statusFilter === "missing-brief" && !hasBrief);

      if (!idMatch) return false;
      if (!statusMatch) return false;
      if (!normalizedQuery) return true;
      return campaignSearchText(campaign).includes(normalizedQuery);
    });

    return next.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return (
            dateTime(a.created_at) - dateTime(b.created_at) ||
            (normalizeNumber(a.campaign_num) ?? 0) -
              (normalizeNumber(b.campaign_num) ?? 0)
          );
        case "budget-desc":
          return (
            (normalizeNumber(b.total_budget) ?? 0) -
            (normalizeNumber(a.total_budget) ?? 0)
          );
        case "budget-asc":
          return (
            (normalizeNumber(a.total_budget) ?? 0) -
            (normalizeNumber(b.total_budget) ?? 0)
          );
        case "target-desc":
          return (
            (normalizeNumber(b.no_of_creators) ?? 0) -
            (normalizeNumber(a.no_of_creators) ?? 0)
          );
        case "newest":
        default:
          return (
            (normalizeNumber(b.campaign_num) ?? 0) -
              (normalizeNumber(a.campaign_num) ?? 0) ||
            dateTime(b.created_at) - dateTime(a.created_at)
          );
      }
    });
  }, [campaignIdFilter, campaigns, query, sortBy, statusFilter]);

  const clearFilters = () => {
    setQuery("");
    setCampaignIdFilter("all");
    setStatusFilter("all");
    setSortBy("newest");
  };

  const stats = useMemo(() => {
    const totalBudget = filteredCampaigns.reduce(
      (sum, c) => sum + (normalizeNumber(c.total_budget) ?? 0),
      0,
    );
    const totalTarget = filteredCampaigns.reduce(
      (sum, c) => sum + (normalizeNumber(c.no_of_creators) ?? 0),
      0,
    );
    return { totalBudget, totalTarget };
  }, [filteredCampaigns]);
  const { totalBudget, totalTarget } = stats;
  const hasFilters =
    query.trim().length > 0 ||
    campaignIdFilter !== "all" ||
    statusFilter !== "all" ||
    sortBy !== "newest";

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
          <strong>{filteredCampaigns.length}</strong>
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

      <div className="campaign-list-toolbar">
        <label className="campaign-search-field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, message, brief"
            aria-label="Search existing campaigns"
          />
        </label>

        <div className="campaign-filter-controls">
          <div className="campaign-filter-select campaign-filter-select--id campaign-filter-select--combo">
            <Hash size={14} aria-hidden="true" />
            <SearchableSelect
              value={campaignIdFilter}
              onChange={setCampaignIdFilter}
              options={campaignIdOptions}
              placeholder="All campaign IDs"
              searchPlaceholder="Search campaign ID..."
              className="campaign-filter-combobox"
            />
          </div>

          <div className="campaign-filter-select campaign-filter-select--combo">
            <SlidersHorizontal size={14} aria-hidden="true" />
            <SearchableSelect
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as CampaignStatusFilter)
              }
              options={STATUS_FILTER_OPTIONS}
              placeholder="All campaigns"
              searchPlaceholder="Search filters..."
              className="campaign-filter-combobox"
            />
          </div>

          <div className="campaign-filter-select campaign-filter-select--combo">
            <ArrowDownUp size={14} aria-hidden="true" />
            <SearchableSelect
              value={sortBy}
              onChange={(value) => setSortBy(value as CampaignSort)}
              options={SORT_OPTIONS}
              placeholder="Newest first"
              searchPlaceholder="Search sort..."
              className="campaign-filter-combobox"
            />
          </div>
        </div>

        <div className="campaign-list-toolbar__meta">
          <span>
            Showing {filteredCampaigns.length} of {campaigns.length}
          </span>
          <ViewModeToggle
            storageKey={CAMPAIGN_VIEW_STORAGE_KEY}
            options={CAMPAIGN_VIEW_OPTIONS}
            defaultMode={viewMode}
            onChange={(mode) => setViewMode(mode as CampaignViewMode)}
          />
          {hasFilters && (
            <button type="button" onClick={clearFilters}>
              Reset
            </button>
          )}
        </div>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="campaign-filter-empty">
          <Search size={24} />
          <strong>No campaigns match</strong>
          <span>Try another search term or filter.</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearFilters}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div
          className={
            viewMode === "list" ? "campaign-list-view" : "campaign-card-grid"
          }
        >
          {filteredCampaigns.map((campaign, index) => {
            const target = normalizeNumber(campaign.no_of_creators);
            const isClosed = isClosedStatus(campaign.status);
            const budgetRows = campaign.budget_rows ?? [];
            const totalWithGarments = budgetRows.reduce(
              (sum, row) =>
                sum + (normalizeNumber(row.total_with_garments) ?? 0),
              0,
            );
            // Creator cap = Σ budget num_influencers; used = distinct active creators.
            const creatorCap = budgetRows.reduce(
              (sum, row) => sum + (normalizeNumber(row.num_influencers) ?? 0),
              0,
            );
            const creatorsUsed = campaign.creators_used ?? 0;
            const allocationTarget = creatorCap || target || 0;
            const progressPct =
              allocationTarget > 0
                ? Math.min(
                    100,
                    Math.round((creatorsUsed / allocationTarget) * 100),
                  )
                : 0;
            const accent = campaignAccent(campaign, index);

            if (viewMode === "list") {
              return (
                <article
                  key={campaign.campaign_id}
                  className="campaign-list-row"
                  data-status={isClosed ? "closed" : "active"}
                  style={
                    {
                      "--campaign-accent": accent,
                      "--campaign-progress": `${progressPct}%`,
                      "--campaign-card-index": String(index),
                    } as CSSProperties
                  }
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
                  <div className="campaign-list-row__main">
                    <div className="campaign-card__id-row">
                      <strong className="campaign-card__id">
                        {campaign.campaign_id}
                      </strong>
                      <span className="campaign-status-pill">
                        {statusLabel(campaign.status)}
                      </span>
                    </div>
                    <h3>{campaign.campaign_name ?? "Untitled campaign"}</h3>
                    {campaign.key_message && <p>{campaign.key_message}</p>}
                  </div>

                  <div className="campaign-list-row__allocation">
                    <div>
                      <span>Allocation</span>
                      <strong>
                        {allocationTarget > 0
                          ? `${creatorsUsed} / ${allocationTarget}`
                          : "No cap"}
                      </strong>
                    </div>
                    <div
                      className="campaign-card__progress-track"
                      aria-hidden="true"
                    >
                      <span />
                    </div>
                  </div>

                  <dl className="campaign-list-row__stats">
                    <div>
                      <dt>Budget</dt>
                      <dd>{formatRupees(campaign.total_budget)}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDate(campaign.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Window</dt>
                      <dd>{campaignWindowLabel(campaign)}</dd>
                    </div>
                    <div>
                      <dt>Lines</dt>
                      <dd>{budgetRows.length}</dd>
                    </div>
                  </dl>

                  <footer className="campaign-list-row__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(campaign);
                      }}
                    >
                      <Eye size={12} />
                      View
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
                    {canManage && (
                      <>
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
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          disabled={statusBusyId === campaign.campaign_id}
                          onClick={(event) => {
                            event.stopPropagation();
                            changeStatus(
                              campaign.campaign_id,
                              isClosed ? "reopen" : "close",
                            );
                          }}
                        >
                          {statusBusyId === campaign.campaign_id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : isClosed ? (
                            <RotateCcw size={12} />
                          ) : (
                            <Lock size={12} />
                          )}
                          {isClosed ? "Reopen" : "Close"}
                        </button>
                      </>
                    )}
                  </footer>
                </article>
              );
            }

            return (
              <article
                key={campaign.campaign_id}
                className="campaign-card"
                data-status={isClosed ? "closed" : "active"}
                style={
                  {
                    "--campaign-accent": accent,
                    "--campaign-progress": `${progressPct}%`,
                    "--campaign-card-index": String(index),
                  } as CSSProperties
                }
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
                      <strong className="campaign-card__id">
                        {campaign.campaign_id}
                      </strong>
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
                  <p className="campaign-card__message">
                    {campaign.key_message}
                  </p>
                )}

                <div className="campaign-card__progress">
                  <div>
                    <span>Creator allocation</span>
                    <strong>
                      {allocationTarget > 0
                        ? `${progressPct}% filled`
                        : "No cap set"}
                    </strong>
                  </div>
                  <div
                    className="campaign-card__progress-track"
                    aria-hidden="true"
                  >
                    <span />
                  </div>
                </div>

                <dl className="campaign-card__facts">
                  <div>
                    <dt>
                      <Target size={12} />
                      Creators
                    </dt>
                    <dd
                      title={
                        creatorCap > 0
                          ? `${creatorsUsed} of ${creatorCap} creator slots used`
                          : undefined
                      }
                    >
                      {creatorCap > 0
                        ? `${creatorsUsed} / ${creatorCap}`
                        : (target ?? "—")}
                    </dd>
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
                      {totalWithGarments
                        ? formatRupees(totalWithGarments)
                        : "—"}
                    </dd>
                  </div>
                </dl>

                <div className="campaign-card__meta-row">
                  <span>{budgetRows.length} budget lines</span>
                  <span>{campaignWindowLabel(campaign)}</span>
                </div>

                <footer className="campaign-card__actions">
                  <div className="campaign-card__primary-actions">
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
                  </div>
                  {canManage && (
                    <div className="campaign-card__secondary-actions">
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
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        disabled={statusBusyId === campaign.campaign_id}
                        onClick={(event) => {
                          event.stopPropagation();
                          changeStatus(
                            campaign.campaign_id,
                            isClosed ? "reopen" : "close",
                          );
                        }}
                      >
                        {statusBusyId === campaign.campaign_id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : isClosed ? (
                          <RotateCcw size={12} />
                        ) : (
                          <Lock size={12} />
                        )}
                        {isClosed ? "Reopen" : "Close"}
                      </button>
                    </div>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <CampaignDetailsModal
          campaign={selected}
          canManage={canManage}
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
  canManage,
  onClose,
  onEdit,
  editLoading,
}: {
  campaign: CampaignListRow;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  editLoading: boolean;
}) {
  const target = normalizeNumber(campaign.no_of_creators);
  const budgetRows = campaign.budget_rows ?? [];
  const accent = campaignAccent(campaign);
  const totalWithGarments = budgetRows.reduce(
    (sum, row) => sum + (normalizeNumber(row.total_with_garments) ?? 0),
    0,
  );
  const creatorCap = budgetRows.reduce(
    (sum, row) => sum + (normalizeNumber(row.num_influencers) ?? 0),
    0,
  );
  const creatorsUsed = campaign.creators_used ?? 0;
  const allocationTarget = creatorCap || target || 0;
  const progressPct =
    allocationTarget > 0
      ? Math.min(100, Math.round((creatorsUsed / allocationTarget) * 100))
      : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel campaign-detail-modal"
        style={
          {
            "--campaign-accent": accent,
            "--campaign-progress": `${progressPct}%`,
          } as CSSProperties
        }
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head campaign-detail-head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <strong className="campaign-card__id">
                {campaign.campaign_id}
              </strong>
              <span className="campaign-status-pill">
                {statusLabel(campaign.status)}
              </span>
            </div>
            <h2>{campaign.campaign_name ?? "Untitled campaign"}</h2>
            {campaign.key_message && (
              <p className="campaign-detail-subtitle">{campaign.key_message}</p>
            )}
          </div>
          <div className="modal-head__actions">
            {canManage && (
              <button
                type="button"
                className="btn btn-secondary btn-xs campaign-detail-edit-btn"
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
            )}
            <button
              type="button"
              className="icon-btn campaign-detail-close-btn"
              onClick={onClose}
              aria-label="Close campaign details"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="modal-body campaign-detail-body">
          <section className="campaign-detail-overview">
            <div className="campaign-detail-allocation-card">
              <div
                className="campaign-detail-ring"
                aria-label={`Creator allocation ${progressPct}% filled`}
              >
                <strong>{progressPct}%</strong>
                <span>filled</span>
              </div>
              <div className="campaign-detail-allocation-copy">
                <span>Creator allocation</span>
                <strong>
                  {allocationTarget > 0
                    ? `${creatorsUsed} / ${allocationTarget}`
                    : "No cap set"}
                </strong>
                <div
                  className="campaign-card__progress-track campaign-detail-progress-track"
                  aria-hidden="true"
                >
                  <span />
                </div>
              </div>
            </div>

            <dl className="campaign-detail-stat-grid">
              <div>
                <dt>Campaign ID</dt>
                <dd>{campaign.campaign_id}</dd>
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
                <dd>{campaignWindowLabel(campaign)}</dd>
              </div>
              <div>
                <dt>Budget lines</dt>
                <dd>{budgetRows.length}</dd>
              </div>
            </dl>
          </section>

          <section className="campaign-detail-section">
            <div className="campaign-detail-section-head">
              <div>
                <h3>Links</h3>
                <p>Briefs attached to this campaign.</p>
              </div>
            </div>
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
            <div className="campaign-detail-section-head">
              <div>
                <h3>Budget Lines</h3>
                <p>
                  {budgetRows.length} rows /{" "}
                  {allocationTarget > 0
                    ? `${allocationTarget} creator slots`
                    : "No creator cap"}
                </p>
              </div>
              <strong>
                {totalWithGarments ? formatRupees(totalWithGarments) : "—"}
              </strong>
            </div>
            {budgetRows.length === 0 ? (
              <p>No budget lines found.</p>
            ) : (
              <div className="campaign-budget-lines">
                {budgetRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="campaign-budget-line"
                    style={
                      {
                        "--budget-line-index": String(index),
                      } as CSSProperties
                    }
                  >
                    <div className="campaign-budget-line__main">
                      <div>
                        <strong>{row.tier ?? "Tier"}</strong>
                        <span>
                          {row.collab_type ?? "Collab"} /{" "}
                          {row.campaign_name ??
                            campaign.campaign_name ??
                            "Segment"}
                        </span>
                      </div>
                      <em>{row.month_label ?? "No month label"}</em>
                    </div>
                    <dl className="campaign-budget-line__stats">
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
                      <div className="campaign-budget-line__stat--total">
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
