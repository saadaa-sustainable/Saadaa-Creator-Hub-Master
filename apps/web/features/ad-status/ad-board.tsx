"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CalendarDays,
  Download,
  Eye,
  ExternalLink,
  Grid3X3,
  HourglassIcon,
  Instagram,
  List as ListIcon,
  Megaphone,
  Search,
  ShieldCheck,
  Trophy,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { PartnershipKeyEdit } from "@/components/ui/partnership-key-edit";
import { DashboardDonut } from "@/features/dashboard/widgets/donut-card";
import type { BreakdownSlice } from "@/features/dashboard/types";
import { cn } from "@/lib/cn";
import { formatDate, workflowStatusLabel } from "@/lib/formatters";
import type { AdStatusFilters, AdStatusRow } from "./types";

// ---------------------------------------------------------------------------
// Classification badge — exact legacy colors
// ---------------------------------------------------------------------------

function AsClassBadge({ value }: { value: string }) {
  const base =
    "pill inline-flex items-center gap-1 px-[10px] py-[3px] rounded-full text-[0.7rem] font-extrabold tracking-[0.04em] uppercase leading-tight";
  if (value === "Winner")
    return (
      <span className={cn(base, "bg-[#ECF1E9] text-[#4F7C4D]")}>
        <Trophy size={9} aria-hidden />
        Winner
      </span>
    );
  if (value === "ITE")
    return (
      <span className={cn(base, "bg-[#FAF1DC] text-[#B57514]")}>
        <TrendingUp size={9} aria-hidden />
        ITE
      </span>
    );
  if (value === "Discarded but analyse")
    return (
      <span className={cn(base, "bg-[#E6EDF8] text-[#3B6FD4]")}>
        <Search size={9} aria-hidden />
        Analyse
      </span>
    );
  if (value === "Discarded")
    return (
      <span className={cn(base, "bg-[#FDECEA] text-[#C0392B]")}>
        <XCircle size={9} aria-hidden />
        Discarded
      </span>
    );
  return (
    <span className="pill pill--muted font-bold uppercase">
      <HourglassIcon size={9} aria-hidden />
      Untested
    </span>
  );
}

// ---------------------------------------------------------------------------
// Link chips — Instagram (pink) + Drive (green), exact legacy colors
// ---------------------------------------------------------------------------

function LinkChips({ post, drive }: { post?: string; drive?: string }) {
  if (!post && !drive)
    return <span className="text-text-tertiary text-[0.78rem]">—</span>;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {post && (
        <a
          href={post}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[0.74rem] px-[10px] py-[3px] rounded-full bg-[rgba(225,48,108,0.1)] text-[#E1306C] font-semibold no-underline"
        >
          <Instagram size={11} aria-hidden />
          Post
        </a>
      )}
      {drive && (
        <a
          href={drive}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[0.74rem] px-[10px] py-[3px] rounded-full bg-[rgba(79,124,77,0.1)] text-[var(--success-text)] font-semibold no-underline"
        >
          <Download size={11} aria-hidden />
          Drive
        </a>
      )}
    </div>
  );
}

