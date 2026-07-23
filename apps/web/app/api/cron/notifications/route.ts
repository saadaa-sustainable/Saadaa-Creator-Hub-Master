import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  closeCampaignIfComplete,
  voidUnonboardedForCampaign,
} from "@/lib/campaign-lifecycle";
import { getCampaignAutoCloseEnabled } from "@/features/settings/actions";
import {
  NOTIFICATION_TYPES,
  resolveAccountsTeamEmails,
  resolveBudgetApproverEmails,
  resolveGlobalAdminEmails,
  sendNotification,
} from "@/lib/notifications";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getMetaTokenExpiry } from "@/lib/meta-token";

/**
 * Daily TIME-BASED (cron) email notifications — Wave 7 follow-up.
 *
 * One Route Handler that runs every idempotent check once per day. Each
 * check queries the rows that just crossed a threshold (and have NOT yet been
 * emailed, per their sent-flag column), sends a single branded notification via
 * sendNotification(), then STAMPS the sent-flag so a later run never re-fires
 * for the same row. Every send is best-effort and wrapped so one failing check
 * (or recipient) never aborts the others.
 *
 * Schedule: see vercel.json crons — daily at 04:00 UTC ("0 4 * * *").
 *
 * AUTH: every invocation must carry `Authorization: Bearer ${CRON_SECRET}`.
 *
 * SMTP: EMAIL_USER / EMAIL_PASS / EMAIL_FROM_NAME are set in Vercel prod, so
 * sendMail() delivers (every attempt is still logged to email_logs). Flags are
 * stamped once (fire-once by design, not retry-until-delivered).
 *
 * USER_INVITATION (the 7th Wave-7 notification) is NOT here — it is event-driven,
 * sent from the user-panel invite action the moment an admin invites someone.
 * CreatorHub is Google-OAuth-only, so it needs no invite-token table, no
 * /auth/accept route and no password; the invite email just links to /login.
 *
 * Supabase only. Flag columns are not in the generated types yet, so reads /
 * writes that touch them use `(supabase as any)`.
 */

// Route is invoked by the scheduler only; never statically optimized.
export const dynamic = "force-dynamic";
// Sequential best-effort sends over potentially many rows — give it headroom.
export const maxDuration = 60;

// ─── Tunable windows (top-of-file consts; comments explain each) ──────────────

/** Pending Onboarding: a Reach Out row is "stale" once its reach_out_date is
 *  older than this many days and onboarding still hasn't started. */
const PENDING_ONBOARDING_AFTER_DAYS = 3;

/** Posting Pending: alert the assigned user when est_delivery is within this
 *  many days (a value of 2 also catches already-passed dates, since we filter
 *  est_delivery <= today + 2). */
const POSTING_PENDING_WITHIN_DAYS = 2;

/** Content Submission Reminder: nudge the creator once their onboard_date is
 *  older than this many days but they still haven't Posted. */
const CONTENT_REMINDER_AFTER_DAYS = 7;

/** Delivery Reminder: nudge the creator this many days BEFORE est_delivery.
 *  The check uses a window (today .. today+N) so a missed cron day still sends
 *  while the deadline hasn't passed; the sent-flag keeps it to one email. */
const DELIVERY_REMINDER_DAYS_BEFORE = 2;

/** Payment Pending / SLA breach: a Due/Partial payment is breaching SLA once
 *  its due_date is older than this many days. */
const PAYMENT_SLA_BREACH_AFTER_DAYS = 7;

/** Campaign Ending Soon: warn the owner when end_date is within this many days
 *  (and still in the future). */
const CAMPAIGN_ENDING_WITHIN_DAYS = 7;

/** Workflow status labels that count as "onboarded, not yet posted". The live
 *  data uses 'On Board'; 'Order Sent' is included defensively for forward
 *  compatibility with the order-status stage. */
const ONBOARDED_STATUSES = ["On Board", "Order Sent"];
const DELIVERY_REMINDER_CLAIM = "delivery_reminder_claim";

