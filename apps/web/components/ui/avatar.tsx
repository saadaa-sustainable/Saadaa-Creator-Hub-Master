"use client";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  formatDate,
  formatFollowers,
  formatRupees,
  workflowStatusLabel,
} from "@/lib/formatters";

export interface AvatarProps {
  src?: string | null;
  username?: string | null;
  name?: string | null;
  size?: number;
  verified?: boolean;
  className?: string;
  /** When false, the avatar is a plain image — no click-to-open creator overview.
   *  Use inside pickers/lists where the overview modal would stack awkwardly. */
  interactive?: boolean;
}

interface CreatorOverview {
  creator: Record<string, unknown>;
  stats: {
    postCount: number;
    onboardedCount: number;
    paidTotal: number;
    payableTotal: number;
    paymentCount: number;
  };
  posts: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}

function initialsFor(name?: string | null, username?: string | null): string {
  const base = (name ?? username ?? "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Shared avatar — renders the raw Instagram CDN URL with
 * `referrerPolicy="no-referrer"` (the browser sends no Referer, so fbcdn/
 * cdninstagram serve the image). The weserv proxy was replaced 2026-07-09: it
 * 403s on fbcdn URLs (~8k creators showed only initials). Falls back to initials
 * on error or missing src. Per `feedback_profile_image_consistency.md`: never
 * reinvent per-view — fix this shared component and every surface benefits.
 */
export function Avatar({
  src,
  username,
  name,
  size = 40,
  verified,
  className,
  interactive = true,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [overview, setOverview] = useState<CreatorOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const showImage = !!src && !failed;
  const label = name ?? username ?? "Avatar";
  // Only clickable when a handle exists AND the avatar is interactive.
  const handle = interactive ? (username?.trim().toLowerCase() ?? "") : "";

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  useEffect(() => {
    if (!previewOpen || !handle || overview) return;
    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError(null);
    fetch(`/api/creators/${encodeURIComponent(handle)}/overview`)
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Unable to load creator");
        return payload as CreatorOverview;
      })
      .then((payload) => {
        if (!cancelled) setOverview(payload);
      })
      .catch((error: Error) => {
        if (!cancelled) setOverviewError(error.message);
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handle, overview, previewOpen, false]);

  return (
    <>
      <div
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full bg-bg-muted text-text-secondary font-semibold overflow-hidden border border-border-warm",
          showImage && handle && "cursor-zoom-in",
          className,
        )}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          maxWidth: size,
          maxHeight: size,
          fontSize: Math.max(10, Math.floor(size * 0.36)),
        }}
        role={handle ? "button" : "img"}
        tabIndex={handle ? 0 : undefined}
        aria-label={handle ? `Open creator overview for ${label}` : label}
        onClick={(event) => {
          if (!handle) return;
          event.stopPropagation();
          setPreviewOpen(true);
        }}
        onKeyDown={(event) => {
          if (!handle) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setPreviewOpen(true);
          }
        }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src as string}
            alt={label}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <span>{initialsFor(name, username)}</span>
        )}
        {verified && (
          <span
            className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-info text-white text-[8px]"
            aria-label="Verified"
          >
            ✓
          </span>
        )}
      </div>
      {previewOpen &&
        handle &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="avatar-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Creator overview for ${label}`}
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className="creator-overview-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="avatar-preview-close"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close creator overview"
              >
                ×
              </button>
              <CreatorOverviewContent
                fallbackName={name}
                fallbackUsername={username}
                fallbackImage={src}
                overview={overview}
                loading={overviewLoading}
                error={overviewError}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function CreatorOverviewContent({
  fallbackName,
  fallbackUsername,
  fallbackImage,
  overview,
  loading,
  error,
}: {
  fallbackName?: string | null;
  fallbackUsername?: string | null;
  fallbackImage?: string | null;
  overview: CreatorOverview | null;
  loading: boolean;
  error: string | null;
}) {
  const creator = overview?.creator;
  const displayName =
    stringValue(creator?.inf_name) ?? fallbackName ?? fallbackUsername ?? "—";
  const username = stringValue(creator?.username) ?? fallbackUsername ?? "";
  const image = stringValue(creator?.profile_pic) ?? fallbackImage;
  const initials = initialsFor(displayName, username);
  const tier = stringValue(creator?.category) ?? "—";
  const engagementRate = percentValue(creator?.er ?? creator?.er_percent);

  return (
    <div className="creator-overview">
      <div className="creator-overview-profile-card">
        <div className="creator-overview-cover" />
        <div className="creator-overview-profile-body">
          <div className="creator-overview-avatar">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={displayName}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <span className="creator-overview-source">Creator Data</span>
          <strong>{displayName}</strong>
          {username && <span>@{username}</span>}
          <div className="creator-overview-tags">
            {tier !== "—" && <span>{tier}</span>}
            {stringValue(creator?.verification) && (
              <span>{stringValue(creator?.verification)}</span>
            )}
            {stringValue(creator?.gender) && (
              <span>{stringValue(creator?.gender)}</span>
            )}
          </div>
          <div className="creator-overview-stats">
            <OverviewKpi
              label="Followers"
              value={formatFollowers(numberValue(creator?.followers))}
            />
            <OverviewKpi label="Eng. Rate" value={engagementRate} />
            <OverviewKpi label="Tier" value={tier} />
            <OverviewKpi
              label="Avg Likes"
              value={compactNumber(creator?.avg_likes)}
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="creator-overview-state">Loading creator data...</div>
      )}
      {error && <div className="creator-overview-state is-error">{error}</div>}

      {overview && (
        <>
          <div className="creator-overview-summary">
            <OverviewKpi
              label="Paid"
              value={formatRupees(overview.stats.paidTotal)}
            />
            <OverviewKpi
              label="Payable"
              value={formatRupees(overview.stats.payableTotal)}
            />
            <OverviewKpi
              label="Posts"
              value={String(overview.stats.postCount)}
            />
            <OverviewKpi
              label="Payments"
              value={String(overview.stats.paymentCount)}
            />
          </div>

          <div className="creator-overview-grid creator-overview-grid--primary">
            <OverviewField label="Influencer ID" value={creator?.inf_id} mono />
            <OverviewField label="Email" value={creator?.email} />
            <OverviewField label="Contact" value={creator?.contact} />
            <OverviewField label="State" value={creator?.state} />
            <OverviewField
              label="Instagram"
              value={creator?.instagram_link ?? creator?.instagram_url}
            />
            <OverviewField
              label="Updated"
              value={formatDate(stringValue(creator?.updated_at))}
            />
          </div>

          <details className="creator-overview-section">
            <summary className="creator-overview-section-head">
              <strong>Recent Posts</strong>
              <span>{overview.stats.postCount} loaded</span>
            </summary>
            <div className="creator-overview-posts">
              {overview.posts.length === 0 ? (
                <p>No posts found.</p>
              ) : (
                overview.posts.slice(0, 6).map((post) => (
                  <div
                    key={String(post.post_id)}
                    className="creator-overview-post"
                  >
                    <strong>{stringValue(post.post_id) ?? "—"}</strong>
                    <span>
                      {workflowStatusLabel(stringValue(post.workflow_status))}
                    </span>
                    <span>{stringValue(post.campaign_id) ?? "—"}</span>
                  </div>
                ))
              )}
            </div>
          </details>

          <details className="creator-overview-section">
            <summary className="creator-overview-section-head">
              <strong>All Creator Fields</strong>
              <span>{Object.keys(creator ?? {}).length} columns</span>
            </summary>
            <div className="creator-overview-field-list">
              {Object.entries(creator ?? {})
                .filter(([key]) => key !== "profile_pic")
                .map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{displayValue(value)}</strong>
                  </div>
                ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function OverviewKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OverviewField({
  label,
  value,
  mono,
}: {
  label: string;
  value: unknown;
  mono?: boolean;
}) {
  const text = stringValue(value) ?? "—";
  const isUrl = /^https?:\/\//i.test(text);
  return (
    <div>
      <span>{label}</span>
      {isUrl ? (
        <a
          href={text}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("creator-overview-link", mono && "tabular")}
          title={text}
        >
          <ExternalLink size={11} aria-hidden />
          Open
        </a>
      ) : (
        <strong className={mono ? "tabular" : undefined}>{text}</strong>
      )}
    </div>
  );
}

function verificationLabel(value: unknown): string {
  const raw = stringValue(value)?.trim().toLowerCase() ?? "";
  if (["yes", "verified", "true", "1"].includes(raw)) return "Verified";
  if (["no", "not verified", "false", "0"].includes(raw)) return "Not Verified";
  return "Not Verified";
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function percentValue(value: unknown): string {
  const parsed = numberValue(value);
  if (parsed == null) return "—";
  const precision = Math.abs(parsed) > 0 && Math.abs(parsed) < 1 ? 2 : 1;
  return `${parsed.toFixed(precision)}%`;
}

function compactNumber(value: unknown): string {
  const parsed = numberValue(value);
  if (parsed == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    parsed,
  );
}

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
