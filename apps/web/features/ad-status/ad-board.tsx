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
import { TileHead } from "@/features/dashboard/bento-kit";
import { DonutTile, type DonutSeg } from "@/features/dashboard/bento-charts";
import { cn } from "@/lib/cn";
import {
  formatDate,
  formatNumber,
  formatRupees,
  workflowStatusLabel,
} from "@/lib/formatters";
import { extractShortcode } from "@/lib/instagram-shortcode";
import type { AdStatusFilters, AdStatusRow, WarehouseAd } from "./types";

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
// Warehouse category badge — Creative Testing Dashboard semantics in our
// tokens. Incremental Winner gets the filled/stronger green variant.
// ---------------------------------------------------------------------------

const BADGE_BASE =
  "pill inline-flex items-center gap-1 px-[10px] py-[3px] rounded-full text-[0.7rem] font-extrabold tracking-[0.04em] uppercase leading-tight whitespace-nowrap";

function WhCategoryBadge({ category }: { category: string }) {
  if (category === "Incremental Winner")
    return (
      <span
        className={cn(BADGE_BASE, "bg-[#4F7C4D] text-white")}
        title="Incremental Winner"
      >
        <Trophy size={9} aria-hidden />
        Incr. Winner
      </span>
    );
  if (category === "Winner")
    return (
      <span className={cn(BADGE_BASE, "bg-[#ECF1E9] text-[#4F7C4D]")}>
        <Trophy size={9} aria-hidden />
        Winner
      </span>
    );
  if (category === "P0 analysis")
    return (
      <span className={cn(BADGE_BASE, "bg-[#E6EDF8] text-[#3B6FD4]")}>
        <Search size={9} aria-hidden />
        P0 Analysis
      </span>
    );
  if (category === "P1 analysis")
    return (
      <span className={cn(BADGE_BASE, "bg-[#FAF1DC] text-[#B57514]")}>
        <TrendingUp size={9} aria-hidden />
        P1 Analysis
      </span>
    );
  if (category === "P2 analysis")
    return (
      <span className={cn(BADGE_BASE, "bg-[#FAF1DC] text-[#B57514]")}>
        <TrendingUp size={9} aria-hidden />
        P2 Analysis
      </span>
    );
  if (category === "Discarded")
    return (
      <span className={cn(BADGE_BASE, "bg-[#FDECEA] text-[#C0392B]")}>
        <XCircle size={9} aria-hidden />
        Discarded
      </span>
    );
  return (
    <span className="pill pill--muted font-bold uppercase">{category}</span>
  );
}

/**
 * Status chip for an Ad Run row: warehouse category when matched, otherwise
 * neutral (legacy classification text or plain "In Meta Ads").
 */
function RowStatusBadge({ row }: { row: AdStatusRow }) {
  if (row.warehouseCategory)
    return <WhCategoryBadge category={row.warehouseCategory} />;
  return (
    <span className="pill pill--muted font-bold uppercase">
      <Megaphone size={9} aria-hidden />
      {row.adsResults || "In Meta Ads"}
    </span>
  );
}

function HistoricChip() {
  return (
    <span
      className="pill pill--muted text-[0.62rem] font-bold uppercase tracking-[0.05em] shrink-0"
      title="From the historic archive — pre-platform post matched to a warehouse ad"
    >
      Historic
    </span>
  );
}

/** The ad name carries a pre-renumbering SIF; the row is attached to the
 * creator via the raw legacy archive, not to a specific post. */
