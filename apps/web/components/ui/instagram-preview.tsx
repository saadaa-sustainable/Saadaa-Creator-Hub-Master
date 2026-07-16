"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Instagram, X, Play, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { extractShortcode } from "@/lib/instagram-shortcode";

function initialsOf(username: string | null | undefined): string {
  const base = (username ?? "").trim();
  if (!base) return "?";
  const parts = base.split(/[\s._]+/).filter(Boolean);
  return (
    parts.length === 1
      ? parts[0].slice(0, 2)
      : parts[0][0] + parts[parts.length - 1][0]
  ).toUpperCase();
}

/**
 * Full-reel Instagram embed lightbox. The captioned embed is portrait, so the
 * iframe must be tall enough not to crop it — `min(82vh, 680px)` shows the whole
 * reel on both phone and desktop (the modal body scrolls if needed). Shared by
 * every "play the post" surface (Posting, team rows, …). Esc / backdrop closes.
 */
export function InstagramEmbedLightbox({
  shortcode,
  label,
  onClose,
  mediaUrl,
}: {
  shortcode: string;
  label: string;
  onClose: () => void;
  /** Durable mirrored video (post-media/{post_id}.mp4) — when present the
   *  lightbox plays it NATIVELY in-app instead of the Instagram embed, which
   *  refuses inline playback on licensed-music reels ("Watch on Instagram"). */
  mediaUrl?: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Post preview — ${label}`}
      style={{ zIndex: 2000 }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal-panel modal-panel--onboarding flex flex-col"
        style={{ maxWidth: 440, width: "94vw", maxHeight: "94dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="modal-head shrink-0"
          style={{ paddingBottom: 8 }}
        >
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary">
              <Instagram size={12} aria-hidden />{" "}
              {mediaUrl ? "Post preview" : "Live Instagram embed"}
            </span>
            <h2 className="text-sm font-extrabold text-text-primary truncate">
              {label}
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: 0 }}>
          {mediaUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={mediaUrl}
              controls
              autoPlay
              playsInline
              style={{
                width: "100%",
                height: "min(82dvh, 680px)",
                background: "#000",
                display: "block",
                objectFit: "contain",
              }}
            />
          ) : (
            <iframe
              src={`https://www.instagram.com/p/${shortcode}/embed/captioned/`}
              title="Instagram post preview"
              loading="lazy"
              scrolling="no"
              allow="encrypted-media; clipboard-write; picture-in-picture; fullscreen"
              allowFullScreen
              style={{
                width: "100%",
                height: "min(82dvh, 680px)",
                border: 0,
                background: "#fff",
                display: "block",
              }}
            />
          )}
        </div>
        <div className="shrink-0 p-3 text-end">
          <a
            href={`https://www.instagram.com/p/${shortcode}/`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.68rem] font-extrabold text-[#3B6FD4] hover:underline"
          >
            <ExternalLink size={12} aria-hidden /> Open on Instagram
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Square thumbnail with a gold play overlay → opens {@link InstagramEmbedLightbox}.
 * `pic` is the creator avatar (raw fbcdn rendered with no-referrer); when it
 * fails / is absent a warm gradient tile shows instead. No post link → a plain
 * square (no play button). Mirrors the Ad Status row thumbnail.
 */
export function InstagramPreviewCard({
  link,
  pic,
  username,
  size = 60,
  className,
  mediaUrl,
}: {
  link?: string | null;
  pic?: string | null;
  username?: string | null;
  size?: number;
  className?: string;
  /** Mirrored video for native in-app playback (see InstagramEmbedLightbox). */
  mediaUrl?: string | null;
}) {
  const shortcode = extractShortcode(link ?? "");
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImg = pic && !failed;
  return (
    <>
      <button
        type="button"
        disabled={!shortcode}
        onClick={(e) => {
          e.stopPropagation();
          if (shortcode) setOpen(true);
        }}
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl border border-border-warm bg-bg-muted",
          shortcode ? "cursor-pointer hover:border-[#B57514]" : "cursor-default",
          className,
        )}
        style={{ width: size, height: size } as CSSProperties}
        title={shortcode ? "Play the post" : undefined}
        aria-label={shortcode ? `Play post — ${username ?? ""}` : username ?? "creator"}
      >
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pic as string}
            alt={username ?? ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : shortcode ? (
          <span className="absolute inset-0 bg-gradient-to-br from-[#F0EAD6] to-[#DCD6C4]" aria-hidden />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center font-semibold text-text-secondary"
            style={{ fontSize: Math.max(11, Math.floor(size * 0.3)) }}
          >
            {initialsOf(username)}
          </span>
        )}
        {shortcode && (
          <span
            className={cn(
              "absolute inset-0 grid place-items-center transition-colors",
              showImg ? "bg-black/30" : "bg-black/0",
            )}
          >
            <span
              className="grid place-items-center rounded-full bg-[#F0C61E] text-[#161513] shadow"
              style={{ width: size * 0.44, height: size * 0.44 }}
            >
              <Play
                size={Math.round(size * 0.22)}
                aria-hidden
                fill="currentColor"
                className="translate-x-[1px]"
              />
            </span>
          </span>
        )}
      </button>
      {open && shortcode && (
        <InstagramEmbedLightbox
          shortcode={shortcode}
          label={username ?? ""}
          mediaUrl={mediaUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
