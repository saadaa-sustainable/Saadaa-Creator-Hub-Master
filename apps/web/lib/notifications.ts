import "server-only";
import { sendMail } from "./email";
import { createServiceClient } from "./supabase/server";

/**
 * Wave 7 — Shrishti's Email Notifications & Alerts matrix.
 *
 * Single fire-and-forget notification helper that mirrors the
 * sendCollabEmail / sheet-revision pattern: send via the EXISTING Gmail SMTP
 * transport (lib/email.ts sendMail) + log every attempt to `email_logs` with a
 * distinct `email_type`. Never throws — every notification path is best-effort
 * so it can be dropped into Next.js `after()` without risking the user-facing
 * action.
 *
 * Reply-to-email only (D16 — no creator portal exists), so emails carry no
 * action links the recipient can click to a CreatorHub page; they reply.
 *
 * ─── TODO(cron) ──────────────────────────────────────────────────────────────
 * The TIME-BASED notifications below are intentionally NOT built here. They
 * need pg_cron + per-row idempotency sent-flags (added additively in
 * supabase/migrations/2026_06_06_notification_flags.sql, NOT YET APPLIED) and
 * are a focused follow-up. Planned wiring — a single edge function (or an
 * extension of scrape-pending-apify) runs daily, queries the relevant rows,
 * calls sendNotification(...) once per row, then stamps the sent-flag so it
 * never re-fires:
 *
 *   • Pending Onboarding      → assigned user. posts.workflow_status='Reach Out'
 *                               older than N days. (no flag column yet — reuse a
 *                               reach_out_followup_sent_at if added.)
 *   • Posting Pending         → assigned user. posts.workflow_status='On Board'
 *                               past est_delivery + buffer. Flag:
 *                               posts.posting_pending_sent_at.
 *   • Content Submission      → creator. posts on 'On Board' approaching the
 *     Reminder                  10-day-after-product content deadline. Flag:
 *                               posts.content_reminder_sent_at.
 *   • Payment Eligibility      → accounts team. payments flip Not Due→Due
 *     Achieved                  (recomputePaymentStates). Flag:
 *                               payments.eligibility_email_sent.
 *   • Payment Pending / SLA    → accounts team / global admins. payments Due
 *     breach                    past estimated_payable_date + grace. Flag:
 *                               payments.sla_breach_alert_sent.
 *   • Campaign Ending Soon     → creating user + global admins. campaigns with
 *                               end_date within N days. Flag:
 *                               campaigns.ending_alert_sent.
 *   • User Invitation          → invited user. Needs an invite-token table +
 *                               an /auth/accept route — separate work item.
 *
 * Each cron type should reuse sendNotification() with its own NOTIFICATION_TYPES
 * email_type so the Error Portal / email_logs audit stays consistent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Canonical email_type values. Keeping them centralised means email_logs queries
 * (and the deferred cron) reference one source of truth instead of stringly-typed
 * literals scattered across actions.
 */
