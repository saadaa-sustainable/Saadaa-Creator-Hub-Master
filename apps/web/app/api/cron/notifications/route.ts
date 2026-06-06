import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_TYPES,
  resolveAccountsTeamEmails,
  resolveGlobalAdminEmails,
  sendNotification,
} from "@/lib/notifications";

/**
 * Daily TIME-BASED (cron) email notifications — Wave 7 follow-up.
 *
 * One Route Handler that runs all six idempotent checks once per day. Each
 * check queries the rows that just crossed a threshold (and have NOT yet been
 * emailed, per their sent-flag column), sends a single branded notification via
 * sendNotification(), then STAMPS the sent-flag so a later run never re-fires
 * for the same row. Every send is best-effort and wrapped so one failing check
 * (or recipient) never aborts the others.
 *
 * Schedule: see vercel.json crons — daily at 04:00 UTC ("0 4 * * *").
 *
 * AUTH: Vercel Cron requests carry `Authorization: Bearer ${CRON_SECRET}` (when
 * CRON_SECRET is set) and/or the `x-vercel-cron` header. We accept either; any
 * other request is 401. This stops the public internet from triggering sends.
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

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron sets this header on every scheduled invocation.
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  return false;
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
  if (!isAuthorized(req)) {
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
    pending_onboarding: 0,
    posting_pending: 0,
    content_reminder: 0,
    payment_eligible: 0,
    payment_sla_breach: 0,
    campaign_ending: 0,
  };

  // Resolve shared recipient sets / lookups once.
  const [accountsTeam, globalAdmins, nameToEmail] = await Promise.all([
    resolveAccountsTeamEmails(),
    resolveGlobalAdminEmails(),
    buildNameToEmailMap(supabase),
  ]);

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
  // → campaign owner. campaigns has no creator/owner column, so we fall back to
  // active Global Admins. Stamp ending_alert_sent=true.
  try {
    const today = isoDateOffset(0);
    const within = isoDateOffset(CAMPAIGN_ENDING_WITHIN_DAYS);
    const { data } = await (supabase as any)
      .from("campaigns")
      .select("id, campaign_id, campaign_name, end_date")
      .not("end_date", "is", null)
      .gte("end_date", today)
      .lte("end_date", within)
      .eq("ending_alert_sent", false);
    const rows = (data ?? []) as CampaignRow[];
    if (rows.length && globalAdmins.length) {
      for (const c of rows) {
        const r = await sendNotification({
          type: NOTIFICATION_TYPES.CAMPAIGN_ENDING,
          to: globalAdmins,
          subject: `Campaign ending soon: ${c.campaign_name ?? c.campaign_id ?? "campaign"}`,
          title: "A campaign is ending soon",
          subtitle: c.campaign_id ? `CAMPAIGN: ${c.campaign_id}` : undefined,
          htmlBody: `<p style="margin:0 0 12px;">This campaign ends within ${CAMPAIGN_ENDING_WITHIN_DAYS} days.</p>
<ul style="margin:0 0 12px;padding-left:18px;">
<li><strong>Campaign:</strong> ${c.campaign_name ?? "—"} (${c.campaign_id ?? "—"})</li>
<li><strong>End date:</strong> ${c.end_date ?? "—"}</li>
</ul>
<p style="margin:0;">Please review outstanding deliverables before it closes.</p>`,
        });
        if (r.ok) sent.campaign_ending++;
        await (supabase as any)
          .from("campaigns")
          .update({ ending_alert_sent: true })
          .eq("id", c.id);
      }
    }
  } catch (err) {
    console.error("[cron/notifications] campaign_ending check failed:", err);
  }

  return NextResponse.json({ ran: true, sent });
}
