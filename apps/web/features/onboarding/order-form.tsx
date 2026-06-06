"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  ShieldCheck,
  RotateCw,
  Truck,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  QrCode,
  CalendarCheck,
  ShoppingBag,
  Gift,
  Landmark,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { MissingFieldsAlert } from "@/components/ui/missing-fields-alert";
import {
  OnboardingSchema,
  CONTENT_DURATIONS,
  COLLAB_TYPES,
  ADS_USAGE_RIGHTS,
  ORDER_STATUSES,
  type OnboardingInput,
} from "./schema";
import { submitOnboarding, lookupShopifyOrder } from "./actions";
import {
  CollabEmailPane,
  type CollabEmailDraft,
} from "./collab-email-modal";

interface OnboardingFormProps {
  postId: string;
  postIdShort?: string;
  collabId?: string | null;
  creatorName?: string | null;
  username?: string | null;
  /** Existing values from posts row (when re-opening a partially-onboarded row). */
  initial?: Partial<OnboardingInput>;
  open: boolean;
  onClose: () => void;
}

interface ShopifyPreview {
  order_id: string;
  email: string | null;
  tracking_id: string | null;
  tracking_status: string | null;
  fulfillment: string | null;
  customer_name: string | null;
  total_price: number | null;
  address: string | null;
  phone: string | null;
  garments_sent: number | null;
  delivery_date: string | null;
}