export const NOTIFICATION_TYPES = {
  CAMPAIGN_CREATED: "campaign_created",
  PAYMENT_PROCESSED: "payment_processed",
  // ── deferred (cron) ──
  PENDING_ONBOARDING: "pending_onboarding",
  POSTING_PENDING: "posting_pending",
  CONTENT_REMINDER: "content_reminder",
  PAYMENT_ELIGIBLE: "payment_eligible",
  PAYMENT_SLA_BREACH: "payment_sla_breach",
  CAMPAIGN_ENDING: "campaign_ending",
  USER_INVITATION: "user_invitation",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface SendNotificationInput {
  /** email_type stamped on the email_logs row. */
  type: string;
  /** One or more recipients. Empty / blank entries are dropped; if nothing is
   *  left the send is skipped silently (logged as no-op only via early return). */
  to: string | string[];
  subject: string;
  /** Inner HTML body. The shared branded wrapper is applied automatically; pass
   *  pre-wrapped HTML only when `wrap` is false. */
  htmlBody: string;
  /** Plain-text fallback (optional). */
  plainBody?: string;
  /** Reply-to address (D16 reply-to flow). Defaults to the SMTP sender. */
  replyTo?: string;
  postId?: string | null;
  collabId?: string | null;
  /** Set false if htmlBody is already a full document. Default true. */
  wrap?: boolean;
}

export interface SendNotificationResult {
  ok: boolean;
  sent: number;
  skipped: boolean;
  error?: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shared branded HTML wrapper — same Saadaa dark-header / ecru-body styling as
 * the collab email, factored down to a reusable shell. `title` renders as the
 * pill-style eyebrow; `bodyHtml` is the caller's inner content (already safe).
 */
export function wrapNotificationHtml(opts: {
  title: string;
  bodyHtml: string;
}): string {
  const title = escapeHtml(opts.title);
  return `<div style="font-family:Inter,Arial,sans-serif;color:#161513;max-width:600px;margin:0 auto;line-height:1.65;background:#FAF8F5;">
<div style="background:#2C2420;padding:22px 28px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td><h2 style="color:#F0C61E;margin:0;font-size:1.1rem;letter-spacing:0.2px;">${title}</h2></td><td align="right" style="vertical-align:middle;"><span style="background:#F0C61E;color:#2C2420;font-size:0.7rem;font-weight:800;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">Saadaa</span></td></tr></table>
</div>
<div style="background:#FAF8F5;padding:24px 28px;border:1px solid #E7E2D2;border-top:none;border-radius:0 0 12px 12px;">
${opts.bodyHtml}
</div>
<p style="font-size:0.7rem;color:#9A9384;text-align:center;margin-top:10px;padding-bottom:8px;">This email was sent via CreatorHub, Saadaa's Influencer Management Platform.</p>
</div>`;
}

function normalizeRecipients(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  return Array.from(
    new Set(
      arr
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes("@")),
    ),
  );
}

/**
 * Send one notification email (to all recipients, de-duped) and log each
 * recipient's attempt to email_logs. Best-effort: returns a result, never
 * throws. Skips silently when there are no resolvable recipients.
 */
export async function sendNotification(
  input: SendNotificationInput,
): Promise<SendNotificationResult> {
  try {
    const recipients = normalizeRecipients(input.to);
    if (recipients.length === 0) {
      return { ok: true, sent: 0, skipped: true };
    }

    const htmlBody =
      input.wrap === false
        ? input.htmlBody
        : wrapNotificationHtml({
            title: input.subject,
            bodyHtml: input.htmlBody,
          });

    let supabase: ReturnType<typeof createServiceClient> | null = null;
    try {
      supabase = createServiceClient();
    } catch {
      supabase = null;
    }

    let sent = 0;
    await Promise.all(
      recipients.map(async (to) => {
        let res: { ok: boolean; error?: string };
        try {
          res = await sendMail({
            to,
            subject: input.subject,
            htmlBody,
            plainBody: input.plainBody,
            replyTo: input.replyTo,
          });
        } catch (err) {
          res = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
        if (res.ok) sent++;
        if (supabase) {
          try {
            await (supabase as any).from("email_logs").insert({
              post_id: input.postId ?? null,
              collab_id: input.collabId ?? null,
              sent_to: to,
              subject: input.subject,
              email_type: input.type,
              status: res.ok ? "sent" : "failed",
              error: res.ok ? null : (res.error ?? "unknown"),
            });
          } catch {
            // email_logs insert is audit-only — never let it break the path.
          }
        }
      }),
    );

    return { ok: sent > 0, sent, skipped: false };
  } catch (err) {
    // Absolute backstop — a notification must never throw into its caller.
    console.error(
      "[notifications] sendNotification threw:",
      err instanceof Error ? err.message : String(err),
    );
    return {
      ok: false,
      sent: 0,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve active Global Admin email addresses from user_access (best-effort).
 * Returns a de-duped, lower-cased list; empty array on any error or no match.
 * Matches the role labels normalizeRole() collapses into "Global Admin".
 */
export async function resolveGlobalAdminEmails(): Promise<string[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await (supabase as any)
      .from("user_access")
      .select("email, role, active")
      .eq("active", true)
      .in("role", ["Global Admin", "Owner", "Owner Level", "Admin"]);
    return Array.from(
      new Set(
        ((data ?? []) as Array<{ email: string | null }>)
          .map((u) => (u.email ?? "").trim().toLowerCase())
          .filter((e) => e.length > 0 && e.includes("@")),
      ),
    );
  } catch {
    return [];
  }
}
