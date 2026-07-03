"use client";

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CalendarDays,
  Download,
  Eye,
  ExternalLink,
  HourglassIcon,
  Instagram,
  Megaphone,
  MousePointerClick,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  TrendingUp,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { PartnershipKeyEdit } from "@/components/ui/partnership-key-edit";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/ui/view-mode-toggle";
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

const AD_STATUS_VIEW_STORAGE_KEY = "creatorhub:ad-status:view";
const AD_STATUS_VIEW_OPTIONS: ViewMode[] = ["cards", "list"];
type AdStatusViewMode = Extract<ViewMode, "cards" | "list">;

const AD_STATUS_ACCENTS = {
  untested: "#B57514",
  meta: "#7B4FBF",
  winner: "#4F7C4D",
  incremental: "#3D6B3B",
  p0: "#3B6FD4",
  p1: "#B57514",
  p2: "#D19E3F",
  discarded: "#C0392B",
  historic: "#6E695E",
};

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

function rowAccent(row: AdStatusRow): string {
  if (row.warehouseCategory === "Incremental Winner")
    return AD_STATUS_ACCENTS.incremental;
  if (row.warehouseCategory === "Winner") return AD_STATUS_ACCENTS.winner;
  if (row.warehouseCategory === "P0 analysis") return AD_STATUS_ACCENTS.p0;
  if (row.warehouseCategory === "P1 analysis") return AD_STATUS_ACCENTS.p1;
  if (row.warehouseCategory === "P2 analysis") return AD_STATUS_ACCENTS.p2;
  if (row.warehouseCategory === "Discarded") return AD_STATUS_ACCENTS.discarded;
  if (row.source === "historic") return AD_STATUS_ACCENTS.historic;
  if (row.isInMetaAds) return AD_STATUS_ACCENTS.meta;
  return AD_STATUS_ACCENTS.untested;
}

function rowStatusText(row: AdStatusRow): string {
  if (row.warehouseCategory) return row.warehouseCategory;
  if (row.isInMetaAds) return "In Meta Ads";
  if (row.adsResults) return row.adsResults;
  return "Untested";
}

function rowPrimaryName(row: AdStatusRow): string {
  return row.primaryAd?.adName || row.name || row.username || row.postIdShort;
}

function rowSubline(row: AdStatusRow): string {
  return [
    row.username ? `@${row.username}` : null,
    row.campaign || null,
    row.postIdShort || row.postId,
  ]
    .filter(Boolean)
    .join(" · ");
}

function rowSpend(row: AdStatusRow): number {
  return row.primaryAd?.amountSpent ?? 0;
}

function rowRoas(row: AdStatusRow): number {
  return row.primaryAd?.roasMa ?? 0;
}

function rowDateTime(row: AdStatusRow): number {
  const parsed = Date.parse(row.postDate ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortAdRows(rows: AdStatusRow[], sortKey: string): AdStatusRow[] {
  const next = [...rows];
  switch (sortKey) {
    case "spend-desc":
      return next.sort((a, b) => rowSpend(b) - rowSpend(a));
    case "spend-asc":
      return next.sort((a, b) => rowSpend(a) - rowSpend(b));
    case "roas-desc":
      return next.sort((a, b) => rowRoas(b) - rowRoas(a));
    case "newest":
      return next.sort((a, b) => rowDateTime(b) - rowDateTime(a));
    case "oldest":
      return next.sort((a, b) => rowDateTime(a) - rowDateTime(b));
    case "days-desc":
      return next.sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1));
    default:
      return rows;
  }
}