export function OrderCreationModal({
  postId,
  postIdShort,
  collabId,
  creatorName,
  username,
  initial,
  open,
  onClose,
}: OnboardingFormProps) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const [, startLookup] = useTransition();
  const [preview, setPreview] = useState<ShopifyPreview | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Two-phase flow: fill the onboarding form, then (on save) review + send the
  // collab email inline within this same modal. `emailDraft` holds the draft
  // built from the just-saved values; non-null means we're in the email phase.
  const [emailDraft, setEmailDraft] = useState<CollabEmailDraft | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(OnboardingSchema),
    criteriaMode: "all",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      postId,
      agency: initial?.agency ?? "",
      collabType: initial?.collabType ?? "Barter",
      commercials: initial?.commercials ?? 0,
      estDelivery: initial?.estDelivery ?? "",
      reels: initial?.reels ?? 0,
      posts: initial?.posts ?? 0,
      stories: initial?.stories ?? 0,
      adsUsageRights: initial?.adsUsageRights ?? "",
      orderId: initial?.orderId ?? "",
      orderStatus: initial?.orderStatus ?? "Unfulfilled",
      bankName: initial?.bankName ?? "",
      bankNumber: initial?.bankNumber ?? "",
      ifsc: initial?.ifsc ?? "",
      duration: initial?.duration ?? "",
      remarks: initial?.remarks ?? "",
    },
    mode: "onBlur",
  });

  const watchedOrderId = watch("orderId");
  const watchedCollab = watch("collabType");
  const watchedReels = watch("reels");
  const watchedPosts = watch("posts");
  const isBarter = watchedCollab === "Barter";
  const showBank = watchedCollab === "Barter + Paid";
  // Lock collabType + commercials when reach-out already set them. For
  // Barter + Paid we lock once a real positive amount exists; Barter rows
  // can lock as soon as collabType is set since commercials is forced to 0.
  const collabLocked = Boolean(initial?.collabType);
  const commercialsLocked =
    collabLocked &&
    (initial?.collabType === "Barter" ||
      (initial?.commercials != null && initial.commercials > 0));

  const ONBOARDING_FIELD_LABELS: Partial<Record<keyof OnboardingInput, string>> = {
    postId: "Post ID",
    agency: "Agency Name",
    collabType: "Collab Type",
    commercials: "Commercials",
    estDelivery: "Est. Content Delivery",
    reels: "Reels",
    posts: "Static Posts",
    stories: "Stories",
    adsUsageRights: "Ads Usage Rights",
    orderId: "Shopify Order ID",
    orderStatus: "Order Status",
    bankName: "Bank Account Name",
    bankNumber: "Bank Account Number",
    ifsc: "IFSC",
    duration: "Duration",
    remarks: "Remarks",
  };

  const allValues = watch();
  const missingFieldLabels = useMemo<string[]>(() => {
    if (!submitAttempted) return [];
    const parsed = OnboardingSchema.safeParse(allValues);
    if (parsed.success) return [];
    const keys = new Set<string>();
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (k) keys.add(k);
    }
    return Array.from(keys)
      .map((k) => ONBOARDING_FIELD_LABELS[k as keyof OnboardingInput])
      .filter((v): v is string => Boolean(v));
  }, [submitAttempted, allValues]);

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

  // Lock commercials to 0 when Barter (legacy parity)
  useEffect(() => {
    if (isBarter) setValue("commercials", 0, { shouldDirty: false });
  }, [isBarter, setValue]);

  // Apply Shopify-derived order status when preview lands (legacy behavior)
  useEffect(() => {
    if (preview) {
      const live = preview.tracking_status || preview.fulfillment;
      if (live) {
        const matched = ORDER_STATUSES.find(
          (s) => s.toLowerCase() === live.toLowerCase(),
        );
        if (matched) setValue("orderStatus", matched, { shouldDirty: false });
      }
    }
  }, [preview, setValue]);

  const runLookup = () => {
    setPreview(null);
    setLookupErr(null);
    startLookup(async () => {
      const res = await lookupShopifyOrder(watchedOrderId);
      if (!res.found) {
        setLookupErr(res.error || "Order not found in Shopify sync");
        return;
      }
      setPreview(res.order as ShopifyPreview);
    });
  };

  const onSubmit = (values: OnboardingInput) => {
    if (!preview) {
      toast.error("Look up the Shopify order first to verify details.");
      return;
    }
    const total = (values.reels || 0) + (values.posts || 0);
    if (total === 0) {
      toast.error("Set at least one Reel or Static Post.");
      return;
    }
    startSubmit(async () => {
      const res = await submitOnboarding({ ...values, postId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const msg =
        res.childrenSpawned > 0
          ? `${postIdShort ?? postId} onboarded. ${res.childrenSpawned} deliverable row(s) spawned.`
          : `${postIdShort ?? postId} onboarded.`;
      toast.success(msg);
      // Refresh so the board reflects the new On Board state, then surface the
      // inline collab-email review pane in this same modal. The onboarding is
      // already persisted — sending the email is now an optional follow-up.
      router.refresh();
      setEmailDraft(buildCollabEmailDraft());
    });
  };

  // Close the whole modal after the email phase resolves (sent / skipped /
  // dismissed). Onboarding is already saved + refreshed at this point.
  const finishFlow = () => {
    setEmailDraft(null);
    onClose();
    router.refresh();
  };

  const buildCollabEmailDraft = (): CollabEmailDraft => {
    const values = getValues();
    const deliverables: string[] = [];
    const reels = Number(values.reels) || 0;
    const posts = Number(values.posts) || 0;
    const stories = Number(values.stories) || 0;

    if (reels > 0) deliverables.push(`${reels} Reel${reels > 1 ? "s" : ""}`);
    if (posts > 0)
      deliverables.push(`${posts} Static Post${posts > 1 ? "s" : ""}`);
    if (stories > 0)
      deliverables.push(`${stories} Stor${stories > 1 ? "ies" : "y"}`);

    const commercials = String(values.commercials ?? 0);
    const isBarter = values.collabType === "Barter";

    return {
      creatorName: creatorName ?? username ?? preview?.customer_name ?? "",
      emailTo: preview?.email ?? undefined,
      deliverables,
      agreedAmount: isBarter ? "0" : commercials,
      barterAmount: "0",
      collabType: values.collabType,
      adsUsageRights: values.adsUsageRights,
    };
  };

  if (!open || !mounted) return null;

  // ── Email phase: onboarding saved, render the inline collab-email review ──
  if (emailDraft) {
    return createPortal(
      <div className="modal-backdrop modal-backdrop--onboarding">
        <div className="modal-panel modal-panel--lg modal-panel--onboarding collab-email-modal">
          <header className="modal-head">
            <div className="flex items-center gap-2 min-w-0">
              <Mail size={16} />
              <h2 className="font-semibold">Review Collaboration Email</h2>
              <span className="chip text-[10px] tabular">
                {postIdShort ?? postId}
              </span>
              {collabId && (
                <span
                  className="tabular text-[0.66rem] text-text-tertiary"
                  title="Collab ID — groups all deliverables of this collaboration"
                >
                  {collabId}
                </span>
              )}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={finishFlow}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </header>

          <CollabEmailPane
            postId={postId}
            draft={emailDraft}
            inline
            onClose={finishFlow}
            onSent={finishFlow}
            onSkipped={finishFlow}
          />
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding">
      <div className="modal-panel modal-panel--lg modal-panel--onboarding">
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck size={16} />
            <h2 className="font-semibold">Onboarding Configuration</h2>
            <span className="chip text-[10px] tabular">
              {postIdShort ?? postId}
            </span>
            {collabId && (
              <span
                className="tabular text-[0.66rem] text-text-tertiary"
                title="Collab ID — groups all deliverables of this collaboration"
              >
                {collabId}
              </span>
            )}
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
          className="modal-body space-y-3"
        >
          <input type="hidden" {...register("orderStatus")} />
          <div className="text-sm text-text-secondary">
            Onboarding <strong>{creatorName ?? username ?? "creator"}</strong>.
            Fill collab + Shopify order; deliverable rows auto-spawn from Reels
            + Posts counts.
          </div>

          {/* ── Collaboration Configuration ─────────────────────────── */}
          <section className="ob-form-section">
            <h5 className="section-title">
              <ClipboardCheck size={13} className="inline mr-2" />
              Collaboration
            </h5>
            <div className="form-grid">
              <div className="form-floating form-grid-full">
                <input
                  type="text"
                  className="form-control"
                  id="ob_agency"
                  placeholder=" "
                  {...register("agency")}
                />
                <label htmlFor="ob_agency">Agency Name (Optional)</label>
              </div>

              <div className="form-floating relative">
                <select
                  className={cn("form-select", collabLocked && "br-readonly")}
                  id="ob_collab"
                  disabled={collabLocked}
                  {...register("collabType")}
                >
                  {COLLAB_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label htmlFor="ob_collab">
                  Collab Type <span className="req">*</span>
                </label>
                {collabLocked && (
                  <span className="autofill-badge">FROM REACH OUT</span>
                )}
                {errors.collabType && (
                  <small className="field-error">
                    {errors.collabType.message}
                  </small>
                )}
              </div>

              <div className="form-floating relative">
                <input
                  type="number"
                  min={0}
                  className={cn(
                    "form-control",
                    (isBarter || commercialsLocked) && "br-readonly",
                  )}
                  id="ob_commercials"
                  placeholder=" "
                  readOnly={isBarter || commercialsLocked}
                  {...register("commercials", {
                    setValueAs: (v) =>
                      v === "" || v == null ? 0 : Number(v) || 0,
                  })}
                />
                <label htmlFor="ob_commercials">Commercials ₹</label>
                {isBarter ? (
                  <span className="barter-badge">
                    <Gift size={10} /> BARTER ₹0
                  </span>
                ) : commercialsLocked ? (
                  <span className="autofill-badge">FROM REACH OUT</span>
                ) : null}
              </div>

              <div className="form-floating">
                <input
                  type="date"
                  className="form-control"
                  id="ob_estDate"
                  placeholder=" "
                  {...register("estDelivery")}
                />
                <label htmlFor="ob_estDate">
                  Est. Content Delivery <span className="req">*</span>
                </label>
                {errors.estDelivery && (
                  <small className="field-error">
                    {errors.estDelivery.message}
                  </small>
                )}
              </div>

              <div className="form-floating">
                <select
                  className="form-select"
                  id="ob_adsRights"
                  {...register("adsUsageRights")}
                >
                  <option value="">None</option>
                  {ADS_USAGE_RIGHTS.filter((a) => a !== "").map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <label htmlFor="ob_adsRights">
                  <ShieldCheck size={11} className="inline mr-1" />
                  Ads Usage Rights
                </label>
              </div>

              <div className="form-floating">
                <input
                  type="number"
                  min={0}
                  className="form-control"
                  id="ob_reels"
                  placeholder=" "
                  {...register("reels", {
                    setValueAs: (v) =>
                      v === "" || v == null ? 0 : Number(v) || 0,
                  })}
                />
                <label htmlFor="ob_reels">Reels</label>
              </div>

              <div className="form-floating">
                <input
                  type="number"
                  min={0}
                  className="form-control"
                  id="ob_posts"
                  placeholder=" "
                  {...register("posts", {
                    setValueAs: (v) =>
                      v === "" || v == null ? 0 : Number(v) || 0,
                  })}
                />
                <label htmlFor="ob_posts">Static Posts</label>
              </div>

              <div className="form-floating">
                <input
                  type="number"
                  min={0}
                  className="form-control"
                  id="ob_stories"
                  placeholder=" "
                  {...register("stories", {
                    setValueAs: (v) =>
                      v === "" || v == null ? 0 : Number(v) || 0,
                  })}
                />
                <label htmlFor="ob_stories">Stories</label>
              </div>

              {watchedReels + watchedPosts > 1 && (
                <div className="form-grid-full">
                  <small className="text-muted">
                    Total = {watchedReels + watchedPosts} deliverables. Stories
                    dropped during deliverable expansion;{" "}
                    {watchedReels + watchedPosts - 1} child row(s) will spawn on
                    submit.
                  </small>
                </div>
              )}
            </div>
          </section>

          {/* ── Shopify Order ──────────────────────────────────────── */}
          <section className="ob-form-section">
            <h5 className="section-title">
              <ShoppingBag size={13} className="inline mr-2" />
              Shopify Order
            </h5>
            <div className="form-grid">
              <div className="form-grid-full flex gap-2 items-stretch">
                <div className="form-floating flex-1">
                  <input
                    type="text"
                    className="form-control"
                    id="ob_orderId"
                    placeholder=" "
                    {...register("orderId")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runLookup();
                      }
                    }}
                  />
                  <label htmlFor="ob_orderId">
                    Shopify Order ID <span className="req">*</span>
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={runLookup}
                  disabled={!watchedOrderId.trim()}
                >
                  <RotateCw size={14} />
                  Fetch
                </button>
              </div>

              {errors.orderId && (
                <small className="field-error form-grid-full">
                  {errors.orderId.message}
                </small>
              )}

              {lookupErr && (
                <div className="alert alert-warning form-grid-full">
                  <AlertCircle size={14} />
                  {lookupErr}
                </div>
              )}

              {preview && (
                <div className="shopify-preview form-grid-full">
                  <div className="shopify-preview__head">
                    <ShoppingBag size={12} />
                    Shopify Synchronization
                    <span className="status-badge">
                      {preview.tracking_status ??
                        preview.fulfillment ??
                        "Pending"}
                    </span>
                  </div>
                  <dl className="shopify-preview__grid">
                    <div>
                      <dt>
                        <Mail size={11} />
                        Email
                      </dt>
                      <dd>{preview.email ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>
                        <Phone size={11} />
                        Contact
                      </dt>
                      <dd>{preview.phone ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>
                        <Truck size={11} />
                        Status
                      </dt>
                      <dd>
                        {preview.tracking_status ?? preview.fulfillment ?? "—"}
                      </dd>
                    </div>
                    <div className="span-2">
                      <dt>
                        <MapPin size={11} />
                        Address
                      </dt>
                      <dd>
                        <ExpandablePreviewValue value={preview.address} />
                      </dd>
                    </div>
                    {preview.tracking_id && (
                      <div>
                        <dt>
                          <QrCode size={11} />
                          Tracking
                        </dt>
                        <dd className="tabular">{preview.tracking_id}</dd>
                      </div>
                    )}
                    {preview.delivery_date && (
                      <div>
                        <dt>
                          <CalendarCheck size={11} />
                          Dispatched
                        </dt>
                        <dd>{preview.delivery_date}</dd>
                      </div>
                    )}
                    {preview.garments_sent != null && (
                      <div>
                        <dt>
                          <ShoppingBag size={11} />
                          Garments Sent
                        </dt>
                        <dd className="tabular">
                          <ExpandablePreviewValue
                            value={String(preview.garments_sent)}
                          />
                        </dd>
                      </div>
                    )}
                    {preview.total_price != null && (
                      <div>
                        <dt>Total</dt>
                        <dd className="tabular">₹{preview.total_price}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          </section>

          {/* ── Bank Details (Barter + Paid only) ──────────────────── */}
          {showBank && (
            <section className="ob-form-section">
              <h5 className="section-title">
                <Landmark size={13} className="inline mr-2" />
                Bank Details
                <span className="chip chip--info">For Paid Collabs</span>
              </h5>
              <div className="form-grid">
                <div className="form-floating">
                  <input
                    type="text"
                    className="form-control"
                    id="ob_bankName"
                    placeholder=" "
                    {...register("bankName")}
                  />
                  <label htmlFor="ob_bankName">Bank Account Name</label>
                  {errors.bankName && (
                    <small className="field-error">
                      {errors.bankName.message}
                    </small>
                  )}
                </div>
                <div className="form-floating">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-control"
                    id="ob_bankNumber"
                    placeholder=" "
                    {...register("bankNumber")}
                    onInput={(e) => {
                      (e.target as HTMLInputElement).value = (
                        e.target as HTMLInputElement
                      ).value.replace(/[^0-9]/g, "");
                    }}
                  />
                  <label htmlFor="ob_bankNumber">Bank Account Number</label>
                  {errors.bankNumber && (
                    <small className="field-error">
                      {errors.bankNumber.message}
                    </small>
                  )}
                </div>
                <div className="form-floating form-grid-full">
                  <input
                    type="text"
                    className="form-control"
                    id="ob_ifsc"
                    placeholder=" "
                    {...register("ifsc")}
                    onInput={(e) => {
                      (e.target as HTMLInputElement).value = (
                        e.target as HTMLInputElement
                      ).value.toUpperCase();
                    }}
                  />
                  <label htmlFor="ob_ifsc">IFSC Code</label>
                  {errors.ifsc && (
                    <small className="field-error">{errors.ifsc.message}</small>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Duration + Remarks ─────────────────────────────────── */}
          <section className="ob-form-section">
            <div className="form-grid">
              <div className="form-floating form-grid-full">
                <select
                  className="form-control"
                  id="ob_duration"
                  {...register("duration")}
                >
                  <option value="">Select content duration…</option>
                  {CONTENT_DURATIONS.filter((d) => d).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <label htmlFor="ob_duration">Content Duration</label>
              </div>
              <div className="form-floating form-grid-full">
                <textarea
                  className="form-control"
                  id="ob_remarks"
                  placeholder=" "
                  rows={3}
                  {...register("remarks")}
                />
                <label htmlFor="ob_remarks">Internal Remarks</label>
              </div>
            </div>
          </section>

          {missingFieldLabels.length > 0 && (
            <div className="px-4 sm:px-6 pb-2">
              <MissingFieldsAlert fields={missingFieldLabels} />
            </div>
          )}
          <footer className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={cn("btn-primary-cta", submitting && "is-loading")}
              disabled={submitting || !preview}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="hidden sm:inline">Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span className="hidden sm:inline">Save &amp; Review </span>
                  Email
                </>
              )}
            </button>
          </footer>

          {!preview && (
            <p className="text-xs text-text-tertiary text-right">
              Fetch the Shopify order first to confirm details before saving.
            </p>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}

function ExpandablePreviewValue({ value }: { value?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = value?.trim();
  if (!text) return <>—</>;

  const canExpand = text.length > 34;

  return (
    <span className={cn("preview-expand", expanded && "is-expanded")}>
      <span className="preview-expand__text">{text}</span>
      {canExpand && (
        <button
          type="button"
          className="preview-expand__button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "View less" : "View more"}
        </button>
      )}
    </span>
  );
}
