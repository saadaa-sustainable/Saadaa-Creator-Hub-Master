"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  Info,
  Film,
  Handshake,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { MissingFieldsAlert } from "@/components/ui/missing-fields-alert";
import { postDateFromUrl, usernameFromUrl } from "@/lib/instagram-shortcode";
import { PostingSchema, type PostingInput } from "./schema";
import { submitPosting } from "./actions";

interface PostingFormProps {
  postId: string;
  postIdShort?: string;
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
  const [showDriveInfo, setShowDriveInfo] = useState(false);
  const [postUrlWarning, setPostUrlWarning] = useState<string | null>(null);
  const [postUrlError, setPostUrlError] = useState<string | null>(null);
  const [decodedDate, setDecodedDate] = useState<string | null>(null);
  const [dateVerified, setDateVerified] = useState(false);
  const [ownerVerified, setOwnerVerified] = useState(false);
  /** True when URL form is /{user}/p/{code}/ AND user === expected creator. */
  const [ownerAutoConfirmed, setOwnerAutoConfirmed] = useState(false);
  const driveBtnRef = useRef<HTMLButtonElement>(null);

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
      partnershipId: initial?.partnershipId ?? "",
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
    partnershipId: "Partnership Key",
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
      return;
    }
    if (!url.toLowerCase().includes("instagram.com")) {
      setDecodedDate(null);
      setPostUrlWarning(null);
      setPostUrlError("Not an Instagram URL.");
      setOwnerAutoConfirmed(false);
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

  // Close Drive info popover on Escape / outside click.
  useEffect(() => {
    if (!showDriveInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDriveInfo(false);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (driveBtnRef.current && !driveBtnRef.current.contains(t)) {
        const pop = document.getElementById("pt-drive-popover");
        if (pop && !pop.contains(t)) setShowDriveInfo(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [showDriveInfo]);

  const ownershipOk = ownerAutoConfirmed || ownerVerified;

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
    if (!dateVerified) {
      toast.error(
        "Confirm the post date matches Instagram before submitting.",
      );
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
      onClose();
      router.refresh();
    });
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding">
      <div className="modal-panel modal-panel--lg modal-panel--onboarding">
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Send size={16} />
            <h2 className="font-semibold">Submit Posting</h2>
            <span className="chip text-[10px] tabular">
              {postIdShort ?? postId}
            </span>
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
              Mark{" "}
              <strong>@{username ?? creatorName ?? "creator"}</strong> as
              Posted
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
                Post Date *
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
                Live Post URL *
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
                    <span className="pt-verify-pill__note">±1d</span>
                  </span>
                  {ownerAutoConfirmed && (
                    <span className="pt-verify-pill pt-verify-pill--ok">
                      <CheckCircle2 size={11} aria-hidden />
                      @{username} verified
                    </span>
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

                {!ownerAutoConfirmed && (
                  <label className="pt-verify-check pt-verify-check--danger">
                    <input
                      type="checkbox"
                      checked={ownerVerified}
                      onChange={(e) => setOwnerVerified(e.target.checked)}
                    />
                    <span>
                      I confirm the live post belongs to{" "}
                      <strong>@{username ?? "this creator"}</strong>{" "}
                      (URL path has no handle, ownership cannot be
                      auto-verified).
                    </span>
                  </label>
                )}

                <label className="pt-verify-check">
                  <input
                    type="checkbox"
                    checked={dateVerified}
                    onChange={(e) => setDateVerified(e.target.checked)}
                  />
                  <span>
                    I checked the live post — the Post Date matches what
                    Instagram shows.
                  </span>
                </label>
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
                Drive Link {requiresDownload ? "*" : "(optional)"}
              </label>
              <button
                ref={driveBtnRef}
                type="button"
                className="drive-info-icon"
                aria-label="How to fill the Drive Download Link"
                aria-expanded={showDriveInfo}
                onClick={() => setShowDriveInfo((s) => !s)}
              >
                <Info size={14} aria-hidden />
              </button>
              {showDriveInfo && (
                <div
                  id="pt-drive-popover"
                  role="dialog"
                  aria-label="How to fill the Drive Download Link"
                  className="drive-popover"
                >
                  <div className="drive-popover__head">
                    <span>How to fill this</span>
                    <button
                      type="button"
                      className="drive-popover__close"
                      onClick={() => setShowDriveInfo(false)}
                      aria-label="Close"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <ol className="drive-popover__list">
                    <li>Download the post video / Reel from Instagram.</li>
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
                    <strong>Mandatory</strong> when Ads Usage Rights = Yes.
                  </div>
                </div>
              )}
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

            <div className="form-floating pt-grid-full">
              <input
                type="text"
                className="form-control"
                id="pt_partId"
                placeholder=" "
                {...register("partnershipId")}
              />
              <label htmlFor="pt_partId">
                <Handshake size={11} className="inline mr-1" />
                Partnership Key
              </label>
            </div>
          </div>

          <MissingFieldsAlert
            className="mx-4 sm:mx-6 mb-2"
            fields={postingMissingFields}
          />

          <footer className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={cn("btn-primary-cta", submitting && "is-loading")}
              disabled={
                submitting ||
                !!postUrlError ||
                !!decodedDate && (!dateVerified || !ownershipOk)
              }
              title={
                postUrlError ??
                (!!decodedDate && !ownershipOk
                  ? "Confirm post belongs to this creator."
                  : !!decodedDate && !dateVerified
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
  );
}