function CardLinkActions({ post, drive }: { post?: string; drive?: string }) {
  if (!post && !drive) return null;
  return (
    <div className="ob-card-actions ad-status-card-link-actions">
      {post && (
        <a
          href={post}
          target="_blank"
          rel="noopener noreferrer"
          className="action-view ad-status-link-action ad-status-link-action--post"
        >
          <Instagram size={12} aria-hidden />
          Post
        </a>
      )}
      {drive && (
        <a
          href={drive}
          target="_blank"
          rel="noopener noreferrer"
          className="action-view ad-status-link-action ad-status-link-action--drive"
        >
          <Download size={12} aria-hidden />
          Drive
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Days since — "Today" at 0, "Xd" list / "Xd ago" cards
// ---------------------------------------------------------------------------

function DaysSince({
  days,
  ago,
}: {
  days: number | null | undefined;
  ago?: boolean;
}) {
  if (days == null)
    return <span className="text-text-tertiary text-xs">—</span>;
  const text = days === 0 ? "Today" : ago ? `${days}d ago` : `${days}d`;
  const cls =
    days > 60
      ? "text-[var(--danger-text)]"
      : days > 30
        ? "text-[var(--warning-text)]"
        : "text-text-secondary";
  return <span className={cn("text-xs font-bold tabular", cls)}>{text}</span>;
}

// ---------------------------------------------------------------------------
// Shared: section header, creator cell, post-id code
// ---------------------------------------------------------------------------

function SectionHead({
  dot,
  title,
  count,
}: {
  dot: "danger" | "purple";
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-[18px]">
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          dot === "danger" ? "bg-[var(--danger-text)]" : "bg-[#7B4FBF]",
        )}
        aria-hidden
      />
      <span className="text-[0.84rem] font-bold text-text-primary">
        {title}
      </span>
      <span className="text-[0.74rem] text-text-tertiary">
        {count} post{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function CreatorCell({ row }: { row: AdStatusRow }) {
  return (
    <div className="flex items-center gap-[10px] min-w-0">
      <Avatar
        src={row.profilePicUrl}
        username={row.username}
        name={row.name}
        size={32}
      />
      <div className="min-w-0">
        <div className="font-bold text-text-primary leading-[1.2] truncate text-[0.84rem]">
          {row.name || "—"}
        </div>
        <div className="text-[0.74rem] text-text-tertiary truncate">
          @{row.username || "—"}
        </div>
      </div>
    </div>
  );
}

function PostIdCode({
  value,
  collabId,
}: {
  value: string;
  collabId?: string | null;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 flex-wrap">
      <code className="text-[0.78rem] font-mono text-text-secondary">
        {value || "—"}
      </code>
      {collabId && (
        <span className="text-text-tertiary text-[0.7rem] tabular">
          · {collabId}
        </span>
      )}
    </span>
  );
}

function AdRunStatusPill({ value }: { value?: string | null }) {
  return (
    <span className="pill pill--muted capitalize">
      {value?.trim() || "Pending"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Performance stats bento card
// ---------------------------------------------------------------------------

function AdPerformanceStats({
  untested,
  adRun,
}: {
  untested: AdStatusRow[];
  adRun: AdStatusRow[];
}) {
  const total = untested.length + adRun.length;
  const classified = adRun.filter((r) => r.isClassified).length;
  const winners = adRun.filter((r) => r.adsResults === "Winner").length;
  const winRate =
    classified > 0 ? ((winners / classified) * 100).toFixed(1) : "0";
  const classRate = total > 0 ? ((classified / total) * 100).toFixed(1) : "0";
  const inMetaAds = adRun.filter((r) => r.isInMetaAds).length;

  const tiles = [
    { label: "Win Rate", value: `${winRate}%`, color: "#4F7C4D" },
    { label: "Class. Rate", value: `${classRate}%`, color: "#3B6FD4" },
    { label: "In Meta Ads", value: String(inMetaAds), color: "#7B4FBF" },
  ];

  return (
    <article className="h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-4">
      <header className="flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.07em] text-text-secondary">
        <BarChart3 size={12} aria-hidden /> Performance Stats
      </header>
      <div className="grid grid-cols-3 gap-3 flex-1">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="bg-bg-base border border-border rounded-xl p-3 flex flex-col items-center justify-center gap-1"
          >
            <span
              className="text-[1.6rem] font-bold tabular leading-none"
              style={{ color: t.color }}
            >
              {t.value}
            </span>
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-text-tertiary text-center leading-tight">
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Overview modal — same shell as posting overview
// ---------------------------------------------------------------------------

function OverviewItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="ob-overview-item">
      <span>{label}</span>
      <strong className={cn(mono && "tabular")}>{value || "—"}</strong>
    </div>
  );
}

function LinkRow({
  icon,
  label,
  url,
}: {
  icon: React.ReactNode;
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

function AdStatusOverviewModal({
  row,
  onClose,
}: {
  row: AdStatusRow;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Ad overview for ${row.name || row.username}`}
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding ob-overview-modal ad-overview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Eye size={16} aria-hidden />
            <h2 className="font-semibold">Ad Overview</h2>
            <span className="chip text-[10px] tabular">
              {row.postIdShort || row.postId}
            </span>
            {row.collabId && (
              <span className="text-text-tertiary text-[0.7rem] tabular">
                · {row.collabId}
              </span>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="modal-body ob-overview-body">
          <section className="ob-overview-card">
            <div className="ob-overview-head">
              <Avatar
                src={row.profilePicUrl}
                username={row.username}
                name={row.name}
                size={48}
              />
              <div className="ob-overview-identity">
                <strong>{row.name || row.username || "—"}</strong>
                <span>@{row.username || "—"}</span>
              </div>
              <AsClassBadge value={row.adsResults} />
            </div>
            <div className="ob-overview-pills">
              {row.campaign && (
                <span className="campaign-chip">{row.campaign}</span>
              )}
              <span className="pill pill--muted capitalize">
                {row.adsStatus || "Pending"}
              </span>
              {row.adsUsageRights && (
                <span className="pill pill--info">
                  <ShieldCheck size={10} aria-hidden />
                  Ads: {row.adsUsageRights}
                </span>
              )}
              <span
                className={cn(
                  "pill",
                  row.isInMetaAds ? "pill--parent" : "pill--muted",
                )}
              >
                <Megaphone size={10} aria-hidden />
                {row.isInMetaAds ? "In Meta Ads" : "Not in Meta Ads"}
              </span>
            </div>
          </section>

          <section className="ob-overview-grid">
            <OverviewItem
              label="Post ID"
              value={
                row.collabId ? `${row.postId} · ${row.collabId}` : row.postId
              }
              mono
            />
            <OverviewItem
              label="Post Date"
              value={
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={10} aria-hidden />
                  {formatDate(row.postDate) || "—"}
                </span>
              }
              mono
            />
            <OverviewItem label="Campaign" value={row.campaign || "—"} />
            <OverviewItem
              label="Partnership ID"
              value={row.partnershipId || "—"}
              mono
            />
            <OverviewItem
              label="Days Since Posted"
              value={
                row.daysSince != null
                  ? row.daysSince === 0
                    ? "Today"
                    : `${row.daysSince}d ago`
                  : "—"
              }
              mono
            />
            <OverviewItem label="Collab Type" value={row.collabType || "—"} />
            <OverviewItem
              label="Ads Usage Rights"
              value={row.adsUsageRights || "—"}
            />
            <OverviewItem
              label="Ads Status"
              value={row.adsStatus || "Pending"}
            />
            <OverviewItem
              label="Classification"
              value={row.adsResults || "Untested"}
            />
          </section>

          <section className="ob-overview-grid">
            <OverviewItem label="Category" value={row.category || "—"} />
            <OverviewItem
              label="Followers"
              value={
                row.followers != null ? row.followers.toLocaleString() : "—"
              }
              mono
            />
            <OverviewItem
              label="In Meta Ads"
              value={row.isInMetaAds ? "Yes" : "No"}
            />
            <OverviewItem
              label="Workflow"
              value={workflowStatusLabel(row.workflowStatus)}
            />
          </section>

          <section className="pt-overview-links">
            <LinkRow
              icon={<Instagram size={12} aria-hidden />}
              label="Live Post URL"
              url={row.linkToPost}
            />
            <LinkRow
              icon={<Download size={12} aria-hidden />}
              label="Drive Download Link"
              url={row.downloadLink}
            />
          </section>
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {row.linkToPost && (
            <a
              href={row.linkToPost}
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

// ---------------------------------------------------------------------------
// Untested section — list table
// ---------------------------------------------------------------------------

function UntestedListTable({
  rows,
  onOverview,
}: {
  rows: AdStatusRow[];
  onOverview: (row: AdStatusRow) => void;
}) {
  if (!rows.length)
    return (
      <div className="ob-list-wrap ad-status-list-wrap">
        <table className="ob-list-table">
          <tbody>
            <tr>
              <td
                colSpan={7}
                className="text-center py-8 text-text-tertiary text-sm"
              >
                No untested ads — warehouse classified everything.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="ob-list-wrap ad-status-list-wrap">
      <div>
        <table className="ob-list-table">
          <colgroup>
            <col className="ad-col-creator" />
            <col className="ad-col-post-id" />
            <col className="ad-col-campaign" />
            <col className="ad-col-date" />
            <col className="ad-col-days" />
            <col className="ad-col-links" />
            <col className="ad-col-partnership" />
            <col className="ad-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th data-column-id="creator">Creator</th>
              <th data-column-id="post_id">Post ID</th>
              <th data-column-id="campaign">Campaign</th>
              <th style={{ width: "7rem" }}>Post Date</th>
              <th style={{ width: "5.5rem" }}>Days Since</th>
              <th style={{ width: "10rem" }}>Links</th>
              <th style={{ width: "10rem" }}>Partnership</th>
              <th data-column-id="actions">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.postId}>
                <td data-column-id="creator">
                  <CreatorCell row={r} />
                </td>
                <td data-column-id="post_id">
                  <PostIdCode
                    value={r.postIdShort || r.postId}
                    collabId={r.collabId}
                  />
                </td>
                <td data-column-id="campaign">
                  {r.campaign ? (
                    <span className="campaign-chip">{r.campaign}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tabular">{formatDate(r.postDate)}</td>
                <td>
                  <DaysSince days={r.daysSince} />
                </td>
                <td>
                  <LinkChips post={r.linkToPost} drive={r.downloadLink} />
                </td>
                <td>
                  <PartnershipKeyEdit
                    postId={r.postId}
                    value={r.partnershipId}
                    compact
                  />
                </td>
                <td data-column-id="actions">
                  <span className="ob-row-action">
                    <button
                      type="button"
                      className="action-btn action-btn--view"
                      onClick={() => onOverview(r)}
                    >
                      <Eye size={11} aria-hidden />
                      Overview
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Untested section — cards grid
// ---------------------------------------------------------------------------

function UntestedCardsGrid({
  rows,
  onOverview,
}: {
  rows: AdStatusRow[];
  onOverview: (row: AdStatusRow) => void;
}) {
  if (!rows.length)
    return (
      <div className="ob-empty">
        <Megaphone size={24} aria-hidden />
        <p>No untested ads — warehouse classified everything.</p>
      </div>
    );
  return (
    <div className="ob-card-grid">
      {rows.map((r) => (
        <article
          key={r.postId}
          className="ob-card ad-status-card ad-status-card--untested"
        >
          <div className="ob-card-head">
            <Avatar
              src={r.profilePicUrl}
              username={r.username}
              name={r.name}
              size={44}
              className="ob-card-avatar"
            />
            <div className="ob-card-id min-w-0">
              <div className="ob-card-name">{r.name || r.username || "—"}</div>
              {r.username && (
                <div className="ob-card-handle">@{r.username}</div>
              )}
            </div>
          </div>

          <div className="ob-card-pills">
            <AsClassBadge value="" />
            {r.campaign && <span className="campaign-chip">{r.campaign}</span>}
            {r.adsUsageRights && (
              <span className="pill pill--info">
                <ShieldCheck size={10} aria-hidden />
                Ads: {r.adsUsageRights}
              </span>
            )}
          </div>

          <dl className="ob-card-meta-grid ad-status-card-meta">
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Post ID</span>
              <span className="ob-card-meta-val tabular">
                {r.postIdShort || r.postId || "—"}
                {r.collabId && (
                  <span className="text-text-tertiary text-[0.7rem] tabular font-normal">
                    {" · "}
                    {r.collabId}
                  </span>
                )}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Days Since</span>
              <span className="ob-card-meta-val">
                <DaysSince days={r.daysSince} ago />
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Post Date</span>
              <span className="ob-card-meta-val tabular">
                {formatDate(r.postDate) || "—"}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Collab</span>
              <span
                className={cn(
                  "ob-card-meta-val",
                  !r.collabType && "text-text-tertiary font-normal",
                )}
              >
                {r.collabType || "—"}
              </span>
            </div>
            <div className="ob-card-meta ad-status-card-partnership">
              <span className="ob-card-meta-label">Partnership</span>
              <span className="ob-card-meta-val tabular">
                <PartnershipKeyEdit
                  postId={r.postId}
                  value={r.partnershipId}
                  compact
                  stopPropagation
                />
              </span>
            </div>
          </dl>

          <CardLinkActions post={r.linkToPost} drive={r.downloadLink} />

          <div className="ob-card-actions">
            <button
              type="button"
              className="action-view"
              onClick={() => onOverview(r)}
            >
              <Eye size={12} aria-hidden /> Overview
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad Run section — list table
// ---------------------------------------------------------------------------

function AdRunListTable({
  rows,
  onOverview,
}: {
  rows: AdStatusRow[];
  onOverview: (row: AdStatusRow) => void;
}) {
  if (!rows.length)
    return (
      <div className="ob-list-wrap ad-status-list-wrap">
        <table className="ob-list-table">
          <tbody>
            <tr>
              <td
                colSpan={7}
                className="text-center py-8 text-text-tertiary text-sm"
              >
                No ads match filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="ob-list-wrap ad-status-list-wrap">
      <div>
        <table className="ob-list-table">
          <colgroup>
            <col className="ad-col-creator" />
            <col className="ad-col-post-id" />
            <col className="ad-col-campaign" />
            <col className="ad-col-status" />
            <col className="ad-col-classification" />
            <col className="ad-col-partnership" />
            <col className="ad-col-links" />
            <col className="ad-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th data-column-id="creator">Creator</th>
              <th data-column-id="post_id">Post ID</th>
              <th data-column-id="campaign">Campaign</th>
              <th style={{ width: "6.5rem" }}>Run Status</th>
              <th style={{ width: "8.5rem" }}>Classification</th>
              <th style={{ width: "10rem" }}>Partnership ID</th>
              <th style={{ width: "7rem" }}>Post</th>
              <th data-column-id="actions">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.postId}>
                <td data-column-id="creator">
                  <CreatorCell row={r} />
                </td>
                <td data-column-id="post_id">
                  <PostIdCode
                    value={r.postIdShort || r.postId}
                    collabId={r.collabId}
                  />
                </td>
                <td data-column-id="campaign">
                  {r.campaign ? (
                    <span className="campaign-chip">{r.campaign}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {r.adsStatus ? (
                    <span className="inline-flex items-center px-[10px] py-[3px] rounded-full bg-bg-surface text-text-secondary text-[0.72rem] font-bold capitalize border border-border">
                      {r.adsStatus}
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
                <td>
                  <AsClassBadge value={r.adsResults} />
                </td>
                <td>
                  <PartnershipKeyEdit
                    postId={r.postId}
                    value={r.partnershipId}
                    compact
                  />
                </td>
                <td>
                  <LinkChips post={r.linkToPost} />
                </td>
                <td data-column-id="actions">
                  <span className="ob-row-action">
                    <button
                      type="button"
                      className="action-btn action-btn--view"
                      onClick={() => onOverview(r)}
                    >
                      <Eye size={11} aria-hidden />
                      Overview
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad Run section — cards grid
// ---------------------------------------------------------------------------

function AdRunCardsGrid({
  rows,
  onOverview,
}: {
  rows: AdStatusRow[];
  onOverview: (row: AdStatusRow) => void;
}) {
  if (!rows.length)
    return (
      <div className="ob-empty">
        <Megaphone size={24} aria-hidden />
        <p>No ads match filters.</p>
      </div>
    );
  return (
    <div className="ob-card-grid">
      {rows.map((r) => (
        <article
          key={r.postId}
          className={cn(
            "ob-card ad-status-card",
            r.adsResults === "Winner" && "ob-card-onboarded",
            (r.adsResults === "Discarded" ||
              r.adsResults === "Discarded but analyse") &&
              "ob-card-pending",
          )}
        >
          <div className="ob-card-head">
            <Avatar
              src={r.profilePicUrl}
              username={r.username}
              name={r.name}
              size={44}
              className="ob-card-avatar"
            />
            <div className="ob-card-id min-w-0">
              <div className="ob-card-name">{r.name || r.username || "—"}</div>
              {r.username && (
                <div className="ob-card-handle">@{r.username}</div>
              )}
            </div>
          </div>

          <div className="ob-card-pills">
            <AsClassBadge value={r.adsResults} />
            {r.campaign && <span className="campaign-chip">{r.campaign}</span>}
            <AdRunStatusPill value={r.adsStatus} />
            {r.adsUsageRights && (
              <span className="pill pill--info">
                <ShieldCheck size={10} aria-hidden />
                Ads: {r.adsUsageRights}
              </span>
            )}
          </div>

          <dl className="ob-card-meta-grid ad-status-card-meta">
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Post ID</span>
              <span className="ob-card-meta-val tabular">
                {r.postIdShort || r.postId || "—"}
                {r.collabId && (
                  <span className="text-text-tertiary text-[0.7rem] tabular font-normal">
                    {" · "}
                    {r.collabId}
                  </span>
                )}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">In Meta Ads</span>
              <span
                className={cn(
                  "ob-card-meta-val",
                  r.isInMetaAds ? "text-success" : "text-text-secondary",
                )}
              >
                {r.isInMetaAds ? "Yes" : "No"}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Post Date</span>
              <span className="ob-card-meta-val tabular">
                {formatDate(r.postDate) || "—"}
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Days Since</span>
              <span className="ob-card-meta-val">
                <DaysSince days={r.daysSince} ago />
              </span>
            </div>
            <div className="ob-card-meta">
              <span className="ob-card-meta-label">Collab</span>
              <span
                className={cn(
                  "ob-card-meta-val",
                  !r.collabType && "text-text-tertiary font-normal",
                )}
              >
                {r.collabType || "—"}
              </span>
            </div>
            <div className="ob-card-meta ad-status-card-partnership">
              <span className="ob-card-meta-label">Partnership</span>
              <span className="ob-card-meta-val tabular">
                <PartnershipKeyEdit
                  postId={r.postId}
                  value={r.partnershipId}
                  compact
                  stopPropagation
                />
              </span>
            </div>
          </dl>

          <CardLinkActions post={r.linkToPost} drive={r.downloadLink} />

          <div className="ob-card-actions">
            <button
              type="button"
              className="action-view"
              onClick={() => onOverview(r)}
            >
              <Eye size={12} aria-hidden /> Overview
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board — two sections with shared view toggle + client-side filters
// ---------------------------------------------------------------------------

export function AdStatusBoard({
  untested,
  adRun,
  filters,
}: {
  untested: AdStatusRow[];
  adRun: AdStatusRow[];
  filters: AdStatusFilters;
}) {
  const [view, setView] = useState<"list" | "cards">("cards");
  const [overviewRow, setOverviewRow] = useState<AdStatusRow | null>(null);

  const q = (filters.search ?? "").trim().toLowerCase();
  const classification = filters.classification ?? "";
  const adStatus = (filters.adStatus ?? "").trim().toLowerCase();

  const matchesBase = (r: AdStatusRow) => {
    if (q) {
      const hay =
        `${r.name} ${r.username} ${r.postId} ${r.postIdShort}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // adStatus filter on adsStatus field (substring match, same as legacy)
    if (adStatus && !r.adsStatus.toLowerCase().includes(adStatus)) return false;
    return true;
  };

  const filteredUntested = useMemo(() => {
    // When adStatus filter is active, untested posts have no adsStatus → hide all
    if (adStatus) return [];
    // When classification is "untested only", show untested; otherwise always show untested
    // (classification filter targets adRun section)
    return untested.filter(matchesBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untested, q, adStatus]);

  const filteredAdRun = useMemo(() => {
    // __untested special value → collapse run section
    if (classification === "__untested") return [];
    return adRun.filter((r) => {
      if (!matchesBase(r)) return false;
      if (classification && r.adsResults !== classification) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adRun, q, classification, adStatus]);

  const total = filteredUntested.length + filteredAdRun.length;

  // Analytics bento — classification breakdown
  const classSlices: BreakdownSlice[] = [
    { label: "Untested", value: untested.length, color: "#9A9384" },
    {
      label: "Winner",
      value: adRun.filter((r) => r.adsResults === "Winner").length,
      color: "#4F7C4D",
    },
    {
      label: "ITE",
      value: adRun.filter((r) => r.adsResults === "ITE").length,
      color: "#B57514",
    },
    {
      label: "Analyse",
      value: adRun.filter((r) => r.adsResults === "Discarded but analyse")
        .length,
      color: "#3B6FD4",
    },
    {
      label: "Discarded",
      value: adRun.filter((r) => r.adsResults === "Discarded").length,
      color: "#C0392B",
    },
  ].filter((s) => s.value > 0);

  return (
    <>
      {/* Analytics bento — sits between KPI strip and board */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
        <DashboardDonut
          icon={Trophy}
          title="Ad Classification"
          slices={classSlices}
          emptyHint="No eligible posts yet"
        />
        <AdPerformanceStats untested={untested} adRun={adRun} />
      </section>

      {/* Board */}
      <section className="mt-4 min-w-0">
        {/* Toolbar — view toggle hidden on mobile (cards always shown) */}
        <div className="order-status-board-toolbar">
          <span className="text-xs font-bold tabular text-text-secondary bg-bg-ecru border border-border rounded-full px-3 py-1">
            {total} total
          </span>
          <div
            className="hidden md:flex ob-viewtoggle"
            role="tablist"
            aria-label="View"
          >
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

        {/* Section 1 — Untested Ads */}
        <SectionHead
          dot="danger"
          title="Untested Ads"
          count={filteredUntested.length}
        />
        {/* Mobile: always cards */}
        <div className="md:hidden">
          <UntestedCardsGrid
            rows={filteredUntested}
            onOverview={setOverviewRow}
          />
        </div>
        {/* Desktop: respect toggle */}
        <div className="hidden md:block">
          {view === "list" ? (
            <UntestedListTable
              rows={filteredUntested}
              onOverview={setOverviewRow}
            />
          ) : (
            <UntestedCardsGrid
              rows={filteredUntested}
              onOverview={setOverviewRow}
            />
          )}
        </div>

        {/* Section 2 — Ad Run Status */}
        <SectionHead
          dot="purple"
          title="Ad Run Status"
          count={filteredAdRun.length}
        />
        {/* Mobile: always cards */}
        <div className="md:hidden">
          <AdRunCardsGrid rows={filteredAdRun} onOverview={setOverviewRow} />
        </div>
        {/* Desktop: respect toggle */}
        <div className="hidden md:block">
          {view === "list" ? (
            <AdRunListTable rows={filteredAdRun} onOverview={setOverviewRow} />
          ) : (
            <AdRunCardsGrid rows={filteredAdRun} onOverview={setOverviewRow} />
          )}
        </div>

        {overviewRow && (
          <AdStatusOverviewModal
            row={overviewRow}
            onClose={() => setOverviewRow(null)}
          />
        )}
      </section>
    </>
  );
}
