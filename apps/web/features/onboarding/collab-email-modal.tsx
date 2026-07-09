"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Plus,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCollabEmailPreview,
  sendCollabEmail,
  skipCollabEmail,
  type CollabEmailPreviewResult,
} from "./actions";

interface CollabEmailModalProps {
  postId: string;
  open: boolean;
  onClose: () => void;
  draft?: CollabEmailDraft;
}

interface CollabEmailPaneProps {
  postId: string;
  draft?: CollabEmailDraft;
  /** Called when the operator dismisses without sending (Cancel). */
  onClose: () => void;
  /** Called after a send is accepted (inline: SMTP ok; modal: queued). */
  onSent?: () => void;
  /** Called after Skip succeeds. */
  onSkipped?: () => void;
  /**
   * Inline mode (used by the onboarding Save → Review flow). When true the
   * pane awaits the send result and stays mounted on failure so the operator
   * can retry; the parent decides what "close" means. When false (standalone
   * modal) the legacy fire-and-forget behaviour is preserved: close
   * immediately, surface SMTP status via a toast.
   */
  inline?: boolean;
}

type Preview = Extract<CollabEmailPreviewResult, { ok: true }>;
type Attachment = Preview["attachments"][number];

export interface CollabEmailDraft {
  creatorName?: string;
  emailTo?: string;
  deliverables?: string[];
  agreedAmount?: string;
  barterAmount?: string;
  collabType?: string;
  adsUsageRights?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPreviewHtml(opts: {
  collabId: string;
  creatorName: string;
  agreedAmount: string;
  barterAmount: string;
  deliverables: string[];
  adsUsageRights: string;
  collabType: string;
}): string {
  const isPureBarter = opts.collabType.toLowerCase() === "barter";
  const garments = opts.barterAmount.trim();
  const barterText = garments
    ? `${garments} Product${garments === "1" ? "" : "s"}`
    : "as per order confirmation";
  const delivLines =
    opts.deliverables.map((d) => `<li>${esc(d)}</li>`).join("") +
    (opts.adsUsageRights
      ? `<li><strong>${esc(opts.adsUsageRights)}</strong> of Ads Usage Rights for ads/whitelisting and brand platforms</li>`
      : `<li>Ads Usage Rights for ads/whitelisting and brand platforms</li>`);
  const commercialsHtml = isPureBarter
    ? `<li>Barter Quantity: <strong>${esc(barterText)}</strong></li>`
    : `<li>Total Agreed Amount: <strong>₹${esc(opts.agreedAmount)}</strong></li><li>Barter Quantity: <strong>${esc(barterText)}</strong></li>`;

  const H =
    "font-weight:800;font-size:0.76rem;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #E7E2D2;padding-bottom:7px;color:#2C2420;margin:18px 0 8px;";

  return `<div style="background:#2C2420;margin:-18px -18px 18px;padding:18px 20px;border-radius:10px 10px 0 0;">
<div style="color:#F0C61E;font-weight:800;font-size:1rem;line-height:1.2;">Collaboration Confirmation</div>
<div style="color:rgba(255,255,255,0.64);font-size:0.72rem;margin-top:4px;letter-spacing:0.04em;text-transform:uppercase;">Collab ID: <strong style="color:#FFFCF8;">${esc(opts.collabId)}</strong></div>
</div>
<p style="margin:0 0 10px;">Hi <strong>${esc(opts.creatorName || "creator")}</strong>,</p>
<p style="margin:0 0 14px;">We're excited to move forward with this collaboration. Please find the confirmed collaboration details, timelines, payment terms, and content guidelines below.</p>
<p style="margin:0 0 8px;"><span style="display:inline-block;background:#F0EAD6;color:#2C2420;font-size:0.74rem;font-weight:800;padding:5px 10px;border-radius:999px;">COLLAB ID: ${esc(opts.collabId)}</span></p>
<p style="${H}">Agreed Deliverables</p>
<ul style="margin:0 0 8px;padding-left:18px;">${delivLines}</ul>
<p style="${H}">Commercials</p>
<ul style="margin:0 0 8px;padding-left:18px;">${commercialsHtml}</ul>
<p style="${H}">Timelines</p>
<ul style="margin:0 0 4px;padding-left:18px;"><li>Script Submission: <strong>Within 3 days</strong> of product delivery</li><li>First Draft Submission: <strong>Within 7 days</strong> of product delivery</li><li>Content Go Live: <strong>Within 10 days</strong> of product delivery</li></ul>
<p style="margin:0 0 8px;font-size:0.8rem;color:#6E695E;">All timelines counted from the date the product is delivered.</p>
<p style="${H}">Payment Terms</p>
<ul style="margin:0 0 8px;padding-left:18px;"><li>Payment is processed once all deliverables are live and the required ad partnership is active.</li><li>Standard cycle: one month after go-live, on the next applicable date — the <strong>15th or the 30th</strong>.</li><li>Reply with your invoice/bill mentioning <strong>Collab ID: ${esc(opts.collabId)}</strong>.</li></ul>
<p style="${H}">Content Guidelines</p>
<ul style="margin:0 0 8px;padding-left:18px;"><li>Hashtags: <strong>#RAHOSAADAA #PEHNOSAADAA #SAADAA</strong></li><li>Send the collaboration request to the agreed SAADAA handle.</li><li>Tag <strong>@saadaadesigns</strong> and <strong>@saadaa_women</strong> or <strong>@saadaa_men</strong>, and include them in the caption.</li><li>Pronounce SAADAA correctly <em>(voice note attached)</em> and spell it correctly in video, caption &amp; overlays.</li><li>Ensure the product is ironed and neatly presented before shooting.</li><li>Write the caption in your own style, clearly highlighting the brand and product.</li></ul>
<p style="${H}">Content Direction</p>
<p style="margin:0 0 6px;font-size:0.86rem;">Keep the content authentic and aligned with your usual style — natural, engaging, relevant to your audience.</p>
<p style="margin:0 0 12px;font-size:0.86rem;">Focus on clean visuals highlighting the product's fit, fabric, and look. Product and brand clearly visible throughout.</p>
<div style="background:#F0EAD6;border:1px solid #E8C87A;border-radius:10px;padding:12px 14px;margin:14px 0;">
<p style="margin:0;font-size:0.82rem;">Kindly review all details and reply with your confirmation. By confirming, you agree to the deliverables, commercials, timelines, payment terms, content guidelines, and usage rights above.</p>
</div>
<p style="margin:0 0 4px;">Looking forward to working together and creating great content.</p>
<p style="margin-top:16px;margin-bottom:0;">Thanks &amp; Regards,</p>
<p style="margin-top:4px;font-weight:800;color:#2C2420;font-size:1rem;letter-spacing:0.5px;">SAADAA Team</p>`;
}

/**
 * Stateful collab-email editor: preview, edit controls, send + skip.
 * Renders modal-body + modal-foot fragments only (no portal/backdrop) so it
 * can be embedded either inside `CollabEmailModal` (standalone) or inline in
 * the onboarding Save → Review flow.
 */
export function CollabEmailPane({
  postId,
  draft,
  onClose,
  onSent,
  onSkipped,
  inline = false,
}: CollabEmailPaneProps) {
  const [loading, startLoad] = useTransition();
  const [skipping, startSkip] = useTransition();
  const [sending, setSending] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const [emailTo, setEmailTo] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [agreedAmount, setAgreedAmount] = useState("0");
  const [barterAmount, setBarterAmount] = useState("0");
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [newDeliv, setNewDeliv] = useState("");

  useEffect(() => {
    if (!postId) return;
    setPreview(null);
    setLoadErr(null);
    setSendErr(null);
    setEmailTo("");
    setCreatorName("");
    setAgreedAmount("0");
    setBarterAmount("0");
    setDeliverables([]);
    setNewDeliv("");
    startLoad(async () => {
      const res = await getCollabEmailPreview(postId);
      if (!res.ok) {
        setLoadErr(res.error);
        return;
      }
      setPreview(res);
      setEmailTo(draft?.emailTo ?? res.emailTo);
      setCreatorName(draft?.creatorName ?? res.creatorName);
      setAgreedAmount(draft?.agreedAmount ?? res.agreedAmount);
      setBarterAmount(draft?.barterAmount ?? res.barterAmount);
      setDeliverables(draft?.deliverables ?? res.deliverables);
    });
  }, [draft, postId]);

  const addDeliverable = () => {
    const val = newDeliv.trim();
    if (!val) return;
    setDeliverables((d) => [...d, val]);
    setNewDeliv("");
  };

  const attachmentDriveIds =
    preview?.attachments
      .map((attachment) => attachment.driveId)
      .filter((driveId): driveId is string => Boolean(driveId)) ?? [];

  const handleSend = () => {
    if (!preview) return;
    const to = emailTo.trim();
    if (!to || !to.includes("@")) {
      const msg = "Enter a valid email address";
      setSendErr(msg);
      if (!inline) toast.error(msg);
      return;
    }
    setSendErr(null);
    const sendArgs = {
      postId,
      collabId: preview.collabId,
      emailTo: to,
      creatorName,
      agreedAmount,
      barterAmount,
      deliverables,
      adsUsageRights: draft?.adsUsageRights ?? preview.adsUsageRights,
      collabType: draft?.collabType ?? preview.collabType,
      attachmentDriveIds,
    };

    if (inline) {
      // Await the result: keep the pane open on failure so the operator can
      // retry. The saved onboarding is never lost — only the email retries.
      setSending(true);
      void sendCollabEmail(sendArgs).then((res) => {
        setSending(false);
        if (!res.ok) {
          setSendErr(res.error ?? "Failed to send email");
          toast.error(res.error ?? "Failed to send email");
          return;
        }
        toast.success(`Email sent to ${to}`);
        onSent?.();
      });
      return;
    }

    // Standalone modal: legacy fire-and-forget — close immediately, GAS runs
    // in the background, status surfaces via toast.
    onSent?.();
    toast.promise(
      sendCollabEmail(sendArgs).then((res) => {
        if (!res.ok) throw new Error(res.error ?? "Failed to send email");
        return res;
      }),
      {
        loading: `Sending to ${to}…`,
        success: () => `Email sent to ${to}`,
        error: (err: Error) => err.message,
      },
    );
  };

  const handleSkip = () => {
    startSkip(async () => {
      const res = await skipCollabEmail(postId);
      if (res.ok) {
        toast.success(inline ? "Saved — email skipped" : "Marked as skipped");
        onSkipped?.();
      } else {
        toast.error(res.error ?? "Failed to skip");
      }
    });
  };

  const isBusy = loading || skipping || sending;
  const canSend = !!preview && !isBusy && emailTo.trim().includes("@");

  const previewHtml = preview
    ? buildPreviewHtml({
        collabId: preview.collabId,
        creatorName,
        agreedAmount,
        barterAmount,
        deliverables,
        adsUsageRights: draft?.adsUsageRights ?? preview.adsUsageRights,
        collabType: draft?.collabType ?? preview.collabType,
      })
    : "";

  return (
    <>
      <div className="modal-body collab-email-body">
        {inline && (
          <div
            className="alert"
            style={{
              background: "var(--color-success-bg)",
              color: "var(--color-success-text)",
              border: "1px solid var(--color-success-text)",
              marginBottom: "0.75rem",
            }}
          >
            <CheckCircle2 size={14} aria-hidden />
            Onboarding saved. Review and send the collaboration email below, or
            skip it for now.
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-secondary">
            <Loader2 size={28} className="animate-spin" aria-hidden />
            <span className="text-sm">Building email preview…</span>
          </div>
        )}

        {/* Preview load error */}
        {!loading && loadErr && (
          <div className="ob-form-error-banner">
            <AlertTriangle size={14} aria-hidden />
            {loadErr}
          </div>
        )}

        {/* Form content */}
        {!loading && preview && (
          <>
            {sendErr && (
              <div className="ob-form-error-banner">
                <AlertTriangle size={14} aria-hidden />
                {sendErr} — fix and retry; your onboarding is already saved.
              </div>
            )}

            <section
              className="collab-email-overview"
              aria-label="Email overview"
            >
              <div className="collab-email-overview__header">
                <span>Overview</span>
                <span className="chip chip--info">
                  {draft?.collabType ?? preview.collabType}
                </span>
              </div>

              {/* TO */}
              <div className="collab-email-field collab-email-field--full">
                <label className="ob-form-label">
                  TO (Influencer Email){" "}
                  <span style={{ color: "var(--color-danger-text)" }}>*</span>
                </label>
                <input
                  type="email"
                  className="ob-input"
                  placeholder="influencer@email.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
                {!emailTo && (
                  <p
                    className="flex items-center gap-1 mt-1 text-xs"
                    style={{ color: "var(--color-danger-text)" }}
                  >
                    <AlertTriangle size={11} aria-hidden />
                    No email on file, enter manually.
                  </p>
                )}
              </div>

              {/* Subject */}
              <div className="collab-email-field collab-email-field--full">
                <label className="ob-form-label">SUBJECT</label>
                <input
                  type="text"
                  className="ob-input"
                  value={`Collaboration Confirmation | Collab ID: ${preview.collabId}`}
                  readOnly
                />
              </div>

              {/* Creator name + Amounts */}
              <div className="collab-email-field">
                <div>
                  <label className="ob-form-label">CREATOR NAME</label>
                  <input
                    type="text"
                    className="ob-input"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                  />
                </div>
              </div>
              <div className="collab-email-field">
                <div>
                  <label className="ob-form-label">TOTAL AGREED AMOUNT (₹)</label>
                  <input
                    type="text"
                    className="ob-input"
                    value={agreedAmount}
                    onChange={(e) => setAgreedAmount(e.target.value)}
                    disabled={
                      (
                        draft?.collabType ?? preview.collabType
                      ).toLowerCase() === "barter"
                    }
                  />
                </div>
              </div>
              <div className="collab-email-field">
                <div>
                  <label className="ob-form-label">BARTER (No. of Products)</label>
                  <input
                    type="text"
                    className="ob-input"
                    inputMode="numeric"
                    value={barterAmount}
                    onChange={(e) => setBarterAmount(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Deliverables */}
            <section
              className="collab-email-overview collab-email-deliverables"
              aria-label="Deliverables"
            >
              <div className="collab-email-overview__header">
                <span>Deliverables</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {deliverables.map((d, i) => (
                  <span
                    key={i}
                    className="pill"
                    style={{
                      background: "var(--color-bg-ecru)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border)",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      padding: "5px 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() =>
                        setDeliverables((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                      style={{
                        background: "none",
                        border: "none",
                        padding: "0 0 0 2px",
                        cursor: "pointer",
                        color: "var(--color-text-secondary)",
                        fontSize: "0.85rem",
                        lineHeight: 1,
                      }}
                      aria-label={`Remove ${d}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="ob-input"
                  placeholder="e.g. 2 Reels"
                  value={newDeliv}
                  onChange={(e) => setNewDeliv(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDeliverable();
                    }
                  }}
                />
                <button
                  type="button"
                  className="action-btn"
                  onClick={addDeliverable}
                >
                  <Plus size={11} aria-hidden />
                  Add
                </button>
              </div>
            </section>

            {/* Attachments */}
            <section
              className="collab-email-overview collab-email-attachments"
              aria-label="Email attachments"
            >
              <div className="collab-email-overview__header">
                <span>Attachments</span>
              </div>
              <div className="collab-email-attachment-list">
                {preview.attachments.map((attachment) => (
                  <AttachmentRow
                    key={attachment.kind}
                    attachment={attachment}
                  />
                ))}
              </div>
            </section>

            {/* Email preview pane */}
            <section
              className="collab-email-template"
              aria-label="Email template preview"
            >
              <label className="ob-form-label">EMAIL PREVIEW</label>
              <div
                className="collab-email-preview"
                 
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </section>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="modal-foot collab-email-footer">
        {preview && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: "var(--color-text-secondary)" }}
            onClick={handleSkip}
            disabled={isBusy}
          >
            {skipping && (
              <Loader2 size={11} className="animate-spin" aria-hidden />
            )}
            {inline ? "Save & Skip Email" : "Mark as Skipped"}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          disabled={isBusy}
        >
          {inline ? "Close" : "Cancel"}
        </button>
        <button
          type="button"
          className="btn-primary-cta"
          onClick={handleSend}
          disabled={!canSend}
        >
          {sending ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <Send size={13} aria-hidden />
          )}
          {sending ? "Sending…" : "Send Email"}
        </button>
      </footer>
    </>
  );
}

export function CollabEmailModal({
  postId,
  open,
  onClose,
  draft,
}: CollabEmailModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--onboarding">
      <div className="modal-panel modal-panel--lg modal-panel--onboarding collab-email-modal">
        <header className="modal-head">
          <div className="flex items-center gap-2 min-w-0">
            <Mail size={16} aria-hidden />
            <h2 className="font-semibold">Collaboration Email</h2>
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

        <CollabEmailPane
          postId={postId}
          draft={draft}
          onClose={onClose}
          onSent={onClose}
          onSkipped={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const isAttached = attachment.status === "attached";

  return (
    <div className="collab-email-attachment" data-status={attachment.status}>
      <span className="collab-email-attachment__icon">
        {isAttached ? (
          <CheckCircle2 size={14} aria-hidden />
        ) : (
          <AlertTriangle size={14} aria-hidden />
        )}
      </span>
      <div className="collab-email-attachment__copy">
        <span>{attachment.label}</span>
        <strong>{attachment.fileName}</strong>
        {attachment.note && <small>{attachment.note}</small>}
      </div>
      {attachment.url && (
        <a
          className="collab-email-attachment__link"
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${attachment.label}`}
        >
          <FileText size={13} aria-hidden />
          <ExternalLink size={11} aria-hidden />
        </a>
      )}
    </div>
  );
}
