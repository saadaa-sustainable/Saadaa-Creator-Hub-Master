"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  Link as LinkIcon,
  Download,
  X,
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  ShieldCheck,
  CheckCircle2,
  Film,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Instagram,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { MissingFieldsAlert } from "@/components/ui/missing-fields-alert";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  extractShortcode,
  postDateFromUrl,
  usernameFromUrl,
} from "@/lib/instagram-shortcode";
import { PartnershipBadge } from "@/components/ui/status-pill";
import { PostingSchema, type PostingInput } from "./schema";
import {
  fetchPostDetails,
  submitPosting,
  type PostDetailsResult,
} from "./actions";
import { checkCreatorPartnership } from "./partnership-actions";
import { PartnershipFlowModal } from "./partnership-flow-modal";

type PostDetails = Extract<PostDetailsResult, { ok: true }>;

interface PostingFormProps {
  postId: string;
  postIdShort?: string;
  /** Collab grouping id (SIF-1-C1) — shown as muted secondary next to Post ID. */
  collabId?: string;
  creatorName?: string | null;
  username?: string | null;
  adsUsageRights?: string | null;
  /** Pre-fill from prior partial save (re-open). */
  initial?: Partial<PostingInput>;
  open: boolean;
  onClose: () => void;
}

export function PostingModal({
  postId,
  postIdShort,
  collabId,
  creatorName,
  username,
  adsUsageRights,
  initial,
  open,
  onClose,
}: PostingFormProps) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [postUrlWarning, setPostUrlWarning] = useState<string | null>(null);
  const [postUrlError, setPostUrlError] = useState<string | null>(null);
  const [decodedDate, setDecodedDate] = useState<string | null>(null);
  const [dateVerified, setDateVerified] = useState(false);
  const [ownerVerified, setOwnerVerified] = useState(false);
  /** True when URL form is /{user}/p/{code}/ AND user === expected creator. */
  const [ownerAutoConfirmed, setOwnerAutoConfirmed] = useState(false);
  // Live Instagram lookup (Meta business_discovery on the creator's media).
  const [dateSource, setDateSource] = useState<"instagram" | "approx" | null>(
    null,
  );
  const [fetchingDate, setFetchingDate] = useState(false);
  const [postDetails, setPostDetails] = useState<PostDetails | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  // Partnership: live per-creator status chip + the post-submit blocking popup.
  const [partnershipState, setPartnershipState] = useState<string | null>(null);
  const [flowActive, setFlowActive] = useState(false);

  const requiresDownload = adsUsageRights === "Yes";
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PostingInput>({
    resolver: zodResolver(PostingSchema),
    criteriaMode: "all",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      postId,
      postDate: initial?.postDate ?? "",
      postLink: initial?.postLink ?? "",
      downloadLink: initial?.downloadLink ?? "",
      rawDump: initial?.rawDump ?? "",
      adsUsageRights: adsUsageRights || "",
    },
    mode: "onBlur",
  });

  const watchedPostLink = watch("postLink");
  const watchedPostDate = watch("postDate");

  const POSTING_FIELD_LABELS: Record<string, string> = {
    postId: "Post ID",
    postDate: "Post Date",
    postLink: "Post Link",
    downloadLink: "Download Link",
    rawDump: "Raw Dump",
    adsUsageRights: "Ads Usage Rights",
  };
  const allPostingValues = watch();
  const postingMissingFields = useMemo<string[]>(() => {
    if (!submitAttempted) return [];
    const parsed = PostingSchema.safeParse(allPostingValues);
    if (parsed.success) return [];
    const keys = new Set<string>();
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (k) keys.add(k);
    }
    return Array.from(keys)
      .map((k) => POSTING_FIELD_LABELS[k])
      .filter((v): v is string => Boolean(v));
  }, [submitAttempted, allPostingValues]);

  // Reset verification flags if URL or date changes — operator must re-confirm.
  useEffect(() => {
    setDateVerified(false);
    setOwnerVerified(false);
  }, [watchedPostLink, watchedPostDate]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Live per-creator partnership status chip (read-only). The heavy lifting —
  // auto-invite + resend — happens in the post-submit popup.
  useEffect(() => {
    if (!open || !username) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await checkCreatorPartnership(username);
        if (!cancelled && res.ok) setPartnershipState(res.status.state);
      } catch {
        // silent — the popup after submit is the authoritative surface
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, username]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Live: decode date from shortcode + validate creator username match.
  useEffect(() => {
    const url = watchedPostLink?.trim();
    if (!url) {
      setDecodedDate(null);
      setPostUrlWarning(null);
      setPostUrlError(null);
      setOwnerAutoConfirmed(false);
      setDateSource(null);
      setPostDetails(null);
      setShowPreview(false);
      setFetchingDate(false);
      return;
    }
    if (!url.toLowerCase().includes("instagram.com")) {
      setDecodedDate(null);
      setPostUrlWarning(null);
      setPostUrlError("Not an Instagram URL.");
      setOwnerAutoConfirmed(false);
      setDateSource(null);
      setPostDetails(null);
      setShowPreview(false);
      setFetchingDate(false);
      return;
    }
    const date = postDateFromUrl(url);
    setDecodedDate(date);
    if (date) setValue("postDate", date, { shouldValidate: true });

    const urlUser = usernameFromUrl(url);
    const expected = username?.toLowerCase();

    if (urlUser && expected) {
      if (urlUser !== expected) {
        // Hard block — URL has wrong creator handle in path.
        setPostUrlError(
          `URL handle is @${urlUser}, expected @${expected}. Cannot submit a post that doesn't belong to this creator.`,
        );
        setPostUrlWarning(null);
        setOwnerAutoConfirmed(false);
      } else {
        // URL path matches creator → auto-confirmed ownership.
        setPostUrlError(null);
        setPostUrlWarning(null);
        setOwnerAutoConfirmed(true);
      }
    } else {
      // Bare `/p/{code}/` or `/reel/{code}/` form — no handle in URL.
      // Cannot verify ownership without an API call. Soft warn + require
      // operator-confirm checkbox.
      setPostUrlError(null);
      setPostUrlWarning(
        expected
          ? `URL has no creator handle in path. Cannot auto-verify ownership. Confirm below that the live post is from @${expected}.`
          : `URL has no creator handle in path. Verify ownership manually.`,
      );
      setOwnerAutoConfirmed(false);
    }
  }, [watchedPostLink, username, setValue]);

  // Live: fetch the REAL post from Instagram (Meta business_discovery on the
  // creator's own media, matched by shortcode). A match upgrades the ±1-day
  // shortcode estimate to Instagram's authoritative published date, PROVES the
  // post belongs to this creator (it's in their media), and loads the caption /
  // likes / comments / media-type for the in-app preview. Debounced; degrades
  // gracefully to the shortcode estimate when Meta can't reach the post.
  useEffect(() => {
    const url = watchedPostLink?.trim() ?? "";
    const sc = extractShortcode(url);
    if (!sc || !url.toLowerCase().includes("instagram.com")) {
      setFetchingDate(false);
      return;
    }
    let cancelled = false;
    setDateSource("approx");
    setFetchingDate(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchPostDetails({ postLink: url, username });
        if (cancelled) return;
        if (res.ok) {
          setPostDetails(res);
          if (res.dateSource === "instagram") {
            setValue("postDate", res.date, { shouldValidate: true });
            setDecodedDate(res.date);
            setDateSource("instagram");
            if (res.ownerConfirmed) {
              setOwnerAutoConfirmed(true);
              setPostUrlWarning(null);
            }
          } else {
            setDateSource("approx");
          }
        }
      } catch {
        // keep the provisional shortcode estimate on any failure
      } finally {
        if (!cancelled) setFetchingDate(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [watchedPostLink, username, setValue]);

  // Instagram-verified = authoritative: the post was matched in THIS creator's
  // media, so both the date and ownership are confirmed without manual ticks.
  const apiVerified = dateSource === "instagram";
  const ownershipOk = apiVerified || ownerAutoConfirmed || ownerVerified;
  const dateOk = apiVerified || dateVerified;
  const previewShortcode = extractShortcode(watchedPostLink ?? "");

  const onSubmit = (values: PostingInput) => {
    // Hard block at submit if URL owner doesn't match creator.
    if (postUrlError) {
      toast.error(postUrlError);
      return;
    }
    if (!ownershipOk) {
      toast.error(
        `Confirm the live post belongs to @${username ?? "this creator"} before submitting.`,
      );
      return;
    }
    if (!dateOk) {
      toast.error("Confirm the post date matches Instagram before submitting.");
      return;
    }
    startSubmit(async () => {
      const res = await submitPosting({ ...values, postId, adsUsageRights });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const dateNote =
        res.postDateSource === "shortcode"
          ? ` Post date decoded from URL → ${res.postDate}.`
          : res.postDateSource === "today"
            ? ` Post date defaulted to today (${res.postDate}).`
            : "";
      toast.success(`${postIdShort ?? postId} marked Posted.${dateNote}`);
      // Hand over to the blocking partnership popup — it checks the live Meta
      // status, auto-sends the invite when none exists, and only then lets the
      // operator close (OK). The form itself is done at this point.
      setFlowActive(true);
    });
  };

  if (!open || !mounted) return null;

  if (flowActive) {
    return (
      <PartnershipFlowModal
        postId={postId}
        username={username}
        onDone={() => {
          setFlowActive(false);
          onClose();
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      {showPreview && previewShortcode && (
        <PostPreviewModal
          shortcode={previewShortcode}
          link={watchedPostLink}
          details={postDetails}
          fetching={fetchingDate}
          username={username}
          onClose={() => setShowPreview(false)}
        />
      )}
      {createPortal(
        <div className="modal-backdrop modal-backdrop--onboarding">
          <div className="modal-panel modal-panel--lg modal-panel--onboarding">
            <header className="modal-head">
              <div className="flex items-center gap-2 min-w-0">
                <Send size={16} />
                <h2 className="font-semibold">Submit Posting</h2>
                <span className="chip text-[10px] tabular">
                  {postIdShort ?? postId}
                </span>
                {collabId && (
                  <span className="text-[0.7rem] text-text-tertiary tabular">
                    · {collabId}
                  </span>
                )}
                <PartnershipBadge status={partnershipState} />
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </header>

            <form
              onSubmit={(e) => {
                setSubmitAttempted(true);
                handleSubmit(onSubmit)(e);
              }}
              className="modal-body pt-modal-body"
            >
              <input type="hidden" {...register("adsUsageRights")} />

              {/* Compact context strip */}
              <div className="pt-context-strip">
                <span>
                  Mark <strong>@{username ?? creatorName ?? "creator"}</strong>{" "}
                  as Posted
                </span>
                {!!adsUsageRights && (
                  <span
                    className="pt-context-chip"
                    title="Ads Usage Rights window"
                  >
                    <ShieldCheck size={11} aria-hidden />
                    Ads: {adsUsageRights}
                  </span>
                )}
              </div>

              {/* Fields — denser 2-col grid, no card wrapper */}
              <div className="pt-grid">
                <div className="form-floating">
                  <input
                    type="date"
                    className="form-control"
                    id="pt_postDate"
                    placeholder=" "
                    {...register("postDate")}
                  />
                  <label htmlFor="pt_postDate">
                    <CalendarCheck size={11} className="inline mr-1" />
                    Post Date <span className="req">*</span>
                  </label>
                  {errors.postDate && (
                    <small className="field-error">
                      {errors.postDate.message}
                    </small>
                  )}
                </div>

                <div className="form-floating relative">
                  <input
                    type="url"
                    className="form-control"
                    id="pt_postLink"
                    placeholder=" "
                    {...register("postLink")}
                  />
                  <label htmlFor="pt_postLink">
                    <LinkIcon size={11} className="inline mr-1" />
                    Live Post URL <span className="req">*</span>
                  </label>
                  {errors.postLink && (
                    <small className="field-error">
                      {errors.postLink.message}
                    </small>
                  )}
                </div>

                {/* Verify strip — collapsed into 2 inline rows when possible */}
                {decodedDate && (
                  <div className="pt-grid-full pt-verify-strip">
                    <div className="pt-verify-strip__head">
                      <span className="pt-verify-pill pt-verify-pill--date">
                        <CalendarCheck size={11} aria-hidden />
                        <strong className="tabular">{decodedDate}</strong>
                        {!apiVerified && (
                          <span className="pt-verify-pill__note">±1d</span>
                        )}
                      </span>
                      {fetchingDate && (
                        <span className="pt-verify-pill">
                          <Loader2
                            size={11}
                            className="animate-spin"
                            aria-hidden
                          />
                          Fetching from Instagram…
                        </span>
                      )}
                      {apiVerified && (
                        <span className="pt-verify-pill pt-verify-pill--ok">
                          <Instagram size={11} aria-hidden />
                          Verified on Instagram
                        </span>
                      )}
                      {!apiVerified && ownerAutoConfirmed && (
                        <span className="pt-verify-pill pt-verify-pill--ok">
                          <CheckCircle2 size={11} aria-hidden />@{username}{" "}
                          verified
                        </span>
                      )}
                      {previewShortcode && (
                        <button
                          type="button"
                          className="pt-verify-strip__open ml-auto"
                          onClick={() => setShowPreview(true)}
                        >
                          <Eye size={11} aria-hidden />
                          View Post
                        </button>
                      )}
                      {watchedPostLink && (
                        <a
                          href={watchedPostLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pt-verify-strip__open"
                        >
                          <ExternalLink size={11} aria-hidden />
                          Open IG
                        </a>
                      )}
                    </div>

                    {!ownerAutoConfirmed && !apiVerified && (
                      <label className="pt-verify-check pt-verify-check--danger">
                        <input
                          type="checkbox"
                          checked={ownerVerified}
                          onChange={(e) => setOwnerVerified(e.target.checked)}
                        />
                        <span>
                          I confirm the live post belongs to{" "}
                          <strong>@{username ?? "this creator"}</strong>{" "}
                          (couldn&apos;t auto-verify ownership from Instagram).
                        </span>
                      </label>
                    )}

                    {!apiVerified && (
                      <label className="pt-verify-check">
                        <input
                          type="checkbox"
                          checked={dateVerified}
                          onChange={(e) => setDateVerified(e.target.checked)}
                        />
                        <span>
                          I checked the live post and the Post Date matches what
                          Instagram shows.
                        </span>
                      </label>
                    )}
                  </div>
                )}

                {postUrlError && (
                  <div className="alert alert-danger pt-grid-full pt-alert-tight">
                    <AlertTriangle size={13} />
                    {postUrlError}
                  </div>
                )}
                {postUrlWarning && (
                  <div className="alert alert-warning pt-grid-full pt-alert-tight">
                    <AlertTriangle size={13} />
                    {postUrlWarning}
                  </div>
                )}
                {requiresDownload && (
                  <div className="alert alert-warning pt-grid-full pt-alert-tight">
                    <AlertCircle size={13} />
                    Ads Rights = <strong>Yes</strong>. Drive link required.
                  </div>
                )}

                <div className="form-floating relative">
                  <input
                    type="url"
                    className="form-control"
                    id="pt_downloadLink"
                    placeholder=" "
                    {...register("downloadLink")}
                  />
                  <label htmlFor="pt_downloadLink">
                    <Download size={11} className="inline mr-1" />
                    Drive Link <span className="req">*</span>
                  </label>
                  <InfoTooltip
                    title="Drive link checklist"
                    label="How to fill the Drive Link"
                    side="top"
                    align="end"
                    className="drive-info-icon"
                    contentClassName="drive-help-popover"
                    content={
                      <>
                        <ol className="drive-popover__list">
                          <li>
                            Download the post video / Reel from Instagram.
                          </li>
                          <li>
                            Upload it to the brand <strong>Google Drive</strong>{" "}
                            folder.
                          </li>
                          <li>
                            Set sharing to <em>Anyone with the link</em>.
                          </li>
                          <li>Paste the shareable Drive link here.</li>
                        </ol>
                        <div className="drive-popover__warn">
                          <AlertTriangle size={11} aria-hidden />
                          <strong>Mandatory</strong> for every post.
                        </div>
                      </>
                    }
                  />
                  {errors.downloadLink && (
                    <small className="field-error">
                      {errors.downloadLink.message}
                    </small>
                  )}
                </div>

                <div className="form-floating">
                  <input
                    type="url"
                    className="form-control"
                    id="pt_rawDump"
                    placeholder=" "
                    {...register("rawDump")}
                  />
                  <label htmlFor="pt_rawDump">
                    <Film size={11} className="inline mr-1" />
                    Raw Footage Dump
                  </label>
                </div>

                {/* Partnership Key input removed (2026-07-02): the partnership-ad
                invite is auto-sent right after submit via the blocking status
                popup, and the status chip in the header shows the live state. */}
              </div>

              <MissingFieldsAlert
                className="mx-4 sm:mx-6 mb-2"
                fields={postingMissingFields}
              />

              <footer className="modal-foot">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={cn("btn-primary-cta", submitting && "is-loading")}
                  disabled={
                    submitting ||
                    !!postUrlError ||
                    (!!decodedDate && (!dateOk || !ownershipOk))
                  }
                  title={
                    postUrlError ??
                    (!!decodedDate && !ownershipOk
                      ? "Confirm post belongs to this creator."
                      : !!decodedDate && !dateOk
                        ? "Tick the date-match checkbox to enable submit."
                        : undefined)
                  }
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span className="hidden sm:inline">Saving…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span className="hidden sm:inline">Finalize </span>Posting
                    </>
                  )}
                </button>
              </footer>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Instagram-style post preview. Renders the post's NATIVE Instagram embed (the
 * real IG UI — videos play inline, carousels swipe) inside a popup, alongside
 * the fetched details (date, likes, comments, caption, media type). The embed
 * needs no token (public oEmbed iframe); the stats come from the Meta lookup we
 * already ran on link entry, so opening this is free. Falls back to embed-only
 * when stats couldn't be fetched (personal account / rate-limited).
 */
function PostPreviewModal({
  shortcode,
  link,
  details,
  fetching,
  username,
  onClose,
}: {
  shortcode: string;
  link?: string | null;
  details: PostDetails | null;
  fetching: boolean;
  username?: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;

  const embedSrc = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const igUrl = link?.trim() || `https://www.instagram.com/p/${shortcode}/`;
  const isVideo = details?.mediaType === "VIDEO";
  const matched = details?.metaMatched ?? false;
  const fmtNum = (n: number | null | undefined) =>
    typeof n === "number" ? n.toLocaleString("en-IN") : "—";

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Instagram size={16} aria-hidden />
            <h2 className="font-semibold">Post Preview</h2>
            {details?.mediaType && (
              <span className="chip text-[10px] inline-flex items-center gap-1">
                {isVideo && <Play size={9} aria-hidden />}
                {details.mediaType.replace(/_/g, " ")}
              </span>
            )}
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

        <div className="modal-body flex flex-col gap-4 sm:flex-row">
          <div className="w-full sm:w-[400px] sm:shrink-0">
            <iframe
              src={embedSrc}
              title="Instagram post preview"
              loading="lazy"
              allow="encrypted-media; clipboard-write; picture-in-picture; fullscreen"
              allowFullScreen
              className="w-full h-[480px] sm:h-[560px] rounded-[var(--radius)] border border-border bg-white"
            />
          </div>

          <aside className="flex-1 min-w-0 flex flex-col gap-3">
            {fetching ? (
              <div className="flex items-center gap-2 py-4 text-text-tertiary">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                <span className="text-[0.8rem]">
                  Fetching post details from Instagram…
                </span>
              </div>
            ) : matched ? (
              <>
                <div className="flex flex-wrap gap-3 text-[0.85rem] text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <Heart size={14} aria-hidden /> {fmtNum(details?.likeCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={14} aria-hidden />{" "}
                    {fmtNum(details?.commentsCount)}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular">
                    <CalendarCheck size={14} aria-hidden /> {details?.date}
                  </span>
                </div>
                {details?.ownerConfirmed && (
                  <div className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-success-text">
                    <CheckCircle2 size={13} aria-hidden />
                    Confirmed this is @{username}&apos;s post
                  </div>
                )}
                {details?.caption && (
                  <p className="max-h-[220px] overflow-auto whitespace-pre-wrap text-[0.82rem] leading-relaxed text-text-primary">
                    {details.caption}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[0.82rem] leading-relaxed text-text-tertiary">
                {details?.note ??
                  "Live stats aren't available for this post. The embed above is the live Instagram post."}
              </p>
            )}
            <a
              href={igUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center gap-1 text-[0.8rem] font-semibold text-[#3B6FD4] hover:underline"
            >
              <ExternalLink size={13} aria-hidden />
              Open on Instagram
            </a>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