function openOnEnter(
  event: React.KeyboardEvent<HTMLElement>,
  open: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  open();
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
}: {
  ad: WarehouseAd;
  alt: string;
  size?: number;
  className?: string;
  /** The organic Instagram post behind this ad — when present, the preview
   *  popup renders the live IG embed instead of the low-res Meta thumb. */
  postUrl?: string | null;
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
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
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
  onClose,
}: {
  ad: WarehouseAd;
  alt: string;
  postUrl?: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
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
        className="modal-panel modal-panel--lg modal-panel--onboarding campaign-detail-modal ad-lightbox-panel ad-preview-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ "--campaign-accent": AD_STATUS_ACCENTS.meta } as CSSProperties}
      >
        <header className="modal-head campaign-detail-head ad-lightbox-head ad-preview-head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <span className="campaign-card__id">
                {shortcode ? (
                  <Instagram size={12} aria-hidden />
                ) : (
                  <Megaphone size={12} aria-hidden />
                )}
                {shortcode ? "Instagram Creative" : "Meta Creative"}
              </span>
              {ad.category && <WhCategoryBadge category={ad.category} />}
            </div>
            <h2>Ad Preview</h2>
            <p className="campaign-detail-subtitle" title={ad.adName}>
              {ad.adName || "Creative details from the Meta warehouse"}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn campaign-detail-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="modal-body ad-lightbox-grid">
          <div className="ad-lightbox-media">
            <span className="ad-lightbox-media-label">
              {shortcode ? "Live Instagram embed" : "Meta creative fallback"}
            </span>
            {shortcode ? (
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

        <footer className="modal-foot ob-overview-footer ad-preview-footer">
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
// Shared: section header
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
  const totalSpend = adRun.reduce((sum, r) => sum + rowSpend(r), 0);
  const orders = adRun.reduce(
    (sum, r) => sum + (r.primaryAd?.shopifyOrders ?? 0),
    0,
  );

  const statTiles = [
    {
      label: "Win Rate",
      value: `${winRate}%`,
      color: AD_STATUS_ACCENTS.winner,
      sub: `${winners} winner-class`,
    },
    {
      label: "Review Coverage",
      value: `${classRate}%`,
      color: AD_STATUS_ACCENTS.p0,
      sub: `${classified}/${total || 0} reviewed`,
    },
    {
      label: "In Meta Ads",
      value: formatNumber(inMetaAds),
      color: AD_STATUS_ACCENTS.meta,
      sub: `${formatNumber(adRun.length)} matched rows`,
    },
  ];

  const funnel = [
    {
      label: "Eligible",
      value: total,
      color: AD_STATUS_ACCENTS.p0,
    },
    {
      label: "In Meta",
      value: inMetaAds,
      color: AD_STATUS_ACCENTS.meta,
    },
    {
      label: "Classified",
      value: classified,
      color: AD_STATUS_ACCENTS.untested,
    },
    {
      label: "Winners",
      value: winners,
      color: AD_STATUS_ACCENTS.winner,
    },
  ];

  return (
    <article className="bento-tile ad-performance-card">
      <TileHead
        icon={<BarChart3 size={12} aria-hidden />}
        info="Win Rate = Winner-class posts (Incremental Winner + Winner) ÷ reviewed posts. Review Coverage = posts with a warehouse category or legacy ads result ÷ all eligible posts. In Meta Ads = posts found on the Meta platform."
      >
        Performance Stats
      </TileHead>
      <div className="ad-performance-card__hero">
        <div>
          <span>Total eligible universe</span>
          <strong>{formatNumber(total)}</strong>
          <small>
            {formatRupees(totalSpend)} spend · {formatNumber(orders)} orders
          </small>
        </div>
        <div
          className="ad-performance-card__ring"
          style={
            {
              "--ad-ring": `${Math.min(100, Number(winRate)) * 3.6}deg`,
            } as CSSProperties
          }
        >
          <strong>{winRate}%</strong>
          <span>Win Rate</span>
        </div>
      </div>

      <div className="ad-performance-card__stats">
        {statTiles.map((t) => (
          <div
            key={t.label}
            style={{ "--ad-accent": t.color } as CSSProperties}
          >
            <strong>{t.value}</strong>
            <span>{t.label}</span>
            <small>{t.sub}</small>
          </div>
        ))}
      </div>

      <div
        className="ad-performance-card__funnel"
        aria-label="Ad status funnel"
      >
        {funnel.map((item) => (
          <div key={item.label}>
            <div>
              <span>{item.label}</span>
              <strong>{formatNumber(item.value)}</strong>
            </div>
            <span
              className="ad-performance-card__bar"
              style={
                {
                  "--ad-accent": item.color,
                  "--ad-width": `${total > 0 ? Math.max(3, Math.round((item.value / total) * 100)) : 0}%`,
                } as CSSProperties
              }
            />
          </div>
        ))}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Overview modal — same shell as posting overview
// ---------------------------------------------------------------------------

function LinkRow({
  icon,
  label,
  url,
}: {
  icon: React.ReactNode;
  label: string;
  url?: string | null;
}) {
  const hasUrl = isHttpUrl(url);
  return (
    <div className="pt-overview-link-row ad-detail-link-row">
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

function isHttpUrl(url?: string | null) {
  return !!url && /^https?:\/\//i.test(url);
}

function AdDetailMetric({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={cn(mono && "tabular")}>{value || "—"}</dd>
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
  const accent = rowAccent(row);
  const deliveryLabel = matched
    ? prettyAdDeliveryStatus(firstAd?.adStatus)
    : row.adsStatus || "Pending";
  const classificationLabel = matched
    ? row.warehouseCategory || "Needs review"
    : row.adsResults || "Untested";
  const adSpend = row.ads.reduce((sum, ad) => sum + ad.amountSpent, 0);
  const adOrders = row.ads.reduce((sum, ad) => sum + ad.shopifyOrders, 0);
  const adImpressions = row.ads.reduce((sum, ad) => sum + ad.impressions, 0);
  const profileSlug = row.username?.replace(/^@+/, "").trim();
  const profileUrl = profileSlug
    ? `https://www.instagram.com/${profileSlug}/`
    : null;
  const detailLinks = [
    {
      icon: <Download size={12} aria-hidden />,
      label: "Drive Download Link",
      url: row.downloadLink,
    },
    {
      icon: <ExternalLink size={12} aria-hidden />,
      label: "Ad Landing Page",
      url: row.primaryAd?.adLink,
    },
    {
      icon: <Eye size={12} aria-hidden />,
      label: "Meta Ad Preview",
      url: row.primaryAd?.previewLink,
    },
  ].filter((link) => isHttpUrl(link.url));

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
        className="modal-panel modal-panel--lg modal-panel--onboarding campaign-detail-modal ob-overview-modal ad-overview-modal ad-detail-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ "--campaign-accent": accent } as CSSProperties}
      >
        <header className="modal-head campaign-detail-head ad-detail-head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <span className="campaign-card__id tabular">
                {row.postIdShort || row.postId}
              </span>
              {row.collabId && (
                <span className="campaign-card__status tabular">
                  {row.collabId}
                </span>
              )}
              <RowStatusBadge row={row} />
              {row.source === "historic" && <HistoricChip />}
              {row.retiredId && <RetiredIdChip />}
            </div>
            <h2>{row.name || row.username || row.postIdShort}</h2>
            <p className="campaign-detail-subtitle">
              {row.username ? `@${row.username}` : "Creator profile"} ·{" "}
              {row.campaign || "No campaign"} · {classificationLabel}
            </p>
          </div>
          <div className="modal-head__actions">
            {profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost campaign-detail-edit-btn"
              >
                <UserRound size={14} aria-hidden />
                Profile
              </a>
            )}
            {row.linkToPost && (
              <a
                href={row.linkToPost}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost campaign-detail-edit-btn"
              >
                <Instagram size={14} aria-hidden />
                Post
              </a>
            )}
            <button
              type="button"
              className="icon-btn campaign-detail-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="modal-body campaign-detail-body ad-detail-body">
          <section className="campaign-detail-overview ad-detail-overview">
            <div className="campaign-detail-allocation-card ad-detail-profile-card">
              <div className="ad-detail-avatar-frame">
                <RowThumb row={row} size={74} />
              </div>
              <div className="campaign-detail-allocation-copy">
                <span>Creator / Creative</span>
                <strong>{row.name || row.username || "—"}</strong>
                <p className="ad-detail-profile-sub">
                  @{row.username || "—"} · {row.category || "No tier"}
                </p>
                <span className="campaign-detail-progress-track ad-detail-progress-track">
                  <span
                    style={
                      {
                        "--ad-width": row.isInMetaAds ? "100%" : "8%",
                        "--ad-accent": accent,
                      } as CSSProperties
                    }
                  />
                </span>
                <div className="campaign-detail-quick-actions">
                  <span className="campaign-detail-reachout-button">
                    <Megaphone size={13} aria-hidden />
                    {row.isInMetaAds ? "In Meta Ads" : "Not in Meta Ads"}
                  </span>
                  <span className="campaign-detail-reachout-button">
                    <Eye size={13} aria-hidden />
                    {classificationLabel}
                  </span>
                </div>
              </div>
            </div>

            <dl className="campaign-detail-stat-grid ad-detail-stat-grid">
              <AdDetailMetric
                label="Campaign"
                value={row.campaign || "—"}
              />
              <AdDetailMetric
                label="Post Date"
                value={formatDate(row.postDate) || "—"}
                mono
              />
              <AdDetailMetric label="Delivery" value={deliveryLabel} />
              <AdDetailMetric
                label="Followers"
                value={
                  row.followers != null ? row.followers.toLocaleString() : "—"
                }
                mono
              />
              <AdDetailMetric
                label="Meta Ads"
                value={row.isInMetaAds ? "Matched" : "Not matched"}
              />
              <AdDetailMetric label="Ads" value={row.ads.length} mono />
            </dl>
          </section>

          <section className="campaign-detail-section ad-detail-section">
            <div className="campaign-detail-section-head">
              <div>
                <h3>Post Context</h3>
                <p>
                  Warehouse status and creator-level fields used to classify
                  this post for Ads Status.
                </p>
              </div>
              <strong>{classificationLabel}</strong>
            </div>
            <dl className="campaign-detail-stat-grid ad-detail-context-grid">
              <AdDetailMetric
                label="Post ID"
                value={
                  row.collabId ? `${row.postId} · ${row.collabId}` : row.postId
                }
                mono
              />
              <AdDetailMetric
                label="Partnership ID"
                value={row.partnershipId || "—"}
                mono
              />
              <AdDetailMetric
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
              <AdDetailMetric
                label="Collab Type"
                value={row.collabType || "—"}
              />
              <AdDetailMetric
                label="Ads Usage Rights"
                value={row.adsUsageRights || "—"}
              />
              <AdDetailMetric
                label="Workflow"
                value={workflowStatusLabel(row.workflowStatus)}
              />
            </dl>
          </section>

          {row.ads.length > 0 && (
            <section className="campaign-detail-section ad-detail-ad-section">
              <div className="campaign-detail-section-head">
                <div>
                  <h3>Meta Ads Performance</h3>
                  <p>
                    {formatNumber(row.ads.length)} creative
                    {row.ads.length > 1 ? "s" : ""} ·{" "}
                    {formatNumber(adImpressions)} impressions ·{" "}
                    {formatNumber(adOrders)} orders
                  </p>
                </div>
                <strong>{formatRupees(adSpend)}</strong>
              </div>
              <ul className="ad-detail-ad-list">
                {/* `ads` is first-occurrence order (earliest created first) —
                    entry 0 IS the first-occurrence ad. */}
                {row.ads.map((ad, i) => (
                  <li key={ad.adId} className="ad-detail-ad-card">
                    <AdImg
                      ad={ad}
                      alt={`Ad creative — ${ad.adName}`}
                      size={44}
                      postUrl={row.linkToPost}
                    />
                    <div className="ad-detail-ad-main">
                      <span className="ad-detail-ad-name" title={ad.adName}>
                        {ad.adName}
                      </span>
                      <dl className="ad-detail-ad-metrics">
                        <div>
                          <dt>Spend</dt>
                          <dd>{formatRupees(ad.amountSpent)}</dd>
                        </div>
                        <div>
                          <dt>ROAS</dt>
                          <dd>{roasText(ad)}</dd>
                        </div>
                        <div>
                          <dt>Impr.</dt>
                          <dd>{formatNumber(ad.impressions)}</dd>
                        </div>
                        <div>
                          <dt>Orders</dt>
                          <dd>{formatNumber(ad.shopifyOrders)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="ad-detail-ad-actions">
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
                            ? "First winner"
                            : "First occurrence"}
                        </span>
                      )}
                      <WhCategoryBadge category={ad.category || "—"} />
                      <AdLinkChips ad={ad} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detailLinks.length > 0 && (
            <section className="campaign-detail-section ad-detail-links">
              <div className="campaign-detail-section-head">
                <div>
                  <h3>Links</h3>
                  <p>
                    Open creative assets, landing pages, or warehouse previews.
                  </p>
                </div>
              </div>
              {detailLinks.map((link) => (
                <LinkRow
                  key={link.label}
                  icon={link.icon}
                  label={link.label}
                  url={link.url}
                />
              ))}
            </section>
          )}
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
  if (!rows.length)
    return (
      <div className="campaign-filter-empty ad-status-empty">
        <Megaphone size={24} aria-hidden />
        <strong>No untested ads</strong>
        <span>
          Warehouse classified everything in the current filter scope.
        </span>
      </div>
    );
  return (
    <div className="campaign-list-view ad-status-list-view">
      {rows.map((r, index) => {
        const open = () => onOverview(r);
        return (
          <article
            key={r.postId}
            className="campaign-list-row ad-status-list-row ad-status-list-row--untested"
            style={
              {
                "--campaign-accent": AD_STATUS_ACCENTS.untested,
                "--campaign-card-index": String(index),
              } as CSSProperties
            }
            tabIndex={0}
            aria-label={`Open ad overview for ${r.name || r.username || r.postIdShort}`}
            onClick={open}
            onKeyDown={(event) => openOnEnter(event, open)}
          >
            <div className="campaign-list-row__main ad-status-list-row__main">
              <div className="ad-status-list-row__identity">
                <RowThumb row={r} />
                <div className="min-w-0">
                  <div className="campaign-card__id-row ad-status-list-row__chipline">
                    <span className="campaign-card__id">
                      <strong>{r.postIdShort || r.postId}</strong>
                    </span>
                    <AsClassBadge value="" />
                  </div>
                  <h3>{r.name || r.username || "Unknown creator"}</h3>
                  <p>{rowSubline(r)}</p>
                </div>
              </div>
            </div>

            <div className="campaign-list-row__allocation ad-status-list-row__signal">
              <div>
                <span>Pending Sync</span>
                <strong>
                  <DaysSince days={r.daysSince} />
                </strong>
              </div>
              <span className="campaign-list-row__reachouts">
                <span>
                  <ShieldCheck size={12} aria-hidden />
                  {r.adsUsageRights || "Ads rights pending"}
                </span>
              </span>
            </div>

            <dl className="campaign-list-row__stats ad-status-list-row__stats">
              <div>
                <dt>Post Date</dt>
                <dd>{formatDate(r.postDate) || "—"}</dd>
              </div>
              <div>
                <dt>Campaign</dt>
                <dd>{r.campaign || "—"}</dd>
              </div>
              <div>
                <dt>Collab</dt>
                <dd>{r.collabId || r.collabType || "—"}</dd>
              </div>
              <div>
                <dt>Partnership</dt>
                <dd>
                  <PartnershipKeyEdit
                    postId={r.postId}
                    value={r.partnershipId}
                    compact
                    stopPropagation
                  />
                </dd>
              </div>
            </dl>

            <div className="campaign-list-row__actions ad-status-list-row__actions">
              <button
                type="button"
                className="campaign-list-action campaign-list-action--brief"
                onClick={(event) => {
                  event.stopPropagation();
                  onOverview(r);
                }}
              >
                <Eye size={13} aria-hidden />
                View
              </button>
              {r.linkToPost && (
                <a
                  href={r.linkToPost}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="campaign-list-action"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Instagram size={13} aria-hidden />
                  Post
                </a>
              )}
              {r.downloadLink && (
                <a
                  href={r.downloadLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="campaign-list-action"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Download size={13} aria-hidden />
                  Drive
                </a>
              )}
            </div>
          </article>
        );
      })}
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
      <div className="campaign-filter-empty ad-status-empty">
        <Megaphone size={24} aria-hidden />
        <strong>No untested ads</strong>
        <span>
          Warehouse classified everything in the current filter scope.
        </span>
      </div>
    );
  return (
    <div className="campaign-card-grid ad-status-card-grid">
      {rows.map((r, index) => (
        <article
          key={r.postId}
          className="campaign-card ad-status-campaign-card ad-status-campaign-card--untested"
          style={
            {
              "--campaign-accent": AD_STATUS_ACCENTS.untested,
              "--campaign-card-index": String(index),
            } as CSSProperties
          }
          tabIndex={0}
          aria-label={`Open ad overview for ${r.name || r.username || r.postIdShort}`}
          onClick={() => onOverview(r)}
          onKeyDown={(event) => openOnEnter(event, () => onOverview(r))}
        >
          <div className="campaign-card__head">
            <div className="min-w-0">
              <div className="campaign-card__id-row">
                <span className="campaign-card__id">
                  <strong>{r.postIdShort || r.postId}</strong>
                </span>
                <AsClassBadge value="" />
              </div>
              <h3>{r.name || r.username || "Unknown creator"}</h3>
            </div>
            <RowThumb row={r} size={46} />
          </div>

          <p className="campaign-card__message">{rowSubline(r) || "—"}</p>

          <div className="campaign-card__progress ad-status-card-progress">
            <div>
              <span>Warehouse Classification</span>
              <strong>Pending</strong>
            </div>
            <span className="campaign-card__progress-track">
              <span style={{ width: "18%" }} />
            </span>
          </div>

          <dl className="campaign-card__facts ad-status-card-facts">
            <div>
              <dt>
                <CalendarDays size={11} aria-hidden />
                Posted
              </dt>
              <dd>{formatDate(r.postDate) || "—"}</dd>
            </div>
            <div>
              <dt>
                <HourglassIcon size={11} aria-hidden />
                Waiting
              </dt>
              <dd>
                <DaysSince days={r.daysSince} ago />
              </dd>
            </div>
            <div>
              <dt>
                <ShieldCheck size={11} aria-hidden />
                Rights
              </dt>
              <dd>{r.adsUsageRights || "—"}</dd>
            </div>
          </dl>

          <div className="campaign-card__meta-row">
            {r.campaign && <span>{r.campaign}</span>}
            {r.collabId && <span>{r.collabId}</span>}
            <span onClick={(event) => event.stopPropagation()}>
              <PartnershipKeyEdit
                postId={r.postId}
                value={r.partnershipId}
                compact
                stopPropagation
              />
            </span>
          </div>

          <div className="campaign-card__actions">
            <div className="campaign-card__primary-actions">
              <button
                type="button"
                className="btn"
                onClick={(event) => {
                  event.stopPropagation();
                  onOverview(r);
                }}
              >
                <Eye size={13} aria-hidden /> View
              </button>
            </div>
            <div className="campaign-card__secondary-actions">
              {r.linkToPost && (
                <a
                  href={r.linkToPost}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="campaign-brief-link"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Instagram size={13} aria-hidden />
                  Post
                </a>
              )}
              {r.downloadLink && (
                <a
                  href={r.downloadLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="campaign-brief-link"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Download size={13} aria-hidden />
                  Drive
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad Run section — list
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
      <div className="campaign-filter-empty ad-status-empty">
        <Search size={24} aria-hidden />
        <strong>No ads match filters</strong>
        <span>Try a different campaign, status, or classification.</span>
      </div>
    );
  return (
    <div className="campaign-list-view ad-status-list-view">
      {rows.map((r, index) => {
        const primary = r.primaryAd;
        const extras = r.ads.filter((ad) => ad !== primary);
        const accent = rowAccent(r);
        const open = () => onOverview(r);
        return (
          <article
            key={r.postId}
            className="campaign-list-row ad-status-list-row ad-status-list-row--run"
            style={
              {
                "--campaign-accent": accent,
                "--campaign-card-index": String(index),
              } as CSSProperties
            }
            tabIndex={0}
            aria-label={`Open ad overview for ${rowPrimaryName(r)}`}
            onClick={open}
            onKeyDown={(event) => openOnEnter(event, open)}
          >
            <div className="campaign-list-row__main ad-status-list-row__main">
              <div className="ad-status-list-row__identity">
                <RowThumb row={r} />
                <div className="min-w-0">
                  <div className="campaign-card__id-row ad-status-list-row__chipline">
                    <span className="campaign-card__id">
                      <strong>{r.postIdShort || r.postId}</strong>
                    </span>
                    <RowStatusBadge row={r} />
                  </div>
                  {(r.source === "historic" || r.retiredId) && (
                    <div className="ad-status-list-row__support-chips">
                      {r.source === "historic" && <HistoricChip />}
                      {r.retiredId && <RetiredIdChip />}
                    </div>
                  )}
                  <h3 title={rowPrimaryName(r)}>{rowPrimaryName(r)}</h3>
                  <p>{rowSubline(r)}</p>
                </div>
              </div>
            </div>

            <div className="campaign-list-row__allocation ad-status-list-row__signal">
              <div>
                <span>Meta Performance</span>
                <strong>{formatRupees(primary?.amountSpent ?? 0)}</strong>
              </div>
              <span className="campaign-list-row__reachouts">
                <span>
                  <MousePointerClick size={12} aria-hidden />
                  {extras.length > 0
                    ? `${extras.length + 1} ad variants`
                    : "First occurrence"}
                </span>
                <strong>{roasText(primary)}</strong>
              </span>
            </div>

            <dl className="campaign-list-row__stats ad-status-list-row__stats">
              <div>
                <dt>Created</dt>
                <dd>{formatDate(primary?.adCreated) || "—"}</dd>
              </div>
              <div>
                <dt>FTEWV</dt>
                <dd>{formatNumber(primary?.ftewvCount)}</dd>
              </div>
              <div>
                <dt>NCP</dt>
                <dd>{formatNumber(primary?.ncpCount)}</dd>
              </div>
              <div>
                <dt>Orders</dt>
                <dd>{formatNumber(primary?.shopifyOrders)}</dd>
              </div>
            </dl>

            <div className="campaign-list-row__actions ad-status-list-row__actions">
              <button
                type="button"
                className="campaign-list-action campaign-list-action--brief"
                onClick={(event) => {
                  event.stopPropagation();
                  onOverview(r);
                }}
              >
                <Eye size={13} aria-hidden />
                View
              </button>
              {primary?.previewLink && (
                <a
                  href={primary.previewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="campaign-list-action"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink size={13} aria-hidden />
                  Meta
                </a>
              )}
              {r.linkToPost && (
                <a
                  href={r.linkToPost}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="campaign-list-action"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Instagram size={13} aria-hidden />
                  Post
                </a>
              )}
            </div>
          </article>
        );
      })}
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
      <div className="campaign-filter-empty ad-status-empty">
        <Megaphone size={24} aria-hidden />
        <strong>No ads match filters</strong>
        <span>Try a different campaign, status, or classification.</span>
      </div>
    );
  return (
    <div className="campaign-card-grid ad-status-card-grid">
      {rows.map((r, index) => {
        const primary = r.primaryAd;
        const extras = r.ads.filter((ad) => ad !== primary);
        const accent = rowAccent(r);
        const classProgress =
          rowStatusText(r) === "Untested"
            ? 18
            : isWinnerCategory(r.warehouseCategory)
              ? 100
              : r.warehouseCategory === "Discarded"
                ? 100
                : 72;
        return (
          <article
            key={r.postId}
            className="campaign-card ad-status-campaign-card ad-status-campaign-card--run"
            style={
              {
                "--campaign-accent": accent,
                "--campaign-progress": `${classProgress}%`,
                "--campaign-card-index": String(index),
              } as CSSProperties
            }
            tabIndex={0}
            aria-label={`Open ad overview for ${rowPrimaryName(r)}`}
            onClick={() => onOverview(r)}
            onKeyDown={(event) => openOnEnter(event, () => onOverview(r))}
          >
            <div className="campaign-card__head">
              <div className="min-w-0">
                <div className="campaign-card__id-row">
                  <span className="campaign-card__id">
                    <strong>{r.postIdShort || r.postId}</strong>
                  </span>
                  <RowStatusBadge row={r} />
                </div>
                <h3 title={rowPrimaryName(r)}>{rowPrimaryName(r)}</h3>
              </div>
              <RowThumb row={r} size={46} />
            </div>

            <p className="campaign-card__message">{rowSubline(r) || "—"}</p>

            <div className="campaign-card__progress ad-status-card-progress">
              <div>
                <span>Ad Classification</span>
                <strong>{rowStatusText(r)}</strong>
              </div>
              <span className="campaign-card__progress-track">
                <span />
              </span>
            </div>

            <dl className="campaign-card__facts ad-status-card-facts">
              <div>
                <dt>
                  <BarChart3 size={11} aria-hidden />
                  Spend
                </dt>
                <dd>{formatRupees(primary?.amountSpent ?? 0)}</dd>
              </div>
              <div>
                <dt>
                  <TrendingUp size={11} aria-hidden />
                  ROAS
                </dt>
                <dd>{roasText(primary)}</dd>
              </div>
              <div>
                <dt>
                  <ShoppingBag size={11} aria-hidden />
                  Orders
                </dt>
                <dd>{formatNumber(primary?.shopifyOrders)}</dd>
              </div>
            </dl>

            <div className="campaign-card__meta-row">
              {r.source === "historic" && <HistoricChip />}
              {r.retiredId && <RetiredIdChip />}
              {r.collabId && (
                <span title="Collab ID">
                  <MousePointerClick size={11} aria-hidden />
                  {r.collabId}
                </span>
              )}
              {r.campaign && (
                <span>
                  <Megaphone size={11} aria-hidden />
                  {r.campaign}
                </span>
              )}
              {extras.length > 0 && (
                <span>
                  <BarChart3 size={11} aria-hidden />
                  {extras.length + 1} ad variants
                </span>
              )}
            </div>

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

            <div className="campaign-card__actions">
              <div className="campaign-card__primary-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOverview(r);
                  }}
                >
                  <Eye size={13} aria-hidden /> View
                </button>
                {primary?.previewLink && (
                  <a
                    href={primary.previewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="campaign-brief-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink size={13} aria-hidden />
                    Meta
                  </a>
                )}
              </div>
              <div className="campaign-card__secondary-actions">
                {r.linkToPost && (
                  <a
                    href={r.linkToPost}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="campaign-brief-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Instagram size={13} aria-hidden />
                    Post
                  </a>
                )}
                {r.downloadLink && (
                  <a
                    href={r.downloadLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="campaign-brief-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Download size={13} aria-hidden />
                    Drive
                  </a>
                )}
              </div>
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
  const [view, setView] = useState<AdStatusViewMode>("cards");
  const [overviewRow, setOverviewRow] = useState<AdStatusRow | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AD_STATUS_VIEW_STORAGE_KEY);
      if (stored === "cards" || stored === "list") setView(stored);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const q = (filters.search ?? "").trim().toLowerCase();
  const classification = filters.classification ?? "";
  const adStatus = (filters.adStatus ?? "").trim().toLowerCase();
  const sortKey = filters.sort ?? "";

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
    return sortAdRows(untested.filter(matchesBase), sortKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untested, q, adStatus, sortKey]);

  const filteredAdRun = useMemo(() => {
    // __untested special value → collapse run section
    if (classification === "__untested") return [];
    const filtered = adRun.filter((r) => {
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
    return sortAdRows(filtered, sortKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adRun, q, classification, adStatus, sortKey]);

  const total = filteredUntested.length + filteredAdRun.length;

  // ── Render pagination — one page state per section, shared by the mobile
  // and desktop wrappers (only one is visible at a time). Filters/search/
  // view changes land back on page 1; safe-clamping covers shrinking sets.
  const [untestedPage, setUntestedPage] = useState(0);
  const [adRunPage, setAdRunPage] = useState(0);
  useEffect(() => {
    setUntestedPage(0);
    setAdRunPage(0);
  }, [q, classification, adStatus, filters.campaign, sortKey, view]);

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
      <section className="bento-stagger ad-status-insights-grid">
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
        <div className="campaign-list-toolbar ad-status-board-toolbar">
          <div className="ad-status-board-toolbar__copy">
            <span>{formatNumber(total)} total</span>
            <strong>
              {formatNumber(filteredUntested.length)} untested ·{" "}
              {formatNumber(filteredAdRun.length)} in ad run
            </strong>
          </div>
          <div className="campaign-list-toolbar__meta ad-status-board-toolbar__meta">
            <span>
              Showing {formatNumber(total)} of{" "}
              {formatNumber(untested.length + adRun.length)}
            </span>
            <div className="hidden md:block">
              <ViewModeToggle
                storageKey={AD_STATUS_VIEW_STORAGE_KEY}
                options={AD_STATUS_VIEW_OPTIONS}
                defaultMode={view}
                onChange={(mode) => setView(mode as AdStatusViewMode)}
              />
            </div>
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
