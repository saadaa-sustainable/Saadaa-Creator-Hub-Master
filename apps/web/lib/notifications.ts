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
 * action links the recipient can click to a CreatorHub page; they reply. (The
 * one exception is the User Invitation, which links to /login so the invitee
 * can sign in with Google — see below.)
 *
 * The six TIME-BASED notifications (Pending Onboarding, Posting Pending, Content
 * Reminder, Payment Eligibility, Payment SLA breach, Campaign Ending) are now
 * BUILT — a daily Vercel Cron at app/api/cron/notifications/route.ts runs each
 * idempotent check and stamps a per-row sent-flag so it fires once.
 *
 * The seventh, USER_INVITATION, is EVENT-DRIVEN (not cron): it is sent from the
 * user-panel invite action (features/user-panel/actions.ts) the moment an admin
 * invites someone. CreatorHub is Google-OAuth-only (passwordless), so there is
 * NO invite-token table, NO /auth/accept route and NO password to set — the
 * invited user's user_access row is already inserted (active), and they become
 * live the instant they sign in with the matching Google account. The invite
 * email therefore just points them to /login.
 *
 * Each notification reuses sendNotification() with its own NOTIFICATION_TYPES
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
  // ── submitter confirmations (Wave 7.x — emailed to the logged-in actor) ──
  REACHOUT_CONFIRMATION: "reachout_confirmation",
  INBOUND_CONFIRMATION: "inbound_confirmation",
  ONBOARDING_CONFIRMATION: "onboarding_confirmation",
  CAMPAIGN_CONFIRMATION: "campaign_confirmation",
  POSTING_CONFIRMATION: "posting_confirmation",
  PAYMENT_CONFIRMATION: "payment_confirmation",
  // ── event-driven alert ──
  SHOPIFY_VALIDATION_FAILED: "shopify_validation_failed",
  // ── deferred (cron) ──
  PENDING_ONBOARDING: "pending_onboarding",
  POSTING_PENDING: "posting_pending",
  CONTENT_REMINDER: "content_reminder",
  /** Creator-facing nudge 2 days before posts.est_delivery (§5.5 resolved). */
  DELIVERY_REMINDER: "delivery_reminder",
  PAYMENT_ELIGIBLE: "payment_eligible",
  PAYMENT_SLA_BREACH: "payment_sla_breach",
  /** Monthly payable-cycle digest to Accounts + Admins (12th → 15th, 27th → 30th). */
  ACCOUNTS_PAYABLE_DIGEST: "accounts_payable_digest",
  DAILY_CHANGELOG: "daily_changelog",
  CAMPAIGN_ENDING: "campaign_ending",
  USER_INVITATION: "user_invitation",
  /** Daily countdown to Global Admins over the last 3 days of the Meta
   *  token's Data Access window (the clock that stops Instagram fetching). */
  META_TOKEN_RENEWAL: "meta_token_renewal",
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
  /** Optional header band title override. Defaults to `subject` (matching the
   *  collab email, whose header reads the headline not the raw subject). */
  title?: string;
  /** Optional uppercase ID/context line in the header band (e.g. a POST ID),
   *  mirroring the collab email's "Collab ID: …" subtitle. */
  subtitle?: string;
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
 * Shared branded HTML wrapper — visually MATCHES the collab email
 * (features/onboarding/actions.ts buildCollabEmailHtml). Same dark-header band
 * (#2C2420), ecru body (#FAF8F5), Saadaa accent pill (#F0C61E), 600px max
 * width, 12px corners, and footer line. Factored so every system email reads
 * as one consistent family.
 *
 * `title`    — the gold eyebrow heading in the header band (e.g. "Reach-out logged").
 * `subtitle` — optional uppercase ID/context line under the title (mirrors the
 *              collab email's "Collab ID: …" line). Pass a raw label like
 *              "POST ID: SIF-12-P3-C1".
 * `bodyHtml` — the caller's inner content (already HTML-safe).
 */
export function wrapNotificationHtml(opts: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
}): string {
  const title = escapeHtml(opts.title);
  const subtitleHtml = opts.subtitle
    ? `<p style="color:rgba(255,255,255,0.66);margin:5px 0 0;font-size:0.78rem;letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(
        opts.subtitle,
      )}</p>`
    : "";
  return `<div style="font-family:Inter,Arial,sans-serif;color:#161513;max-width:600px;margin:0 auto;line-height:1.65;background:#FAF8F5;">
<div style="background:#2C2420;padding:24px 28px;border-radius:12px 12px 0 0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td><h2 style="color:#F0C61E;margin:0;font-size:1.18rem;letter-spacing:0.2px;">${title}</h2>${subtitleHtml}</td><td align="right" style="vertical-align:middle;"><span style="background:#F0C61E;color:#2C2420;font-size:0.7rem;font-weight:800;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">Saadaa</span></td></tr></table>
</div>
<div style="background:#FAF8F5;padding:26px 28px;border:1px solid #E7E2D2;border-top:none;border-radius:0 0 12px 12px;">
${opts.bodyHtml}
</div>
<p style="font-size:0.7rem;color:#9A9384;text-align:center;margin-top:10px;padding-bottom:8px;">This email was sent via CreatorHub, Saadaa's Influencer Management Platform.</p>
</div>`;
}

/**
 * Build a consistent submitter-confirmation body that matches the collab
 * email's interior: a greeting, a one/two-line summary, the same key/value
 * detail table (#F5F1EC label cells, #E7E2D2 borders), and the collab email's
 * "Thanks and Regards / Saadaa" signature block. Used by every submit-action
 * confirmation so they all look identical.
 *
 * All values are escaped here — callers pass plain strings.
 */
export function buildConfirmationBody(opts: {
  /** Actor's display name; greeting reads "Hi {greetName},". */
  greetName: string;
  /** One or two short summary lines (plain strings, rendered as <p>). */
  summaryLines: string[];
  /** Detail rows shown in the key/value table. Falsy values are dropped. */
  rows?: Array<{ label: string; value: string | number | null | undefined }>;
  /** Optional muted footnote under the table. */
  footnote?: string;
}): string {
  const esc = (s: string) => escapeHtml(s);
  const greet = esc(opts.greetName || "there");
  const summaryHtml = opts.summaryLines
    .filter((l) => l && l.trim().length > 0)
    .map(
      (l, i) =>
        `<p style="margin:0 0 ${
          i === opts.summaryLines.length - 1 ? "16" : "10"
        }px;">${esc(l)}</p>`,
    )
    .join("");

  const tableRows = (opts.rows ?? []).filter(
    (r) => r.value != null && String(r.value).trim().length > 0,
  );
  const tableHtml = tableRows.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">${tableRows
        .map(
          (r, i) =>
            `<tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;${
              i > 0 ? "border-top:0;" : ""
            }font-weight:800;width:40%;">${esc(
              r.label,
            )}</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;${
              i > 0 ? "border-top:0;" : ""
            }">${esc(String(r.value))}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const footnoteHtml = opts.footnote
    ? `<p style="margin:0;font-size:12px;color:#9A9384;">${esc(opts.footnote)}</p>`
    : "";

  return `<p style="margin:0 0 10px;">Hi <strong>${greet}</strong>,</p>
${summaryHtml}
${tableHtml}
${footnoteHtml}
<p style="margin-top:24px;margin-bottom:0;color:#6E695E;font-size:13px;">Thanks,</p>
<p style="margin-top:4px;font-size:1.02rem;font-weight:800;color:#2C2420;letter-spacing:0.4px;">Saadaa CreatorHub</p>`;
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
            title: input.title ?? input.subject,
            subtitle: input.subtitle,
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

/**
 * Resolve the budget approvers — ONLY the true Global Admins (the role that
 * carries `budget_approve`). Unlike resolveGlobalAdminEmails this must NOT
 * include the "Admin" role: budget approval emails go to akshay/mahesh/devesh.
 */
export async function resolveBudgetApproverEmails(): Promise<string[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await (supabase as any)
      .from("user_access")
      .select("email, role, active")
      .eq("active", true)
      .eq("role", "Global Admin");
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

/**
 * Resolve active Accounts-team email addresses from user_access (best-effort).
 * Returns a de-duped, lower-cased list; empty array on any error or no match.
 * "Accounts team" = active rows whose role is one of the accounts labels. The
 * cron's payment notifications (eligibility / SLA breach) target this set.
 */
export async function resolveAccountsTeamEmails(): Promise<string[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await (supabase as any)
      .from("user_access")
      .select("email, role, active")
      .eq("active", true)
      .in("role", ["Accounts Team", "Accounts"]);
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

/**
 * Submitter-confirmation helper — emails the logged-in actor a branded
 * confirmation for a form submission they just made. One call per submit
 * action; collapses the body-build + send into a single best-effort step that
 * is safe to drop inside Next.js `after()`.
 *
 * Best-effort by contract:
 *   • Skips silently when `actor` has no usable email (returns skipped).
 *   • Never throws — delegates to sendNotification's own backstop.
 *
 * The body always uses buildConfirmationBody so every confirmation matches the
 * collab email's interior (greeting → summary → key/value table → signature).
 */
export async function notifyActorConfirmation(opts: {
  /** The logged-in actor (from assertPermission). Only email/name are read. */
  actor: { email?: string | null; name?: string | null };
  /** email_type stamped on email_logs (use a NOTIFICATION_TYPES value). */
  type: string;
  /** Email subject line. */
  subject: string;
  /** Gold eyebrow heading in the header band. Defaults to `subject`. */
  title?: string;
  /** Optional uppercase ID/context line under the title. */
  subtitle?: string;
  /** One or two short summary lines for the body. */
  summaryLines: string[];
  /** Key/value detail rows (falsy values dropped). */
  rows?: Array<{ label: string; value: string | number | null | undefined }>;
  /** Optional muted footnote. */
  footnote?: string;
  postId?: string | null;
  collabId?: string | null;
}): Promise<SendNotificationResult> {
  const email = (opts.actor.email ?? "").trim();
  if (!email || !email.includes("@")) {
    return { ok: true, sent: 0, skipped: true };
  }
  const greetName = opts.actor.name?.trim() || email.split("@")[0] || "there";
  const htmlBody = buildConfirmationBody({
    greetName,
    summaryLines: opts.summaryLines,
    rows: opts.rows,
    footnote: opts.footnote,
  });
  const plainBody = [
    `Hi ${greetName},`,
    "",
    ...opts.summaryLines.filter((l) => l && l.trim().length > 0),
    ...(opts.rows ?? [])
      .filter((r) => r.value != null && String(r.value).trim().length > 0)
      .map((r) => `${r.label}: ${String(r.value)}`),
    ...(opts.footnote ? ["", opts.footnote] : []),
    "",
    "Thanks,",
    "Saadaa CreatorHub",
  ].join("\n");

  return sendNotification({
    type: opts.type,
    to: email,
    subject: opts.subject,
    title: opts.title,
    subtitle: opts.subtitle,
    htmlBody,
    plainBody,
    postId: opts.postId,
    collabId: opts.collabId,
  });
}