// ─── Date helpers (date-only, UTC) ────────────────────────────────────────────

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** ISO yyyy-mm-dd for a Date offset by `days` from today (UTC). */
function isoDateOffset(days: number): string {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const nowIso = () => new Date().toISOString();

// ─── Auth guard ───────────────────────────────────────────────────────────────

function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`,
  );
}

// ─── Types for the rows we read (only the columns we use) ─────────────────────

interface PostRow {
  post_id: string | null;
  collab_id: string | null;
  inf_id: string | null;
  username: string | null;
  email: string | null;
  onboarded_by: string | null;
  reach_out_date: string | null;
  onboard_date: string | null;
  est_delivery: string | null;
  workflow_status: string | null;
  deliverable_index: number | null;
}

interface PaymentRow {
  id: number;
  collab_id: string | null;
  inf_id: string | null;
  username: string | null;
  amount: number | null;
  status: string | null;
  due_date: string | null;
}

interface CampaignRow {
  id: number;
  campaign_id: string | null;
  campaign_name: string | null;
  end_date: string | null;
  created_by: string | null;
}

interface PayableDigestRow {
  post_id: string;
  collab_id: string | null;
  inf_id: string | null;
  creator_name: string | null;
  username: string | null;
  outstanding: number | string;
  status: string | null;
  due_date: string | null;
  bank_name: string | null;
  bank_number: string | null;
  ifsc: string | null;
}

// ─── Recipient resolution ─────────────────────────────────────────────────────

/**
 * Resolve the "assigned user" email from posts.onboarded_by. The column stores
 * either an email or a display name. If it already looks like an email we use
 * it; otherwise we best-effort match it against user_access.name → email, and
 * skip (empty) if no match.
 */
function resolveAssignedUserEmail(
  onboardedBy: string | null,
  nameToEmail: Map<string, string>,
): string | null {
  const v = (onboardedBy ?? "").trim();
  if (!v) return null;
  if (v.includes("@")) return v.toLowerCase();
  const hit = nameToEmail.get(v.toLowerCase());
  return hit ?? null;
}

/** Build a name→email lookup from active user_access rows (best-effort). */
async function buildNameToEmailMap(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await (supabase as any)
      .from("user_access")
      .select("name, email, active")
      .eq("active", true);
    for (const u of (data ?? []) as Array<{
      name: string | null;
      email: string | null;
    }>) {
      const name = (u.name ?? "").trim().toLowerCase();
      const email = (u.email ?? "").trim().toLowerCase();
      if (name && email && email.includes("@") && !map.has(name)) {
        map.set(name, email);
      }
    }
  } catch {
    // best-effort — assigned-user resolution just falls back to skip-on-no-match.
  }
  return map;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (err) {
    return NextResponse.json(
      {
        ran: false,
        error: err instanceof Error ? err.message : "service client unavailable",
      },
      { status: 500 },
    );
  }

  const sent: Record<string, number> = {
    meta_token_renewal: 0,
    pending_onboarding: 0,
    posting_pending: 0,
    delivery_reminder: 0,
    content_reminder: 0,
    payment_eligible: 0,
    payment_sla_breach: 0,
    accounts_payable_digest: 0,
    campaign_ending: 0,
    campaign_closed: 0,
    campaign_completed: 0,
  };

  // Resolve shared recipient sets / lookups once.
  const [accountsTeam, globalAdmins, nameToEmail] = await Promise.all([
    resolveAccountsTeamEmails(),
    resolveGlobalAdminEmails(),
    buildNameToEmailMap(supabase),
  ]);

  const claimDelivery = async (
    emailType: string,
    key: string,
    recipients: string[],
    subject: string,
  ): Promise<number | null> => {
    const { data, error } = await (supabase as any)
      .from("email_logs")
      .insert({
        post_id: key,
        collab_id: key,
        sent_to: recipients.join(", "),
        subject,
        email_type: emailType,
        status: "sending",
        error: null,
      })
      .select("id")
      .single();
    if (error?.code !== "23505") {
      if (error) console.error("[cron/notifications] delivery claim failed:", error.message);
      return data?.id ?? null;
    }

    const existing = await (supabase as any)
      .from("email_logs")
      .select("id, status")
      .eq("post_id", key)
      .eq("email_type", emailType)
      .single();
    if (!existing.data || existing.data.status !== "failed") return null;

    const retry = await (supabase as any)
      .from("email_logs")
      .update({ status: "sending", error: null, created_at: nowIso() })
      .eq("id", existing.data.id)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (retry.error) {
      console.error("[cron/notifications] delivery retry claim failed:", retry.error.message);
    }
    return retry.data?.id ?? null;
  };

  const finalizeDelivery = async (
    id: number,
    ok: boolean,
    error?: string | null,
  ) => {
    const result = await (supabase as any)
      .from("email_logs")
      .update({
        status: ok ? "sent" : "failed",
        error: error ?? (ok ? null : "SMTP delivery failed"),
      })
      .eq("id", id);
    if (result.error) {
      console.error("[cron/notifications] delivery finalization failed:", result.error.message);
    }
  };

  const requestedJob = req.nextUrl.searchParams.get("job");
  if (requestedJob && !hasCronSecret(req)) {
    return NextResponse.json({ ran: false, error: "Unauthorized" }, { status: 401 });
  }
  if (requestedJob && !["delivery_reminder", "accounts_payable_digest"].includes(requestedJob)) {
    return NextResponse.json({ ran: false, error: "Unknown notification job" }, { status: 400 });
  }
  if (requestedJob === "delivery_reminder") {
    await sendDeliveryReminders();
    return NextResponse.json({ ran: true, sent });
  }
  if (requestedJob === "accounts_payable_digest") {
    await sendAccountsPayableDigest();
    return NextResponse.json({ ran: true, sent });
  }

  // ── 0. Meta token renewal countdown ────────────────────────────────────────
  // One email per day to the Global Admins across the LAST THREE DAYS of the
  // Meta token's Data Access window (e.g. expiry 10 Sep → 8th, 9th and 10th).
  // Meta's debugger shows the token as "Expires: Never", but the Data Access
  // window is the clock that actually stops Instagram fetching. Deduped via an
  // app_settings date stamp so re-runs never double-send.
  try {
    const expiry = await getMetaTokenExpiry();
    if (expiry?.expiresAt != null) {
      const wholeDaysLeft = Math.floor(
        (expiry.expiresAt - Date.now()) / 86_400_000,
      );
      if (wholeDaysLeft >= 0 && wholeDaysLeft <= 2) {
        const todayIst = new Date(Date.now() + 5.5 * 3_600_000)
          .toISOString()
          .slice(0, 10);
        const { data: lastRow } = await (supabase as any)
          .from("app_settings")
          .select("value")
          .eq("key", "meta_token_renewal_alert_last")
          .maybeSingle();
        const alreadySentToday =
          String((lastRow as { value?: unknown } | null)?.value ?? "").trim() ===
          todayIst;
        const approvers = await resolveBudgetApproverEmails();
        if (!alreadySentToday && approvers.length > 0) {
          const dateText = new Date(expiry.expiresAt).toLocaleDateString(
            "en-IN",
            { day: "numeric", month: "long", year: "numeric" },
          );
          const issuedText = expiry.issuedAt
            ? new Date(expiry.issuedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : null;
          const urgency =
            wholeDaysLeft === 0
              ? "TODAY"
              : wholeDaysLeft === 1
                ? "tomorrow"
                : `in ${wholeDaysLeft} days`;
          const r = await sendNotification({
            type: NOTIFICATION_TYPES.META_TOKEN_RENEWAL,
            to: approvers,
            subject: `Meta token renewal needed — Instagram fetching stops ${urgency} (${dateText})`,
            title: "Meta token renewal needed",
            subtitle: `DATA ACCESS ENDS: ${dateText}`,
            htmlBody: `<p style="margin:0 0 12px;">The Meta access token's <strong>Data Access window ends ${urgency}</strong> (${dateText})${issuedText ? ` — it was last renewed on <strong>${issuedText}</strong>` : ""}. When it ends, every Instagram fetch in CreatorHub stops — Reach Out profile fetches, post lookups and partnership checks all fail until the token is renewed.</p>
<p style="margin:0 0 8px;"><strong>What to do (takes ~5 minutes):</strong></p>
<ol style="margin:0 0 12px;padding-left:18px;">
<li>Log in to Meta / Graph API Explorer with the account that owns the token (Mahesh's).</li>
<li>Generate a fresh long-lived access token with the same permissions (instagram_basic, instagram_manage_insights, business_management…).</li>
<li>Update <strong>META_GRAPH_API_TOKEN</strong> in Vercel env and redeploy — or hand the new token to the tech team to swap.</li>
</ol>
<p style="margin:0;font-size:12px;color:#9A9384;">Note: Meta's debugger shows the token as "Expires: Never" — that's the token string. The Data Access window is the separate 90-day clock this alert counts. The header pill in CreatorHub shows the live countdown.</p>`,
            plainBody: `The Meta token's Data Access window ends ${urgency} (${dateText}). Instagram fetching in CreatorHub stops when it does. Renew: generate a fresh long-lived token with the same permissions and update META_GRAPH_API_TOKEN in Vercel.`,
          });
          if (r.ok) {
            sent.meta_token_renewal = approvers.length;
            await (supabase as any).from("app_settings").upsert(
              {
                key: "meta_token_renewal_alert_last",
                value: todayIst,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key" },
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("[cron] meta_token_renewal failed:", err);
  }

  // Deadline and payout emails must run before historical staff backlogs can
  // consume the route's runtime budget.
  await sendDeliveryReminders();
  await sendAccountsPayableDigest();

  // ── 1. Pending Onboarding ───────────────────────────────────────────────────
  // Reach Out posts whose reach_out_date is older than the window AND not yet
  // alerted. → assigned user (onboarded_by). Stamp onboarding_pending_sent_at.
  try {
    const cutoff = isoDateOffset(-PENDING_ONBOARDING_AFTER_DAYS);
    const { data } = await (supabase as any)
      .from("posts")
      .select(
        "post_id, collab_id, inf_id, username, onboarded_by, reach_out_date, workflow_status",
      )
      .eq("workflow_status", "Reach Out")
      .lt("reach_out_date", cutoff)
      .is("onboarding_pending_sent_at", null);
    for (const p of (data ?? []) as PostRow[]) {
      const to = resolveAssignedUserEmail(p.onboarded_by, nameToEmail);
      if (to) {
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.PENDING_ONBOARDING,
          to,
          subject: `Pending onboarding: ${p.collab_id ?? p.post_id ?? "collab"}`,
          title: "Onboarding still pending",
          subtitle: p.collab_id ? `COLLAB: ${p.collab_id}` : undefined,
          htmlBody: `<p style="margin:0 0 12px;">This reach-out has been sitting in <strong>Reach Out</strong> for more than ${PENDING_ONBOARDING_AFTER_DAYS} days without progressing to onboarding.</p>
<ul style="margin:0 0 12px;padding-left:18px;">
<li><strong>Collab:</strong> ${p.collab_id ?? "—"}</li>
<li><strong>Post:</strong> ${p.post_id ?? "—"}</li>
<li><strong>Creator:</strong> ${p.username ?? p.inf_id ?? "—"}</li>
<li><strong>Reached out:</strong> ${p.reach_out_date ?? "—"}</li>
</ul>
<p style="margin:0;">Please onboard the creator or update the status.</p>`,
          collabId: p.collab_id,
          postId: p.post_id,
        });
        if (r.ok) sent.pending_onboarding++;
      }
      // Stamp regardless of recipient/send so it fires at most once per row.
      await (supabase as any)
        .from("posts")
        .update({ onboarding_pending_sent_at: nowIso() })
        .eq("post_id", p.post_id);
    }
  } catch (err) {
    console.error("[cron/notifications] pending_onboarding check failed:", err);
  }

  // ── 2. Posting Pending ──────────────────────────────────────────────────────
  // On Board / Order Sent posts whose est_delivery is within the window (or past)
  // AND not yet alerted. → assigned user. Stamp posting_pending_sent_at.
  try {
    const within = isoDateOffset(POSTING_PENDING_WITHIN_DAYS);
    const { data } = await (supabase as any)
      .from("posts")
      .select(
        "post_id, collab_id, inf_id, username, onboarded_by, est_delivery, workflow_status",
      )
      .in("workflow_status", ONBOARDED_STATUSES)
      .not("est_delivery", "is", null)
      .lte("est_delivery", within)
      .is("posting_pending_sent_at", null);
    for (const p of (data ?? []) as PostRow[]) {
      const to = resolveAssignedUserEmail(p.onboarded_by, nameToEmail);
      if (to) {
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.POSTING_PENDING,
          to,
          subject: `Posting due: ${p.collab_id ?? p.post_id ?? "collab"}`,
          title: "Content posting is due",
          subtitle: p.collab_id ? `COLLAB: ${p.collab_id}` : undefined,
          htmlBody: `<p style="margin:0 0 12px;">The estimated delivery date for this collab is on or before <strong>${p.est_delivery ?? "—"}</strong>, but it hasn't moved to <strong>Posted</strong> yet.</p>
<ul style="margin:0 0 12px;padding-left:18px;">
<li><strong>Collab:</strong> ${p.collab_id ?? "—"}</li>
<li><strong>Post:</strong> ${p.post_id ?? "—"}</li>
<li><strong>Creator:</strong> ${p.username ?? p.inf_id ?? "—"}</li>
<li><strong>Est. delivery:</strong> ${p.est_delivery ?? "—"}</li>
</ul>
<p style="margin:0;">Please follow up on the content and update the posting status.</p>`,
          collabId: p.collab_id,
          postId: p.post_id,
        });
        if (r.ok) sent.posting_pending++;
      }
      await (supabase as any)
        .from("posts")
        .update({ posting_pending_sent_at: nowIso() })
        .eq("post_id", p.post_id);
    }
  } catch (err) {
    console.error("[cron/notifications] posting_pending check failed:", err);
  }

  // ── 2b. Delivery Reminder (creator) ─────────────────────────────────────────
  // Onboarded, not yet Posted, est_delivery approaching (today .. today+2). →
  // the CREATOR (post.email), a gentle pre-deadline nudge to share the reel.
  // Fires once per post (delivery_reminder_sent_at). Deadline already passed is
  // excluded — that case is the team-facing Posting Pending alert above.
  async function sendDeliveryReminders() {
    try {
      const upper = isoDateOffset(DELIVERY_REMINDER_DAYS_BEFORE);
    const today = isoDateOffset(0);
    const { data } = await (supabase as any)
      .from("posts")
      .select(
        "post_id, collab_id, inf_id, username, email, onboarded_by, est_delivery, workflow_status, deliverable_index",
      )
      .in("workflow_status", ONBOARDED_STATUSES)
      .not("est_delivery", "is", null)
      .gte("est_delivery", today)
      .lte("est_delivery", upper)
      .is("delivery_reminder_sent_at", null);
    const rows = (data ?? []) as PostRow[];
    const byCollab = new Map<string, PostRow>();
    for (const row of rows) {
      const key = row.collab_id ?? row.post_id;
      if (!key) continue;
      const current = byCollab.get(key);
      if (!current || Number(row.deliverable_index) === 1) byCollab.set(key, row);
    }
    const reminders = Array.from(byCollab.values());

    // Creator display names: creators.inf_name (best-effort; fallback handle).
    const infIds = Array.from(
      new Set(reminders.map((p) => p.inf_id).filter((v): v is string => !!v)),
    );
    const infNameById = new Map<string, string>();
    if (infIds.length > 0) {
      try {
        const { data: creators } = await (supabase as any)
          .from("creators")
          .select("inf_id, inf_name")
          .in("inf_id", infIds);
        for (const c of (creators ?? []) as Array<{
          inf_id: string | null;
          inf_name: string | null;
        }>) {
          const name = (c.inf_name ?? "").trim();
          if (c.inf_id && name) infNameById.set(c.inf_id, name);
        }
      } catch {
        // best-effort — greeting falls back to the handle.
      }
    }

    const escText = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const p of reminders) {
      const to = (p.email ?? "").trim();
      if (to && to.includes("@")) {
        const onboarder = resolveAssignedUserEmail(p.onboarded_by, nameToEmail);
        const creatorName =
          (p.inf_id ? infNameById.get(p.inf_id) : undefined) ??
          p.username ??
          "there";
        const estText = p.est_delivery
          ? new Date(`${p.est_delivery}T00:00:00Z`).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })
          : "—";
        const subject =
          `Reminder: your reel delivery date is coming up (${p.collab_id ?? p.post_id ?? ""})`.trim();
        const bcc = [onboarder, ...globalAdmins].filter(
          (email): email is string => Boolean(email),
        );
        const claimId = await claimDelivery(
          DELIVERY_REMINDER_CLAIM,
          `edd:${p.collab_id ?? p.post_id}`,
          [to, ...bcc],
          subject,
        );
        if (!claimId) continue;
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.DELIVERY_REMINDER,
          to,
          bcc,
          subject,
          title: "Your reel delivery date is coming up",
          subtitle: p.collab_id ? `COLLAB: ${p.collab_id}` : undefined,
          htmlBody: `<p style="margin:0 0 14px;">Hey <strong>${escText(creatorName)}</strong>! &#128075;</p>
<p style="margin:0 0 14px;">Hope you're doing well.</p>
<p style="margin:0 0 14px;">This is a gentle reminder that the delivery deadline for your reel is coming up soon. We'd really appreciate it if you could share the final reel with us at your earliest convenience. Receiving it in advance allows our team enough time to review the content and share any feedback, if required, before the final submission deadline.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 14px;">
<tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;font-weight:800;width:40%;">Collab ID</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;">${escText(p.collab_id ?? "—")}</td></tr>
<tr><td style="padding:7px 10px;background:#F5F1EC;border:1px solid #E7E2D2;border-top:0;font-weight:800;width:40%;">Estimated Delivery Date</td><td style="padding:7px 10px;border:1px solid #E7E2D2;border-left:0;border-top:0;">${escText(estText)}</td></tr>
</table>
<p style="margin:0 0 14px;">If you're experiencing any delays or have any questions regarding the campaign brief or deliverables, please don't hesitate to let us know. We're happy to assist and ensure everything stays on track.</p>
<p style="margin:0 0 16px;">We appreciate your cooperation and look forward to receiving your reel soon. Thank you! &#128522;</p>
<p style="margin:0 0 0;font-size:12.5px;color:#9A9384;border-top:1px solid #E7E2D2;padding-top:12px;"><strong>Note:</strong> If you've already shared your reel with us for review, please feel free to disregard this message. Thank you.</p>
<p style="margin-top:24px;margin-bottom:0;color:#6E695E;font-size:13px;">Thanks,</p>
<p style="margin-top:4px;font-size:1.02rem;font-weight:800;color:#2C2420;letter-spacing:0.4px;">Saadaa CreatorHub</p>`,
          plainBody: [
            `Hey ${creatorName}! 👋`,
            "",
            "Hope you're doing well.",
            "",
            "This is a gentle reminder that the delivery deadline for your reel is coming up soon. We'd really appreciate it if you could share the final reel with us at your earliest convenience. Receiving it in advance allows our team enough time to review the content and share any feedback, if required, before the final submission deadline.",
            "",
            `Collab ID: ${p.collab_id ?? "—"}`,
            `Estimated Delivery Date: ${estText}`,
            "",
            "If you're experiencing any delays or have any questions regarding the campaign brief or deliverables, please don't hesitate to let us know. We're happy to assist and ensure everything stays on track.",
            "",
            "We appreciate your cooperation and look forward to receiving your reel soon. Thank you! 😊",
            "",
            "Note: If you've already shared your reel with us for review, please feel free to disregard this message. Thank you.",
            "",
            "Thanks,",
            "Saadaa CreatorHub",
          ].join("\n"),
          collabId: p.collab_id,
          postId: p.post_id,
        });
        if (!r.ok) {
          await finalizeDelivery(claimId, false, r.error);
          continue;
        }

        let stampQuery = (supabase as any)
          .from("posts")
          .update({ delivery_reminder_sent_at: nowIso() })
          .is("delivery_reminder_sent_at", null);
        stampQuery = p.collab_id
          ? stampQuery.eq("collab_id", p.collab_id)
          : stampQuery.eq("post_id", p.post_id);
        const stamp = await stampQuery;
        if (stamp.error) {
          console.error("[cron/notifications] delivery reminder stamp failed:", stamp.error.message);
        }
        sent.delivery_reminder++;
        await finalizeDelivery(
          claimId,
          true,
          stamp.error ? `Email sent; calendar stamp failed: ${stamp.error.message}` : null,
        );
      }
    }
    } catch (err) {
      console.error("[cron/notifications] delivery_reminder check failed:", err);
    }
  }

  // ── 3. Content Submission Reminder ───────────────────────────────────────────
  // Onboarded (On Board / Order Sent) not yet Posted, onboard_date older than the
  // window AND not yet reminded. → influencer (post.email; creators has no email
  // column, so post.email is the source). Stamp content_reminder_sent_at.
  try {
    const cutoff = isoDateOffset(-CONTENT_REMINDER_AFTER_DAYS);
    const { data } = await (supabase as any)
      .from("posts")
      .select(
        "post_id, collab_id, inf_id, username, email, onboard_date, workflow_status",
      )
      .in("workflow_status", ONBOARDED_STATUSES)
      .not("onboard_date", "is", null)
      .lt("onboard_date", cutoff)
      .is("content_reminder_sent_at", null);
    for (const p of (data ?? []) as PostRow[]) {
      // Influencer email: post.email is the canonical source. (creators table
      // has no email column; best-effort fallback intentionally omitted.)
      const to = (p.email ?? "").trim();
      if (to && to.includes("@")) {
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.CONTENT_REMINDER,
          to,
          subject: `Reminder: content for your Saadaa collab (${p.collab_id ?? p.post_id ?? ""})`.trim(),
          title: "A gentle reminder about your content",
          subtitle: p.collab_id ? `COLLAB: ${p.collab_id}` : undefined,
          htmlBody: `<p style="margin:0 0 12px;">Hi ${p.username ?? "there"},</p>
<p style="margin:0 0 12px;">It's been a little while since we onboarded you for this collaboration and we haven't seen your content go live yet. Whenever you're ready, please share your post so we can mark it complete.</p>
<ul style="margin:0 0 12px;padding-left:18px;">
<li><strong>Collab:</strong> ${p.collab_id ?? "—"}</li>
<li><strong>Onboarded on:</strong> ${p.onboard_date ?? "—"}</li>
</ul>
<p style="margin:0;">Just reply to this email if you have any questions. Thank you!</p>`,
          collabId: p.collab_id,
          postId: p.post_id,
        });
        if (r.ok) sent.content_reminder++;
      }
      await (supabase as any)
        .from("posts")
        .update({ content_reminder_sent_at: nowIso() })
        .eq("post_id", p.post_id);
    }
  } catch (err) {
    console.error("[cron/notifications] content_reminder check failed:", err);
  }

  // ── 4. Payment Eligibility Achieved ──────────────────────────────────────────
  // Payments that just became payable (status 'Due') and not yet emailed. →
  // Accounts team. Stamp eligibility_email_sent=true.
  try {
    const { data } = await (supabase as any)
      .from("payments")
      .select("id, collab_id, inf_id, username, amount, status, due_date")
      .eq("status", "Due")
      .eq("eligibility_email_sent", false);
    const rows = (data ?? []) as PaymentRow[];
    if (rows.length && accountsTeam.length) {
      for (const p of rows) {
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.PAYMENT_ELIGIBLE,
          to: accountsTeam,
          subject: `Payment now due: ${p.collab_id ?? p.username ?? "collab"}`,
          title: "A payment is now eligible",
          subtitle: p.collab_id ? `COLLAB: ${p.collab_id}` : undefined,
          htmlBody: `<p style="margin:0 0 12px;">A creator payment has become <strong>Due</strong> and is ready to be processed.</p>
<ul style="margin:0 0 12px;padding-left:18px;">
<li><strong>Collab:</strong> ${p.collab_id ?? "—"}</li>
<li><strong>Creator:</strong> ${p.username ?? p.inf_id ?? "—"}</li>
<li><strong>Amount:</strong> ${p.amount != null ? `₹${p.amount}` : "—"}</li>
<li><strong>Due date:</strong> ${p.due_date ?? "—"}</li>
</ul>
<p style="margin:0;">Please process this payment from the Accounts Hub.</p>`,
          collabId: p.collab_id,
        });
        if (r.ok) sent.payment_eligible++;
        await (supabase as any)
          .from("payments")
          .update({ eligibility_email_sent: true })
          .eq("id", p.id);
      }
    }
  } catch (err) {
    console.error("[cron/notifications] payment_eligible check failed:", err);
  }

  // ── 5. Payment Pending (SLA breach) ──────────────────────────────────────────
  // Payments Due/Partial whose due_date is older than the window AND not yet
  // alerted. → Accounts team. Stamp sla_breach_alert_sent=true.
  try {
    const cutoff = isoDateOffset(-PAYMENT_SLA_BREACH_AFTER_DAYS);
    const { data } = await (supabase as any)
      .from("payments")
      .select("id, collab_id, inf_id, username, amount, status, due_date")
      .in("status", ["Due", "Partial"])
      .not("due_date", "is", null)
      .lt("due_date", cutoff)
      .eq("sla_breach_alert_sent", false);
    const rows = (data ?? []) as PaymentRow[];
    if (rows.length && accountsTeam.length) {
      for (const p of rows) {
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.PAYMENT_SLA_BREACH,
          to: accountsTeam,
          subject: `Overdue payment: ${p.collab_id ?? p.username ?? "collab"}`,
          title: "Payment SLA breached",
          subtitle: p.collab_id ? `COLLAB: ${p.collab_id}` : undefined,
          htmlBody: `<p style="margin:0 0 12px;">A creator payment has been outstanding for more than ${PAYMENT_SLA_BREACH_AFTER_DAYS} days past its due date.</p>
<ul style="margin:0 0 12px;padding-left:18px;">
<li><strong>Collab:</strong> ${p.collab_id ?? "—"}</li>
<li><strong>Creator:</strong> ${p.username ?? p.inf_id ?? "—"}</li>
<li><strong>Amount:</strong> ${p.amount != null ? `₹${p.amount}` : "—"}</li>
<li><strong>Status:</strong> ${p.status ?? "—"}</li>
<li><strong>Due date:</strong> ${p.due_date ?? "—"}</li>
</ul>
<p style="margin:0;">Please prioritise clearing this payment.</p>`,
          collabId: p.collab_id,
        });
        if (r.ok) sent.payment_sla_breach++;
        await (supabase as any)
          .from("payments")
          .update({ sla_breach_alert_sent: true })
          .eq("id", p.id);
      }
    }
  } catch (err) {
    console.error("[cron/notifications] payment_sla_breach check failed:", err);
  }

  // ── 6. Campaign Ending Soon ──────────────────────────────────────────────────
  // Campaigns whose end_date is within the window (future) AND not yet alerted.
  // → the campaign OWNER (campaigns.created_by, an email). Falls back to active
  // Global Admins for legacy campaigns with no owner. Stamp ending_alert_sent.
  try {
    const today = isoDateOffset(0);
    const within = isoDateOffset(CAMPAIGN_ENDING_WITHIN_DAYS);
    const { data } = await (supabase as any)
      .from("campaigns")
      .select("id, campaign_id, campaign_name, end_date, created_by")
      .not("end_date", "is", null)
      .gte("end_date", today)
      .lte("end_date", within)
      .eq("ending_alert_sent", false);
    const rows = (data ?? []) as CampaignRow[];
    for (const c of rows) {
      const owner = (c.created_by ?? "").trim().toLowerCase();
      const to = owner && owner.includes("@") ? [owner] : globalAdmins;
      if (to.length) {
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.CAMPAIGN_ENDING,
          to,
          subject: `Campaign ending soon: ${c.campaign_name ?? c.campaign_id ?? "campaign"}`,
          title: "A campaign is ending soon",
          subtitle: c.campaign_id ? `CAMPAIGN: ${c.campaign_id}` : undefined,
          htmlBody: `<p style="margin:0 0 12px;">This campaign ends within ${CAMPAIGN_ENDING_WITHIN_DAYS} days, after which it closes automatically.</p>
<ul style="margin:0 0 12px;padding-left:18px;">
<li><strong>Campaign:</strong> ${c.campaign_name ?? "—"} (${c.campaign_id ?? "—"})</li>
<li><strong>End date:</strong> ${c.end_date ?? "—"}</li>
</ul>
<p style="margin:0;">Please review outstanding deliverables before it closes. You can reopen it later from the Campaigns page if needed.</p>`,
        });
        if (r.ok) sent.campaign_ending++;
      }
      await (supabase as any)
        .from("campaigns")
        .update({ ending_alert_sent: true })
        .eq("id", c.id);
    }
  } catch (err) {
    console.error("[cron/notifications] campaign_ending check failed:", err);
  }

  // Campaign auto-close master switch (Settings → Workflow preferences). When off
  // (backlog mode) BOTH auto-close checks below (date-based #7 + completion #9) are
  // skipped so campaigns stay open for backfilling. Default ON. Read once.
  const autoCloseEnabled = await getCampaignAutoCloseEnabled();

  // ── 7. Auto-close campaigns past their end_date ─────────────────────────────
  // Once end_date is in the past, flip status → 'Closed' and stamp auto_closed_at
  // (one-shot). A campaign reopened by an owner/admin gets auto_closed_at set, so
  // this never re-closes it. Owner-facing notice already went out in check 6.
  if (autoCloseEnabled) {
    try {
      const today = isoDateOffset(0);
      const { data, error } = await (supabase as any)
        .from("campaigns")
        .update({ status: "Closed", auto_closed_at: nowIso() })
        .lt("end_date", today)
        .is("auto_closed_at", null)
        // Only auto-close ACTIVE campaigns — never a pending-approval / rejected
        // one (those aren't live and shouldn't be swept to Closed by end-date).
        .ilike("status", "active")
        .select("campaign_id");
      if (error) {
        console.error("[cron/notifications] campaign auto-close failed:", error.message);
      } else {
        const closed = (data ?? []) as Array<{ campaign_id: string | null }>;
        sent.campaign_closed = closed.length;
        // Void the un-onboarded reach-out leftovers of each just-closed campaign.
        for (const c of closed) {
          if (c.campaign_id) await voidUnonboardedForCampaign(c.campaign_id);
        }
      }
    } catch (err) {
      console.error("[cron/notifications] campaign auto-close check failed:", err);
    }
  }

  // ── 8. Monthly payable-cycle digest ─────────────────────────────────────────
  // TWO DAYS before each payout cycle (user spec 2026-07-17): on the 13th for
  // the 15th cycle, on the 28th for the 30th cycle — every collab whose payment
  // falls in that cycle and still owes money. ONE branded digest
  // (full payable sheet incl. bank details) to the Accounts team + Global Admins.
  // Idempotent: a digest for the day fires at most once (guarded via email_logs).
  // Voided/offboarded collabs are excluded — their balance is no longer payable.
  async function sendAccountsPayableDigest() {
    try {
      const today = todayUtc();
      const dom = today.getUTCDate();
      if (dom !== 13 && dom !== 28) return;

      const cycleDay = dom === 13 ? 15 : 30;
      const y = today.getUTCFullYear();
      const mo = today.getUTCMonth();
      const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      const clamped = Math.min(cycleDay, lastDay);
      const cycleIso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
      const recipients = Array.from(new Set([...accountsTeam, ...globalAdmins]));
      if (recipients.length === 0) return;

      const { data: paysRaw, error: paysError } = await (supabase as any).rpc(
        "accounts_payable_digest_rows",
        { p_cycle_date: cycleIso },
      );
      if (paysError) throw paysError;
      const pays = (paysRaw ?? []) as PayableDigestRow[];
      if (pays.length === 0) return;

      const esc = (s: unknown) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const inr = (n: number | null) =>
        n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;
      const built = pays.map((p) => {
        const handle = (p.username ?? "").replace(/^@/, "");
        return {
          name: p.creator_name || handle || p.inf_id || "—",
          handle,
          profile: handle ? `https://www.instagram.com/${handle}/` : "—",
          collab: p.collab_id ?? "—",
          amount: Number(p.outstanding ?? 0),
          due: p.due_date ?? "—",
          status: p.status ?? "—",
          bankName: p.bank_name ?? "—",
          bankNum: p.bank_number ?? "—",
          ifsc: p.ifsc ?? "—",
        };
      });
      const total = built.reduce((sum, row) => sum + row.amount, 0);
      const th = (text: string) =>
        `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #E7E2D2;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:#6E695E;">${text}</th>`;
      const tdc = (value: string) =>
        `<td style="padding:6px 8px;border-bottom:1px solid #EFEAE0;font-size:12px;color:#161513;">${value}</td>`;
      const bodyRows = built
        .map(
          (row) =>
            `<tr>${tdc(esc(row.name))}${tdc(row.handle ? `<a href="${row.profile}" style="color:#3B6FD4;">@${esc(row.handle)}</a>` : "—")}${tdc(esc(row.collab))}${tdc(`<strong>${inr(row.amount)}</strong>`)}${tdc(esc(row.due))}${tdc(esc(row.status))}${tdc(esc(row.bankName))}${tdc(esc(row.bankNum))}${tdc(esc(row.ifsc))}</tr>`,
        )
        .join("");
      const html = `<p style="margin:0 0 12px;">The following <strong>${built.length}</strong> collab payment${built.length === 1 ? "" : "s"} fall in the <strong>${cycleIso}</strong> payout cycle and still owe money. Please process them on or before the cycle date.</p>
<div style="overflow-x:auto;">
<table style="width:100%;border-collapse:collapse;margin:0 0 12px;">
<thead><tr>${th("Creator")}${th("Handle")}${th("Collab ID")}${th("Outstanding")}${th("Due")}${th("Status")}${th("Bank")}${th("A/C No.")}${th("IFSC")}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>
<p style="margin:0 0 4px;font-size:14px;"><strong>Total payable this cycle: ${inr(total)}</strong></p>
<p style="margin:0;font-size:12px;color:#9A9384;">Bank details are included for processing. Open the Accounts Hub to update each payment once paid.</p>`;
      const subject = `Payments due ${cycleIso} — ${built.length} creator${built.length === 1 ? "" : "s"}, ${inr(total)}`;
      const claimId = await claimDelivery(
        NOTIFICATION_TYPES.ACCOUNTS_PAYABLE_DIGEST,
        `accounts:${cycleIso}`,
        recipients,
        subject,
      );
      if (!claimId) return;

      const to = accountsTeam[0] ?? recipients[0];
      const r = await sendNotification({
        type: NOTIFICATION_TYPES.ACCOUNTS_PAYABLE_DIGEST,
        to,
        bcc: recipients.filter((email) => email !== to),
        subject,
        title: `Upcoming payout cycle — ${cycleIso}`,
        subtitle: `${built.length} payable collab${built.length === 1 ? "" : "s"}`,
        htmlBody: html,
      });
      await finalizeDelivery(claimId, r.ok, r.error);
      if (r.ok) sent.accounts_payable_digest = built.length;
    } catch (err) {
      console.error("[cron/notifications] payable_digest check failed:", err);
    }
  }

  // ── 9. Auto-close campaigns whose full creator allocation has posted ─────────
  // Completion close (backstop to the real-time trigger in submitPosting): a
  // campaign closes once distinct Posted/Delivered creators reach its creator
  // cap. Skips already-closed + reopened (auto_closed_at set) campaigns. Gated by
  // the same auto-close master switch as #7.
  if (autoCloseEnabled) {
    try {
      const { data: openCamps } = await (supabase as any)
        .from("campaigns")
        .select("campaign_id")
        .is("auto_closed_at", null)
        .not("status", "ilike", "closed");
      for (const c of (openCamps ?? []) as Array<{ campaign_id: string | null }>) {
        if (!c.campaign_id) continue;
        const closed = await closeCampaignIfComplete(c.campaign_id);
        if (closed) sent.campaign_completed++;
      }
    } catch (err) {
      console.error("[cron/notifications] campaign completion-close check failed:", err);
    }
  }

  return NextResponse.json({ ran: true, sent });
}
