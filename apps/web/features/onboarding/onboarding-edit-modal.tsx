"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Gift,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  QrCode,
  RotateCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
 * Edit a submitted onboarding — SAME visual language as the Onboarding
 * Configuration form (ob-form-section / form-floating / shopify-preview).
 * The change is HELD for Global-Admin approval; posting for the collab is
 * blocked until then. Changing the Order ID re-derives every order detail
 * on approval.
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
      toast.error(
        "Fetch the new order to confirm its details before submitting.",
      );
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
            <div className="alert alert-warning">
              <AlertCircle size={14} />
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
                className={cn(
                  "alert",
                  form.pending ? "alert-warning" : undefined,
                )}
                style={
                  form.pending
                    ? undefined
                    : {
                        background: "var(--color-bg-surface)",
                        color: "var(--color-text-secondary)",
                        border: "1px solid var(--color-border)",
                      }
                }
              >
                {form.pending ? (
                  <>
                    <AlertTriangle size={14} /> This collab already has an edit
                    awaiting approval. Resolve it in Approvals first.
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} /> Changes are held for admin
                    approval and applied to all {form.deliverables} deliverable
                    {form.deliverables === 1 ? "" : "s"} on approve. Posting
                    stays blocked until then. Changing the Order ID re-pulls
                    every order detail.
                  </>
                )}
              </div>

              {/* ── Collaboration ── */}
              <section className="ob-form-section">
                <h5 className="section-title">
                  <Pencil size={13} className="inline mr-2" />
                  Collaboration
                </h5>
                <div className="form-grid">
                  <div className="form-floating relative">
                    <SearchableSelect
                      id="obe_collab"
                      value={values.collab_type}
                      onChange={(v) => set("collab_type", v)}
                      options={[
                        { value: "Barter", label: "Barter" },
                        { value: "Barter + Paid", label: "Barter + Paid" },
                      ]}
                      searchPlaceholder="Search…"
                    />
                    <label htmlFor="obe_collab">
                      Collab Type <span className="req">*</span>
                    </label>
                  </div>

                  <div className="form-floating relative">
                    <input
                      type="number"
                      min={0}
                      className={cn("form-control", isBarter && "br-readonly")}
                      id="obe_commercials"
                      placeholder=" "
                      readOnly={isBarter}
                      value={isBarter ? "0" : values.commercial_amount}
                      onChange={(e) => set("commercial_amount", e.target.value)}
                    />
                    <label htmlFor="obe_commercials">Commercials ₹</label>
                    {isBarter && (
                      <span className="barter-badge">
                        <Gift size={10} /> BARTER ₹0
                      </span>
                    )}
                  </div>

                  <div className="form-floating">
                    <input
                      type="date"
                      className="form-control"
                      id="obe_estDate"
                      placeholder=" "
                      value={values.est_delivery}
                      onChange={(e) => set("est_delivery", e.target.value)}
                    />
                    <label htmlFor="obe_estDate">
                      Est. Content Delivery <span className="req">*</span>
                    </label>
                  </div>

                  <div className="form-floating">
                    <SearchableSelect
                      id="obe_adsRights"
                      value={values.ads_usage_rights}
                      onChange={(v) => set("ads_usage_rights", v)}
                      options={[
                        { value: "", label: "None" },
                        ...EDIT_ADS_USAGE_OPTIONS.filter((a) => a !== "").map(
                          (a) => ({ value: a, label: a }),
                        ),
                      ]}
                      placeholder="None"
                      searchPlaceholder="Search…"
                    />
                    <label htmlFor="obe_adsRights">
                      <ShieldCheck size={11} className="inline mr-1" />
                      Ads Usage Rights
                    </label>
                  </div>
                </div>
              </section>

              {/* ── Shopify Order ── */}
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
                        id="obe_orderId"
                        placeholder=" "
                        value={values.order_id}
                        onChange={(e) => {
                          set("order_id", e.target.value);
                          setOrder(null);
                          setOrderErr(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            runFetch();
                          }
                        }}
                      />
                      <label htmlFor="obe_orderId">
                        Shopify Order ID <span className="req">*</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={runFetch}
                      disabled={fetching || !values.order_id.trim()}
                    >
                      {fetching ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RotateCw size={14} />
                      )}
                      Fetch
                    </button>
                  </div>

                  {orderChanged && !order && !orderErr && (
                    <div className="alert alert-warning form-grid-full">
                      <AlertCircle size={14} />
                      Order changed — Fetch to confirm the new order&apos;s
                      details before submitting.
                    </div>
                  )}
                  {orderErr && (
                    <div className="alert alert-warning form-grid-full">
                      <AlertCircle size={14} />
                      {orderErr}
                    </div>
                  )}

                  {order && (
                    <div className="shopify-preview form-grid-full">
                      <div className="shopify-preview__head">
                        <ShoppingBag size={12} />
                        Shopify Synchronization
                        <span className="status-badge">
                          {order.order_status ?? "Pending"}
                        </span>
                      </div>
                      <dl className="shopify-preview__grid">
                        <div>
                          <dt>
                            <Mail size={11} />
                            Email
                          </dt>
                          <dd>{order.email ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>
                            <Phone size={11} />
                            Contact
                          </dt>
                          <dd>{order.phone ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>
                            <Truck size={11} />
                            Status
                          </dt>
                          <dd>{order.order_status ?? "—"}</dd>
                        </div>
                        <div className="span-2">
                          <dt>
                            <MapPin size={11} />
                            Address
                          </dt>
                          <dd>{order.address ?? "—"}</dd>
                        </div>
                        {order.tracking_id && (
                          <div>
                            <dt>
                              <QrCode size={11} />
                              Tracking
                            </dt>
                            <dd className="tabular">{order.tracking_id}</dd>
                          </div>
                        )}
                        {order.garments_sent != null && (
                          <div>
                            <dt>
                              <ShoppingBag size={11} />
                              Garments Sent
                            </dt>
                            <dd className="tabular">{order.garments_sent}</dd>
                          </div>
                        )}
                        {order.total_price != null && (
                          <div>
                            <dt>Total</dt>
                            <dd className="tabular">₹{order.total_price}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Bank Details (Barter + Paid only) ── */}
              {isBarterPaid && (
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
                        id="obe_bankName"
                        placeholder=" "
                        value={values.bank_name}
                        onChange={(e) => set("bank_name", e.target.value)}
                      />
                      <label htmlFor="obe_bankName">Bank Account Name</label>
                    </div>
                    <div className="form-floating">
                      <input
                        type="text"
                        className="form-control"
                        id="obe_bankNumber"
                        placeholder=" "
                        value={values.bank_number}
                        onChange={(e) => set("bank_number", e.target.value)}
                      />
                      <label htmlFor="obe_bankNumber">Account Number</label>
                    </div>
                    <div className="form-floating">
                      <input
                        type="text"
                        className="form-control"
                        id="obe_ifsc"
                        placeholder=" "
                        value={values.ifsc}
                        onChange={(e) => set("ifsc", e.target.value)}
                      />
                      <label htmlFor="obe_ifsc">IFSC Code</label>
                    </div>
                  </div>
                </section>
              )}

              {/* ── Reason ── */}
              <section className="ob-form-section">
                <h5 className="section-title">
                  <Pencil size={13} className="inline mr-2" />
                  Reason for the Edit
                </h5>
                <div className="form-grid">
                  <div className="form-floating form-grid-full">
                    <textarea
                      className="form-control"
                      id="obe_reason"
                      placeholder=" "
                      rows={2}
                      style={{ minHeight: "4.6rem" }}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <label htmlFor="obe_reason">
                      Why is this edit needed? <span className="req">*</span>
                    </label>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <footer
          className="modal-foot"
          style={{
            position: "static",
            margin: 0,
            padding: "0.9rem 1.15rem 1.15rem",
            borderRadius: "0 0 16px 16px",
            backdropFilter: "none",
          }}
        >
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
              <CheckCircle2 size={13} aria-hidden />
            )}
            {saving ? "Submitting…" : "Submit for Approval"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