function RetiredIdChip() {
  return (
    <span
      className="pill pill--muted text-[0.62rem] font-bold uppercase tracking-[0.05em] shrink-0"
      title="Ad name uses a retired (pre-renumbering) post ID — attached to the creator via the legacy archive; no specific post exists for it"
    >
      Retired ID
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ad creative thumbnail — plain <img> (Meta CDN blocks proxying), lazy, no
// referrer. Clicking opens the in-app creative lightbox (NOT fb.me — that
// redirects into Business Suite; external jump lives on its explicit button).
// ---------------------------------------------------------------------------

function AdImg({
  ad,
  alt,
  size = 44,
  className,
  postUrl,
  igUsername,
}: {
  ad: WarehouseAd;
  alt: string;
  size?: number;
  className?: string;
  /** The organic Instagram post behind this ad — when present, the preview
   *  popup renders the live IG embed instead of the low-res Meta thumb. */
  postUrl?: string | null;
  /** Creator handle — lets the popup resolve the post's real video file via
   *  Meta and autoplay it natively (the IG embed can't play Reels inline). */
  igUsername?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = ad.imageUrl || ad.thumbnailUrl || null;
  const body =
    src && !failed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn("ad-thumb", className)}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    ) : (
      <span
        className={cn("ad-thumb ad-thumb--empty", className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Megaphone size={Math.round(size * 0.36)} aria-hidden />
      </span>
    );
  if (!src && !ad.previewLink) return body;
  return (
    <>
      <button
        type="button"
        className="ad-thumb-link shrink-0"
        title="Preview ad creative"
        aria-label={`Preview ad creative — ${alt}`}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation();
          setPreviewOpen(true);
        }}
      >
        {body}
      </button>
      {previewOpen && (
        <AdCreativeLightbox
          ad={ad}
          alt={alt}
          postUrl={postUrl}
          igUsername={igUsername}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

/** Resolved IG media for the popup: null = nothing usable, keep fallbacks. */
interface IgMediaHit {
  mediaType: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
}

/**
 * In-app ad preview popup — same anatomy as the Posting form's Post Preview.
 * The ad IS an organic post run as an ad, so when the row carries the post
 * link we render the NATIVE Instagram embed (videos play, carousels swipe) —
 * not Meta's low-res expiring thumbnail. The Meta thumb is only the fallback
 * for rows with no post link (retired IDs, some historic). Meta's fb.me
 * preview page frame-blocks embedding, so Business Suite stays behind the
 * explicit "Open in Meta" button.
 */
function AdCreativeLightbox({
  ad,
  alt,
  postUrl,
  igUsername,
  onClose,
}: {
  ad: WarehouseAd;
  alt: string;
  postUrl?: string | null;
  igUsername?: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  // undefined = still resolving, null = nothing usable (fall back to embed)
  const [igMedia, setIgMedia] = useState<IgMediaHit | null | undefined>(
    undefined,
  );
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase + stopPropagation: Escape closes ONLY the lightbox,
      // not the Ad Overview modal it may be stacked on.
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const src = ad.imageUrl || ad.thumbnailUrl || null;
  const shortcode = extractShortcode(postUrl ?? "");
  const igUrl =
    postUrl?.trim() ||
    (shortcode ? `https://www.instagram.com/p/${shortcode}/` : null);

  // Ask Meta for the post's real media file — a native <video> can autoplay,
  // the IG embed can't (Reels in the embed only link out to Instagram).
  useEffect(() => {
    if (!shortcode || !igUsername) {
      setIgMedia(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/ads/ig-video?username=${encodeURIComponent(igUsername)}&shortcode=${encodeURIComponent(shortcode)}`,
    )
      .then((r) => (r.ok ? r.json() : { media: null }))
      .then((j: { media: IgMediaHit | null }) => {
        if (!cancelled) setIgMedia(j.media ?? null);
      })
      .catch(() => {
        if (!cancelled) setIgMedia(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shortcode, igUsername]);

  const videoUrl =
    igMedia?.mediaType === "VIDEO" && igMedia.mediaUrl ? igMedia.mediaUrl : null;
  const highResImage =
    igMedia && igMedia.mediaType !== "VIDEO" && igMedia.mediaUrl
      ? igMedia.mediaUrl
      : null;
  const resolving = Boolean(shortcode && igUsername) && igMedia === undefined;

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding ad-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Ad preview — ${ad.adName || alt}`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding ad-lightbox-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            {shortcode ? (
              <Instagram size={16} aria-hidden className="shrink-0" />
            ) : (
              <Megaphone size={16} aria-hidden className="shrink-0" />
            )}
            <h2 className="font-semibold">Ad Preview</h2>
            {ad.category && <WhCategoryBadge category={ad.category} />}
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

        <div className="modal-body ad-lightbox-grid">
          <div className="ad-lightbox-media">
            {resolving ? (
              <div className="ad-lightbox-loading" aria-label="Loading preview">
                <span className="ad-lightbox-spinner" aria-hidden />
                Fetching post from Instagram…
              </div>
            ) : videoUrl ? (
              // Native playback: the post's real video file from Meta —
              // autoplays muted (browser policy), controls for sound.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={videoUrl}
                poster={igMedia?.posterUrl ?? src ?? undefined}
                autoPlay
                muted
                loop
                controls
                playsInline
                className="ad-lightbox-video"
              />
            ) : highResImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={highResImage}
                alt={alt}
                referrerPolicy="no-referrer"
                className="ad-lightbox-img"
              />
            ) : shortcode ? (
              <iframe
                src={`https://www.instagram.com/p/${shortcode}/embed/captioned/`}
                title="Instagram post preview"
                loading="lazy"
                allow="encrypted-media; clipboard-write; picture-in-picture; fullscreen"
                allowFullScreen
                className="ad-lightbox-embed"
              />
            ) : src && !failed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt}
                referrerPolicy="no-referrer"
                className="ad-lightbox-img"
                onError={() => setFailed(true)}
              />
            ) : (
              <div className="ad-lightbox-fallback">
                <Megaphone size={26} aria-hidden />
                <span>
                  Creative image unavailable — Meta&apos;s image link has
                  expired. Use &quot;Open in Meta&quot; below for the live
                  preview.
                </span>
              </div>
            )}
          </div>

          <aside className="ad-lightbox-aside">
            <span className="ad-lightbox-eyebrow">
              <Megaphone size={11} aria-hidden />
              Meta ad creative
            </span>
            <h3 className="ad-lightbox-name" title={ad.adName}>
              {ad.adName || "—"}
            </h3>

            <dl className="ad-lightbox-stats tabular">
              <div>
                <dt>Spend</dt>
                <dd>{formatRupees(ad.amountSpent)}</dd>
              </div>
              <div>
                <dt>ROAS</dt>
                <dd>{roasText(ad)}</dd>
              </div>
              <div>
                <dt>Impressions</dt>
                <dd>{formatNumber(ad.impressions)}</dd>
              </div>
              <div>
                <dt>FTEWV</dt>
                <dd>{formatNumber(ad.ftewvCount)}</dd>
              </div>
              <div>
                <dt>NCP</dt>
                <dd>{formatNumber(ad.ncpCount)}</dd>
              </div>
              <div>
                <dt>Orders</dt>
                <dd>{formatNumber(ad.shopifyOrders)}</dd>
              </div>
            </dl>

            {ad.adCreated && (
              <span className="ad-lightbox-date tabular">
                <CalendarDays size={13} aria-hidden />
                Ad created {formatDate(ad.adCreated)}
              </span>
            )}

            {igUrl && (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ad-lightbox-iglink"
              >
                <Instagram size={13} aria-hidden />
                Open on Instagram
                <ExternalLink size={11} aria-hidden />
              </a>
            )}
          </aside>
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {ad.adLink && (
            <a
              href={ad.adLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              <ExternalLink size={14} aria-hidden />
              Landing
            </a>
          )}
          {ad.previewLink && (
            <a
              href={ad.previewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary-cta"
            >
              <Eye size={14} aria-hidden />
              Open in Meta
            </a>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Row thumbnail: first-occurrence ad creative when available, else avatar. */
function RowThumb({ row, size = 44 }: { row: AdStatusRow; size?: number }) {
  const primary = row.primaryAd;
  if (primary && (primary.imageUrl || primary.thumbnailUrl))
    return (
      <AdImg
        ad={primary}
        alt={`Ad creative — ${row.username || row.postIdShort}`}
        size={size}
        postUrl={row.linkToPost}
        igUsername={row.username}
      />
    );
  return (
    <Avatar
      src={row.profilePicUrl}
      username={row.username}
      name={row.name}
      size={size}
    />
  );
}

function rowHasThumb(row: AdStatusRow): boolean {
  return Boolean(
    row.primaryAd && (row.primaryAd.imageUrl || row.primaryAd.thumbnailUrl),
  );
}

// ---------------------------------------------------------------------------
// Warehouse link chips — Landing (ad_link) + Preview (fb.me real ad preview)
// ---------------------------------------------------------------------------

function AdLinkChips({ ad }: { ad: WarehouseAd | null }) {
  if (!ad || (!ad.adLink && !ad.previewLink))
    return <span className="text-text-tertiary text-[0.78rem]">—</span>;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {ad.adLink && (
        <a
          href={ad.adLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[0.74rem] px-[10px] py-[3px] rounded-full bg-[rgba(59,111,212,0.1)] text-[#3B6FD4] font-semibold no-underline"
          title={ad.adLink}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={11} aria-hidden />
          Landing
        </a>
      )}
      {ad.previewLink && (
        <a
          href={ad.previewLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[0.74rem] px-[10px] py-[3px] rounded-full bg-[rgba(123,79,191,0.1)] text-[#7B4FBF] font-semibold no-underline"
          title="Open Meta ad preview"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye size={11} aria-hidden />
          Preview
        </a>
      )}
    </div>
  );
}

/** ROAS as "2.35x" — 2dp, en-IN irrelevant for a ratio. */
function roasText(ad: WarehouseAd | null): string {
  if (!ad) return "—";
  return `${ad.roasMa.toFixed(2)}x`;
}

/** Meta delivery enum → label: ACTIVE → "Active", CAMPAIGN_PAUSED → "Campaign paused". */
function prettyAdDeliveryStatus(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "—";
  const words = raw.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** True when the first-occurrence ad's category is winner-class. */
function isWinnerCategory(category: string | null | undefined): boolean {
  return category === "Winner" || category === "Incremental Winner";
}

/**
 * Clickable-row props — whole list row opens the Ad Overview modal (founder
 * ask: rows must be an Overview affordance, not just the button). Inner
 * links/buttons stopPropagation so they keep their own behavior.
 *
 * Deliberately NO role="button"/tabIndex on the <tr>: rows contain links,
 * buttons and an editable field, and role=button makes those children
 * presentational to assistive tech (axe nested-interactive). The row click is
 * a mouse convenience; the inner controls remain the accessible path.
 */
function rowClickProps(open: () => void, label: string) {
  return {
    title: label,
    onClick: open,
  };
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
          onClick={(e) => e.stopPropagation()}
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
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={11} aria-hidden />
          Drive
        </a>
      )}
    </div>
  );
}

function CardLinkActions({
  post,
  drive,
  landing,
  preview,
}: {
  post?: string;
  drive?: string;
  landing?: string | null;
  preview?: string | null;
}) {
  if (!post && !drive && !landing && !preview) return null;
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
      {landing && (
        <a
          href={landing}
          target="_blank"
          rel="noopener noreferrer"
          className="action-view ad-status-link-action ad-status-link-action--landing"
          title={landing}
        >
          <ExternalLink size={12} aria-hidden />
          Landing
        </a>
      )}
      {preview && (
        <a
          href={preview}
          target="_blank"
          rel="noopener noreferrer"
          className="action-view ad-status-link-action ad-status-link-action--preview"
          title="Open Meta ad preview"
        >
          <Eye size={12} aria-hidden />
          Preview
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
  // Classified = warehouse-categorised OR legacy-classified.
  const classified = adRun.filter(
    (r) => r.warehouseCategory != null || r.isClassified,
  ).length;
  const winners = adRun.filter(
    (r) =>
      r.warehouseCategory === "Incremental Winner" ||
      r.warehouseCategory === "Winner" ||
      r.adsResults === "Winner",
  ).length;
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
    <article className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-4 flex flex-col gap-2">
      <TileHead
        icon={<BarChart3 size={12} aria-hidden />}
        info="Win Rate = Winner-class posts (Incremental Winner + Winner) ÷ classified posts. Class. Rate = classified ÷ all eligible posts. In Meta Ads = posts found on the Meta platform."
      >
        Performance Stats
      </TileHead>
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

  // Warehouse-matched → live first-occurrence ad drives status/classification;
  // posts.ads_status / ads_results are legacy fields, stale for matched rows.
  const matched = row.ads.length > 0;
  const firstAd = row.primaryAd;

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
              {row.warehouseCategory ? (
                <WhCategoryBadge category={row.warehouseCategory} />
              ) : row.ads.length ? null : (
                // Legacy badge only for rows the warehouse doesn't know —
                // a matched-but-uncategorized ad must not show a stale
                // legacy "Winner" beside a "—" classification field.
                <AsClassBadge value={row.adsResults} />
              )}
            </div>
            <div className="ob-overview-pills">
              {row.source === "historic" && <HistoricChip />}
              {row.retiredId && <RetiredIdChip />}
              {row.campaign && (
                <span className="campaign-chip">{row.campaign}</span>
              )}
              {/* Matched rows: legacy "Pending" chip contradicts the warehouse
                  badge — show the first ad's Meta delivery status instead. */}
              {matched ? (
                firstAd?.adStatus ? (
                  <span className="pill pill--muted">
                    {prettyAdDeliveryStatus(firstAd.adStatus)}
                  </span>
                ) : null
              ) : (
                <span className="pill pill--muted capitalize">
                  {row.adsStatus || "Pending"}
                </span>
              )}
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
              value={
                matched
                  ? prettyAdDeliveryStatus(firstAd?.adStatus)
                  : row.adsStatus || "Pending"
              }
            />
            <OverviewItem
              label="Classification"
              value={
                matched
                  ? row.warehouseCategory || "—"
                  : row.adsResults || "Untested"
              }
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

          {row.ads.length > 0 && (
            <section className="ob-overview-card ad-overview-ads">
              <div className="flex items-center gap-2 mb-2">
                <Megaphone size={13} aria-hidden />
                <strong className="text-[0.8rem]">
                  Meta Ads Performance ({row.ads.length} ad
                  {row.ads.length > 1 ? "s" : ""})
                </strong>
              </div>
              <ul className="ad-overview-ad-list">
                {/* `ads` is first-occurrence order (earliest created first) —
                    entry 0 IS the first-occurrence ad. */}
                {row.ads.map((ad, i) => (
                  <li key={ad.adId}>
                    <AdImg
                      ad={ad}
                      alt={`Ad creative — ${ad.adName}`}
                      size={36}
                      postUrl={row.linkToPost}
                      igUsername={row.username}
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[0.76rem] font-semibold text-text-primary"
                        title={ad.adName}
                      >
                        {ad.adName}
                      </span>
                      <span className="block text-[0.7rem] text-text-tertiary tabular">
                        {formatRupees(ad.amountSpent)} · {roasText(ad)} ·{" "}
                        {formatNumber(ad.impressions)} impr ·{" "}
                        {formatNumber(ad.ftewvCount)} FTEWV ·{" "}
                        {formatNumber(ad.ncpCount)} NCP ·{" "}
                        {formatNumber(ad.shopifyOrders)} orders
                      </span>
                    </div>
                    {i === 0 && (
                      <span
                        className={cn(
                          "pill text-[0.62rem] font-bold uppercase tracking-[0.05em] shrink-0 whitespace-nowrap",
                          isWinnerCategory(ad.category)
                            ? "bg-[#ECF1E9] text-[#4F7C4D]"
                            : "pill--muted",
                        )}
                        title="Earliest ad created from this post — drives the row's status"
                      >
                        {isWinnerCategory(ad.category)
                          ? "First Occurrence Winner Ad"
                          : "First occurrence"}
                      </span>
                    )}
                    <WhCategoryBadge category={ad.category || "—"} />
                    <AdLinkChips ad={ad} />
                  </li>
                ))}
              </ul>
            </section>
          )}

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
            <LinkRow
              icon={<ExternalLink size={12} aria-hidden />}
              label="Ad Landing Page"
              url={row.primaryAd?.adLink}
            />
            <LinkRow
              icon={<Eye size={12} aria-hidden />}
              label="Meta Ad Preview"
              url={row.primaryAd?.previewLink}
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
// Render pagination — 60 rows/page per section (Untested + Ad Run, list AND
// cards). Mounting all ~670 Ad Run row groups (thumbnails + expanders) froze
// the main thread; only the DOM is windowed — search/filters/KPIs/donut keep
// operating on the FULL set. Pager strip mirrors the sheets grid pager.
// ---------------------------------------------------------------------------

const RENDER_PAGE_SIZE = 60;

function SectionPager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= RENDER_PAGE_SIZE) return null;
  const pageCount = Math.max(1, Math.ceil(total / RENDER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const first = safePage * RENDER_PAGE_SIZE + 1;
  const last = Math.min((safePage + 1) * RENDER_PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between gap-2 mt-2 rounded-xl border border-border bg-bg-surface/50 px-3 py-2 sm:px-4">
      <button
        type="button"
        onClick={() => onPage(Math.max(0, safePage - 1))}
        disabled={safePage === 0}
        className="inline-flex min-h-[2.2rem] items-center gap-1 rounded-[9px] border border-border bg-bg-white px-3 text-[0.72rem] font-bold text-text-secondary transition-colors hover:bg-bg-alt disabled:opacity-40"
      >
        ← Prev
      </button>
      <span className="text-[0.68rem] tabular text-text-secondary">
        Rows {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of{" "}
        {total.toLocaleString("en-IN")} · page {safePage + 1}/{pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(pageCount - 1, safePage + 1))}
        disabled={safePage >= pageCount - 1}
        className="inline-flex min-h-[2.2rem] items-center gap-1 rounded-[9px] border border-border bg-bg-white px-3 text-[0.72rem] font-bold text-text-secondary transition-colors hover:bg-bg-alt disabled:opacity-40"
      >
        Next →
      </button>
    </div>
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
  // Thumbnails only exist for warehouse-matched rows — in practice a matched
  // row is never Untested, but keep the column self-healing if that changes.
  const hasThumbs = rows.some(rowHasThumb);
  if (!rows.length)
    return (
      <div className="bento-tile ob-list-wrap ad-status-list-wrap">
        <table className="ob-list-table">
          <tbody>
            <tr>
              <td
                colSpan={8}
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
    <div className="bento-tile ob-list-wrap ad-status-list-wrap">
      <div>
        <table className="ob-list-table">
          <colgroup>
            {hasThumbs && <col className="ad-col-thumb" />}
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
              {hasThumbs && <th data-column-id="ad_thumb">Ad</th>}
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
              <tr
                key={r.postId}
                className="cursor-pointer"
                {...rowClickProps(
                  () => onOverview(r),
                  `Open ad overview — ${r.name || r.username || r.postIdShort || r.postId}`,
                )}
              >
                {hasThumbs && (
                  <td data-column-id="ad_thumb">
                    <RowThumb row={r} />
                  </td>
                )}
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
                    stopPropagation
                  />
                </td>
                <td data-column-id="actions">
                  <span className="ob-row-action">
                    <button
                      type="button"
                      className="action-btn action-btn--view"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOverview(r);
                      }}
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
            <span className="post-id tabular">{r.postIdShort || r.postId}</span>
            {r.collabId && (
              <span className="campaign-chip tabular" title="Collab ID">
                {r.collabId}
              </span>
            )}
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

/** Metric cells shared by the primary row and each expanded sibling ad. */
function AdMetricCells({ ad }: { ad: WarehouseAd | null }) {
  return (
    <>
      <td className="tabular">{ad ? formatDate(ad.adCreated) : "—"}</td>
      <td className="tabular font-semibold">
        {ad ? formatRupees(ad.amountSpent) : "—"}
      </td>
      <td className="tabular">{roasText(ad)}</td>
      <td className="tabular">{ad ? formatNumber(ad.ftewvCount) : "—"}</td>
      <td className="tabular">{ad ? formatNumber(ad.ncpCount) : "—"}</td>
      <td className="tabular">{ad ? formatNumber(ad.shopifyOrders) : "—"}</td>
    </>
  );
}

/**
 * One Ad Run row group — FIRST-occurrence ad inline; "+N more ads" expands
 * the remaining warehouse ads (occurrence order) as sibling rows with the
 * same columns. The whole row opens the Ad Overview modal.
 */
function AdRunRowGroup({
  row,
  onOverview,
}: {
  row: AdStatusRow;
  onOverview: (row: AdStatusRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const primary = row.primaryAd;
  const extras = row.ads.filter((ad) => ad !== primary);
  const clickProps = rowClickProps(
    () => onOverview(row),
    `Open ad overview — ${row.name || row.username || row.postIdShort || row.postId}`,
  );

  return (
    <>
      <tr className="cursor-pointer" {...clickProps}>
        <td data-column-id="ad_thumb">
          <RowThumb row={row} />
        </td>
        <td data-column-id="ad_name">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="truncate font-bold text-text-primary text-[0.8rem]"
                title={primary?.adName || row.name || undefined}
              >
                {primary?.adName || row.name || row.postIdShort || "—"}
              </span>
              {row.source === "historic" && <HistoricChip />}
              {row.retiredId && <RetiredIdChip />}
            </div>
            <div className="flex items-center gap-2 text-[0.72rem] text-text-tertiary min-w-0">
              <span className="truncate">
                @{row.username || "—"} · {row.postIdShort || row.postId}
              </span>
              {extras.length > 0 && (
                <button
                  type="button"
                  className="ad-more-toggle"
                  aria-expanded={open}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                  }}
                >
                  {open ? "Hide ads" : `+${extras.length} more ad${extras.length > 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          </div>
        </td>
        <AdMetricCells ad={primary} />
        <td>
          <RowStatusBadge row={row} />
        </td>
        <td className="ad-links-cell">
          {primary ? (
            <AdLinkChips ad={primary} />
          ) : (
            <LinkChips post={row.linkToPost} />
          )}
        </td>
        <td data-column-id="actions">
          <span className="ob-row-action">
            <button
              type="button"
              className="action-btn action-btn--view"
              onClick={(e) => {
                e.stopPropagation();
                onOverview(row);
              }}
            >
              <Eye size={11} aria-hidden />
              Overview
            </button>
          </span>
        </td>
      </tr>
      {open &&
        extras.map((ad) => (
          <tr key={ad.adId} className="ad-extra-row cursor-pointer" {...clickProps}>
            <td data-column-id="ad_thumb">
              <AdImg
                ad={ad}
                alt={`Ad creative — ${ad.adName}`}
                size={36}
                postUrl={row.linkToPost}
                igUsername={row.username}
              />
            </td>
            <td data-column-id="ad_name">
              <div className="min-w-0">
                <span
                  className="block truncate text-[0.76rem] text-text-secondary"
                  title={ad.adName}
                >
                  {ad.adName}
                </span>
              </div>
            </td>
            <AdMetricCells ad={ad} />
            <td>
              <WhCategoryBadge category={ad.category || "—"} />
            </td>
            <td className="ad-links-cell">
              <AdLinkChips ad={ad} />
            </td>
            <td data-column-id="actions" />
          </tr>
        ))}
    </>
  );
}

function AdRunListTable({
  rows,
  onOverview,
}: {
  rows: AdStatusRow[];
  onOverview: (row: AdStatusRow) => void;
}) {
  if (!rows.length)
    return (
      <div className="bento-tile ob-list-wrap ad-status-list-wrap">
        <table className="ob-list-table">
          <tbody>
            <tr>
              <td
                colSpan={11}
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
    <div className="bento-tile ob-list-wrap ad-status-list-wrap">
      <div>
        <table className="ob-list-table ad-run-table">
          <colgroup>
            <col className="ad-col-thumb" />
            <col className="ad-col-ad-name" />
            <col className="ad-col-created" />
            <col className="ad-col-spend" />
            <col className="ad-col-metric" />
            <col className="ad-col-metric" />
            <col className="ad-col-metric" />
            <col className="ad-col-metric" />
            <col className="ad-col-classification" />
            <col className="ad-col-links" />
            <col className="ad-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th data-column-id="ad_thumb">Ad</th>
              <th data-column-id="ad_name">Ad Name / Creator</th>
              <th>Created</th>
              <th>Spend</th>
              <th>ROAS</th>
              <th>FTEWV</th>
              <th>NCP</th>
              <th>Shop. Orders</th>
              <th>Status</th>
              <th>Links</th>
              <th data-column-id="actions">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <AdRunRowGroup key={r.postId} row={r} onOverview={onOverview} />
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
      {rows.map((r) => {
        const primary = r.primaryAd;
        const extras = r.ads.filter((ad) => ad !== primary);
        const wonClass =
          r.warehouseCategory === "Incremental Winner" ||
          r.warehouseCategory === "Winner" ||
          r.adsResults === "Winner";
        const lostClass =
          r.warehouseCategory === "Discarded" ||
          r.adsResults === "Discarded" ||
          r.adsResults === "Discarded but analyse";
        return (
          <article
            key={r.postId}
            className={cn(
              "ob-card ad-status-card",
              wonClass && "ob-card-onboarded",
              lostClass && "ob-card-pending",
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
                <div className="ob-card-name">
                  {r.name || r.username || "—"}
                </div>
                {r.username && (
                  <div className="ob-card-handle">@{r.username}</div>
                )}
              </div>
              {rowHasThumb(r) && primary && (
                <AdImg
                  ad={primary}
                  alt={`Ad creative — ${r.username || r.postIdShort}`}
                  size={44}
                  className="ad-card-thumb"
                  postUrl={r.linkToPost}
                  igUsername={r.username}
                />
              )}
            </div>

            <div className="ob-card-pills">
              <RowStatusBadge row={r} />
              {r.source === "historic" && <HistoricChip />}
              {r.retiredId && <RetiredIdChip />}
              <span className="post-id tabular">
                {r.postIdShort || r.postId}
              </span>
              {r.collabId && (
                <span className="campaign-chip tabular" title="Collab ID">
                  {r.collabId}
                </span>
              )}
              {r.campaign && (
                <span className="campaign-chip">{r.campaign}</span>
              )}
              {/* Legacy ads_status pill only when the warehouse doesn't know
                  the post — a matched card already shows the live delivery
                  status; the stale local value would contradict it. */}
              {r.adsStatus && !r.ads.length && (
                <AdRunStatusPill value={r.adsStatus} />
              )}
              {r.adsUsageRights && (
                <span className="pill pill--info">
                  <ShieldCheck size={10} aria-hidden />
                  Ads: {r.adsUsageRights}
                </span>
              )}
            </div>

            <dl className="ob-card-meta-grid ad-status-card-meta">
              {primary ? (
                <>
                  <div className="ob-card-meta">
                    <span className="ob-card-meta-label">Spend</span>
                    <span className="ob-card-meta-val tabular">
                      {formatRupees(primary.amountSpent)}
                    </span>
                  </div>
                  <div className="ob-card-meta">
                    <span className="ob-card-meta-label">ROAS</span>
                    <span className="ob-card-meta-val tabular">
                      {roasText(primary)}
                    </span>
                  </div>
                  <div className="ob-card-meta">
                    <span className="ob-card-meta-label">FTEWV</span>
                    <span className="ob-card-meta-val tabular">
                      {formatNumber(primary.ftewvCount)}
                    </span>
                  </div>
                  <div className="ob-card-meta">
                    <span className="ob-card-meta-label">NCP</span>
                    <span className="ob-card-meta-val tabular">
                      {formatNumber(primary.ncpCount)}
                    </span>
                  </div>
                  <div className="ob-card-meta">
                    <span className="ob-card-meta-label">Shop. Orders</span>
                    <span className="ob-card-meta-val tabular">
                      {formatNumber(primary.shopifyOrders)}
                    </span>
                  </div>
                  <div className="ob-card-meta">
                    <span className="ob-card-meta-label">Ad Created</span>
                    <span className="ob-card-meta-val tabular">
                      {formatDate(primary.adCreated) || "—"}
                    </span>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
              <div className="ob-card-meta ad-status-card-partnership">
                <span className="ob-card-meta-label">Partnership</span>
                <span className="ob-card-meta-val tabular">
                  {r.source === "historic" ? (
                    <span className="text-text-tertiary font-normal">—</span>
                  ) : (
                    <PartnershipKeyEdit
                      postId={r.postId}
                      value={r.partnershipId}
                      compact
                      stopPropagation
                    />
                  )}
                </span>
              </div>
            </dl>

            {extras.length > 0 && (
              <details className="ad-card-more">
                <summary>
                  +{extras.length} more ad{extras.length > 1 ? "s" : ""}
                </summary>
                <ul>
                  {extras.map((ad) => (
                    <li key={ad.adId}>
                      <AdImg
                        ad={ad}
                        alt={`Ad creative — ${ad.adName}`}
                        size={28}
                        postUrl={r.linkToPost}
                        igUsername={r.username}
                      />
                      <div className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[0.74rem] font-semibold text-text-secondary"
                          title={ad.adName}
                        >
                          {ad.adName}
                        </span>
                        <span className="block text-[0.7rem] text-text-tertiary tabular">
                          {formatRupees(ad.amountSpent)} · {roasText(ad)}
                        </span>
                      </div>
                      <WhCategoryBadge category={ad.category || "—"} />
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <CardLinkActions
              post={r.linkToPost}
              drive={r.downloadLink}
              landing={primary?.adLink}
              preview={primary?.previewLink}
            />

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
        );
      })}
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
        `${r.name} ${r.username} ${r.postId} ${r.postIdShort} ${r.primaryAd?.adName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // Ad Status = the row's DISPLAYED delivery status: the first-occurrence
    // ad's Meta status (ACTIVE/PAUSED/…) when matched, else the legacy field.
    // Exact match — "paused" must not also swallow "campaign_paused".
    if (adStatus) {
      const effective = (r.primaryAd?.adStatus || r.adsStatus || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
      if (effective !== adStatus) return false;
    }
    return true;
  };

  const filteredUntested = useMemo(() => {
    // When classification is "untested only", show untested; otherwise always show untested
    // (classification filter targets adRun section). matchesBase drops them
    // under an adStatus filter (no warehouse ad → no delivery status).
    return untested.filter(matchesBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untested, q, adStatus]);

  const filteredAdRun = useMemo(() => {
    // __untested special value → collapse run section
    if (classification === "__untested") return [];
    return adRun.filter((r) => {
      if (!matchesBase(r)) return false;
      // Classification matches either vocabulary: legacy result (Winner/ITE/…)
      // or warehouse category (Incremental Winner / P0 analysis / …).
      if (
        classification &&
        r.adsResults !== classification &&
        r.warehouseCategory !== classification
      )
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adRun, q, classification, adStatus]);

  const total = filteredUntested.length + filteredAdRun.length;

  // ── Render pagination — one page state per section, shared by the mobile
  // and desktop wrappers (only one is visible at a time). Filters/search/
  // view changes land back on page 1; safe-clamping covers shrinking sets.
  const [untestedPage, setUntestedPage] = useState(0);
  const [adRunPage, setAdRunPage] = useState(0);
  useEffect(() => {
    setUntestedPage(0);
    setAdRunPage(0);
  }, [q, classification, adStatus, filters.campaign, view]);

  const safeUntestedPage = Math.min(
    untestedPage,
    Math.max(0, Math.ceil(filteredUntested.length / RENDER_PAGE_SIZE) - 1),
  );
  const safeAdRunPage = Math.min(
    adRunPage,
    Math.max(0, Math.ceil(filteredAdRun.length / RENDER_PAGE_SIZE) - 1),
  );
  const pagedUntested = useMemo(
    () =>
      filteredUntested.slice(
        safeUntestedPage * RENDER_PAGE_SIZE,
        (safeUntestedPage + 1) * RENDER_PAGE_SIZE,
      ),
    [filteredUntested, safeUntestedPage],
  );
  const pagedAdRun = useMemo(
    () =>
      filteredAdRun.slice(
        safeAdRunPage * RENDER_PAGE_SIZE,
        (safeAdRunPage + 1) * RENDER_PAGE_SIZE,
      ),
    [filteredAdRun, safeAdRunPage],
  );

  // Analytics bento — warehouse category breakdown (first-occurrence ad's
  // category per post)
  const catCount = (c: string) =>
    adRun.filter((r) => r.warehouseCategory === c).length;
  const classSlices: DonutSeg[] = [
    { name: "Untested", value: untested.length, color: "#9A9384" },
    {
      name: "Incr. Winner",
      value: catCount("Incremental Winner"),
      color: "#3D6B3B",
    },
    { name: "Winner", value: catCount("Winner"), color: "#4F7C4D" },
    { name: "P0", value: catCount("P0 analysis"), color: "#3B6FD4" },
    { name: "P1", value: catCount("P1 analysis"), color: "#B57514" },
    { name: "P2", value: catCount("P2 analysis"), color: "#D19E3F" },
    { name: "Discarded", value: catCount("Discarded"), color: "#C0392B" },
    {
      name: "Uncategorised",
      value: adRun.filter((r) => r.warehouseCategory == null).length,
      color: "#7B4FBF",
    },
  ].filter((s) => s.value > 0);

  return (
    <>
      {/* Analytics bento — sits between KPI strip and board */}
      <section className="bento-stagger grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
        <DonutTile
          icon={<Trophy size={12} aria-hidden />}
          title="Ad Classification"
          segs={classSlices}
          centreLabel="Total"
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
          <UntestedCardsGrid rows={pagedUntested} onOverview={setOverviewRow} />
        </div>
        {/* Desktop: respect toggle */}
        <div className="hidden md:block">
          {view === "list" ? (
            <UntestedListTable
              rows={pagedUntested}
              onOverview={setOverviewRow}
            />
          ) : (
            <UntestedCardsGrid
              rows={pagedUntested}
              onOverview={setOverviewRow}
            />
          )}
        </div>
        <SectionPager
          page={safeUntestedPage}
          total={filteredUntested.length}
          onPage={setUntestedPage}
        />

        {/* Section 2 — Ad Run Status */}
        <SectionHead
          dot="purple"
          title="Ad Run Status"
          count={filteredAdRun.length}
        />
        {/* Mobile: always cards */}
        <div className="md:hidden">
          <AdRunCardsGrid rows={pagedAdRun} onOverview={setOverviewRow} />
        </div>
        {/* Desktop: respect toggle */}
        <div className="hidden md:block">
          {view === "list" ? (
            <AdRunListTable rows={pagedAdRun} onOverview={setOverviewRow} />
          ) : (
            <AdRunCardsGrid rows={pagedAdRun} onOverview={setOverviewRow} />
          )}
        </div>
        <SectionPager
          page={safeAdRunPage}
          total={filteredAdRun.length}
          onPage={setAdRunPage}
        />

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
