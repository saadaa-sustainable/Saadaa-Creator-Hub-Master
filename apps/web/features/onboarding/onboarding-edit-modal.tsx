"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { getOnboardingEditForm, submitOnboardingEdit } from "./edit-actions";
import {
  ONBOARDING_EDIT_FIELD_LABELS,
  type OnboardingEditForm,
  type OnboardingEditField,
} from "./edit-fields";

/**
 * Edit a submitted onboarding — the change is HELD for Global-Admin approval
 * (before/after diff + email), and posting for the collab is blocked until it is
 * approved. No fields are written until an admin approves.
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
    garment_qty: "",
    ads_usage_rights: "",
    est_delivery: "",
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

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

  const isBarter = (values.collab_type ?? "").trim().toLowerCase() === "barter";

  const submit = () => {
    if (!form) return;
    if (reason.trim().length < 5) {
      toast.error("Add a short reason for the edit (min 5 chars).");
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
        className="modal-panel modal-panel--onboarding flex flex-col"
        style={{ maxWidth: 560, width: "94vw", maxHeight: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head shrink-0">
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

        <div className="modal-body flex-1 overflow-y-auto">
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
            <>
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
                  marginBottom: "0.85rem",
                  fontSize: "0.72rem",
                }}
              >
                {form.pending ? (
                  <>
                    <AlertTriangle size={13} aria-hidden /> This collab already has
                    an edit awaiting approval. Resolve it in Approvals before
                    submitting another.
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} aria-hidden /> Changes are HELD for
                    admin approval. Posting for this collab is blocked until an
                    admin approves — no fields change until then. Applies to all{" "}
                    {form.deliverables} deliverable
                    {form.deliverables === 1 ? "" : "s"}.
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={ONBOARDING_EDIT_FIELD_LABELS.order_id}>
                  <input
                    className="ob-input"
                    value={values.order_id}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, order_id: e.target.value }))
                    }
                    placeholder="Shopify order number"
                  />
                </Field>
                <Field label={ONBOARDING_EDIT_FIELD_LABELS.collab_type}>
                  <select
                    className="ob-input onboarding-filter-select"
                    value={values.collab_type}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, collab_type: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    <option value="Barter">Barter</option>
                    <option value="Barter + Paid">Barter + Paid</option>
                  </select>
                </Field>
                <Field label={ONBOARDING_EDIT_FIELD_LABELS.commercial_amount}>
                  <input
                    className="ob-input"
                    inputMode="numeric"
                    value={isBarter ? "0" : values.commercial_amount}
                    disabled={isBarter}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        commercial_amount: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label={ONBOARDING_EDIT_FIELD_LABELS.garment_qty}>
                  <input
                    className="ob-input"
                    inputMode="numeric"
                    value={values.garment_qty}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, garment_qty: e.target.value }))
                    }
                  />
                </Field>
                <Field label={ONBOARDING_EDIT_FIELD_LABELS.ads_usage_rights}>
                  <input
                    className="ob-input"
                    value={values.ads_usage_rights}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        ads_usage_rights: e.target.value,
                      }))
                    }
                    placeholder="e.g. 12 Months"
                  />
                </Field>
                <Field label={ONBOARDING_EDIT_FIELD_LABELS.est_delivery}>
                  <input
                    type="date"
                    className="ob-input onboarding-filter-select"
                    value={values.est_delivery}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, est_delivery: e.target.value }))
                    }
                  />
                </Field>
              </div>

              <div className="mt-3">
                <label className="ob-form-label">
                  Reason for the edit{" "}
                  <span style={{ color: "var(--color-danger-text)" }}>*</span>
                </label>
                <textarea
                  className="ob-input"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Wrong order ID was entered at onboarding — correcting to 1444778."
                />
              </div>
            </>
          )}
        </div>

        <footer className="modal-foot shrink-0">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <span style={{ flex: 1 }} />
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="ob-form-label">{label}</span>
      {children}
    </label>
  );
}
