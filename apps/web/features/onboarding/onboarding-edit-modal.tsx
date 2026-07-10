"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchOrderForEdit,
  getOnboardingEditForm,
  submitOnboardingEdit,
  type EditOrderPreview,
} from "./edit-actions";
import {
  EDIT_ADS_USAGE_OPTIONS,
  type OnboardingEditForm,
  type OnboardingEditField,
} from "./edit-fields";

/**
 * Edit a submitted onboarding — mirrors the onboarding form (collab, Shopify
 * order with Fetch, bank details for Barter + Paid, deliverables). The change is
 * HELD for Global-Admin approval; posting for the collab is blocked until then.
 * On approval, changing the order id re-derives every order detail (email,
 * tracking, products, address) across all deliverables.
 */
export function OnboardingEditModal({
  collabId,
  onClose,
}: {
  collabId: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<OnboardingEditForm | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<OnboardingEditField, string>>({
    order_id: "",
    collab_type: "",
    commercial_amount: "",
    ads_usage_rights: "",
    est_delivery: "",
    bank_name: "",
    bank_number: "",
    ifsc: "",
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<EditOrderPreview | null>(null);
  const [fetching, setFetching] = useState(false);
  const [orderErr, setOrderErr] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    let alive = true;
    getOnboardingEditForm(collabId).then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(res.error);
        return;
      }
      setForm(res.form);
      setValues(res.form.values);
    });
    return () => {
      alive = false;
    };
  }, [collabId]);

  const set = (k: OnboardingEditField, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const isBarter = (values.collab_type ?? "").trim().toLowerCase() === "barter";
  const isBarterPaid =
    (values.collab_type ?? "").trim().toLowerCase() === "barter + paid";
  const orderChanged =
    !!form && values.order_id.trim() !== (form.values.order_id ?? "").trim();

  const runFetch = () => {
    const id = values.order_id.trim();
    if (!id) {
      setOrderErr("Enter an order id first");
      return;
    }
    setFetching(true);
    setOrderErr(null);
    setOrder(null);
    fetchOrderForEdit(id).then((res) => {
      setFetching(false);
      if (!res.ok) {
        setOrderErr(res.error);
        return;
      }
      setOrder(res.order);
    });
  };

  const submit = () => {
    if (!form) return;
    if (reason.trim().length < 5) {
      toast.error("Add a short reason for the edit (min 5 chars).");
      return;
    }
    if (orderChanged && !order) {
      toast.error("Fetch the new order to confirm its details before submitting.");
      return;
    }
    setSaving(true);
    submitOnboardingEdit({ collabId, reason, values }).then((res) => {
      setSaving(false);
      if (!res.ok) {
        toast.error(res.error ?? "Could not submit the edit");
        return;
      }
      toast.success("Edit submitted for admin approval");
      onClose();
    });
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label="Edit onboarding"
      onClick={onClose}
    >
      <div
        className="modal-panel modal-panel--lg modal-panel--onboarding"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Pencil size={16} aria-hidden />
            <div className="min-w-0">
              <h2 className="font-semibold">Edit Onboarding</h2>
              <p className="text-[0.62rem] text-text-secondary truncate">
                {collabId}
                {form?.creatorName ? ` · ${form.creatorName}` : ""}
              </p>
            </div>
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

        <div className="modal-body">
          {loadErr ? (
            <div className="ob-form-error-banner">
              <AlertTriangle size={14} aria-hidden />
              {loadErr}
            </div>
          ) : !form ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-secondary">
              <Loader2 size={22} className="animate-spin" aria-hidden />
              <span className="text-sm">Loading onboarding…</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <div
                className="alert"
                style={{
                  background: form.pending
                    ? "var(--color-warning-bg)"
                    : "var(--color-bg-surface)",
                  color: form.pending
                    ? "var(--color-warning-text)"
                    : "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                  fontSize: "0.72rem",
                }}
              >
                {form.pending ? (
                  <>
                    <AlertTriangle size={13} aria-hidden /> This collab already has
                    an edit awaiting approval. Resolve it in Approvals first.
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} aria-hidden /> Changes are held for
                    admin approval and applied to all {form.deliverables}{" "}
                    deliverable{form.deliverables === 1 ? "" : "s"} on approve.
                    Posting stays blocked until then. Changing the Order ID
                    re-pulls every order detail.
                  </>
                )}
              </div>

              {/* Collaboration */}
              <section className="ob-form-section flex flex-col gap-3">
                <SectionHead icon={Pencil} title="Collaboration" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Collab Type">
                    <select
                      className="onboarding-filter-select"
                      value={values.collab_type}
                      onChange={(e) => set("collab_type", e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="Barter">Barter</option>
                      <option value="Barter + Paid">Barter + Paid</option>
                    </select>
                  </Field>
                  <Field
                    label="Commercials (₹)"
                    hint={isBarter ? "Barter ₹0" : undefined}
                  >
                    <input
                      className="ob-input"
                      inputMode="numeric"
                      value={isBarter ? "0" : values.commercial_amount}
                      disabled={isBarter}
                      onChange={(e) => set("commercial_amount", e.target.value)}
                    />
                  </Field>
                  <Field label="Est. Content Delivery">
                    <input
                      type="date"
                      className="ob-input onboarding-filter-select"
                      value={values.est_delivery}
                      onChange={(e) => set("est_delivery", e.target.value)}
                    />
                  </Field>
                  <Field label="Ads Usage Rights">
                    <select
                      className="onboarding-filter-select"
                      value={values.ads_usage_rights}
                      onChange={(e) => set("ads_usage_rights", e.target.value)}
                    >
                      {EDIT_ADS_USAGE_OPTIONS.map((a) => (
                        <option key={a || "none"} value={a}>
                          {a || "None"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

              {/* Shopify order */}
              <section className="ob-form-section flex flex-col gap-3">
                <SectionHead icon={Package} title="Shopify Order" />
                <div className="flex items-end gap-2">
                  <Field label="Order ID" className="flex-1">
                    <input
                      className="ob-input"
                      value={values.order_id}
                      onChange={(e) => {
                        set("order_id", e.target.value);
                        setOrder(null);
                        setOrderErr(null);
                      }}
                      placeholder="Shopify order number"
                    />
                  </Field>
                  <button
                    type="button"
                    className="action-btn shrink-0"
                    onClick={runFetch}
                    disabled={fetching}
                  >
                    {fetching ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw size={12} aria-hidden />
                    )}
                    Fetch
                  </button>
                </div>
                {orderChanged && !order && !orderErr && (
                  <p className="text-[0.66rem] text-warning inline-flex items-center gap-1">
                    <AlertTriangle size={11} aria-hidden /> Order changed — Fetch
                    to confirm the new order&apos;s details before submitting.
                  </p>
                )}
                {orderErr && (
                  <p className="text-[0.66rem] text-danger inline-flex items-center gap-1">
                    <AlertTriangle size={11} aria-hidden /> {orderErr}
                  </p>
                )}
                {order && (
                  <div className="rounded-xl border border-border bg-bg-muted/40 p-2.5 text-[0.68rem] grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-3">
                    <PreviewRow label="Customer" value={order.customer_name} />
                    <PreviewRow label="Email" value={order.email} />
                    <PreviewRow label="Status" value={order.order_status} />
                    <PreviewRow label="Tracking" value={order.tracking_id} />
                    <PreviewRow
                      label="Products"
                      value={order.garments_sent}
                      full
                    />
                    <PreviewRow label="Address" value={order.address} full />
                  </div>
                )}
              </section>

              {/* Bank — Barter + Paid only */}
              {isBarterPaid && (
                <section className="ob-form-section flex flex-col gap-3">
                  <SectionHead icon={Landmark} title="Bank Details" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Bank Name">
                      <input
                        className="ob-input"
                        value={values.bank_name}
                        onChange={(e) => set("bank_name", e.target.value)}
                      />
                    </Field>
                    <Field label="Account Number">
                      <input
                        className="ob-input"
                        value={values.bank_number}
                        onChange={(e) => set("bank_number", e.target.value)}
                      />
                    </Field>
                    <Field label="IFSC Code">
                      <input
                        className="ob-input"
                        value={values.ifsc}
                        onChange={(e) => set("ifsc", e.target.value)}
                      />
                    </Field>
                  </div>
                </section>
              )}

              <Field label="Reason for the edit" required>
                <textarea
                  className="ob-input"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Wrong order ID entered at onboarding, correcting to the right order."
                />
              </Field>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary-cta"
            onClick={submit}
            disabled={!form || form.pending || saving}
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <Pencil size={13} aria-hidden />
            )}
            {saving ? "Submitting…" : "Submit for Approval"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function SectionHead({
  icon: Icon,
  title,
}: {
  icon: typeof Pencil;
  title: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary">
      <Icon size={12} aria-hidden />
      {title}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="ob-form-label flex items-center justify-between">
        <span>
          {label}
          {required && <span style={{ color: "var(--color-danger-text)" }}> *</span>}
        </span>
        {hint && (
          <span className="text-[0.58rem] font-bold text-success normal-case tracking-normal">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function PreviewRow({
  label,
  value,
  full,
}: {
  label: string;
  value: string | null;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2 min-w-0" : "min-w-0"}>
      <span className="text-text-tertiary">{label}: </span>
      <span className="text-text-primary font-medium break-words">
        {value || "—"}
      </span>
    </div>
  );
}
