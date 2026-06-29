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
  created_by: string | null;
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
  // On the 12th: every collab whose payment falls in this month's 15th payout
  // cycle and still owes money. On the 27th: the 30th cycle. ONE branded digest
  // (full payable sheet incl. bank details) to the Accounts team + Global Admins.
  // Idempotent: a digest for the day fires at most once (guarded via email_logs).
  // Voided/offboarded collabs are excluded — their balance is no longer payable.
  try {
    const today = todayUtc();
    const dom = today.getUTCDate();
    if (dom === 12 || dom === 27) {
      const cycleDay = dom === 12 ? 15 : 30;
      const y = today.getUTCFullYear();
      const mo = today.getUTCMonth();
      const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      const clamped = Math.min(cycleDay, lastDay);
      const cycleIso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
      const recipients = Array.from(new Set([...accountsTeam, ...globalAdmins]));

      // Fire-once guard: skip if any digest already logged today.
      const { data: already } = await (supabase as any)
        .from("email_logs")
        .select("id")
        .eq("email_type", NOTIFICATION_TYPES.ACCOUNTS_PAYABLE_DIGEST)
        .gte("created_at", `${isoDateOffset(0)}T00:00:00.000Z`)
        .limit(1);

      if (recipients.length > 0 && !(already && already.length > 0)) {
        const { data: paysRaw } = await (supabase as any)
          .from("payments")
          .select(
            "post_id, collab_id, inf_id, username, amount, status, due_date, estimated_payable_date, bank_name, bank_number, ifsc",
          )
          .eq("estimated_payable_date", cycleIso)
          .in("status", ["Due", "Not Due", "Partial"]);
        let pays = (paysRaw ?? []) as Array<{
          post_id: string | null;
          collab_id: string | null;
          inf_id: string | null;
          username: string | null;
          amount: number | null;
          status: string | null;
          due_date: string | null;
          bank_name: string | null;
          bank_number: string | null;
          ifsc: string | null;
        }>;

        // Drop voided/offboarded collabs — their remaining balance is unpayable.
        const dPostIds = pays.map((p) => p.post_id).filter((v): v is string => !!v);
        if (dPostIds.length > 0) {
          const { data: posts } = await (supabase as any)
            .from("posts")
            .select("post_id, workflow_status")
            .in("post_id", dPostIds);
          const voided = new Set(
            ((posts ?? []) as Array<{ post_id: string; workflow_status: string | null }>)
              .filter((p) => p.workflow_status === "Offboarded" || p.workflow_status === "Offboarding")
              .map((p) => p.post_id),
          );
          pays = pays.filter((p) => !p.post_id || !voided.has(p.post_id));
        }

        if (pays.length > 0) {
          // Resolve creator name + handle for each row.
          const infIds = Array.from(
            new Set(pays.map((p) => p.inf_id).filter((v): v is string => !!v)),
          );
          const creatorByInf = new Map<string, { inf_name: string | null; username: string | null }>();
          if (infIds.length > 0) {
            const { data: cr } = await (supabase as any)
              .from("creators")
              .select("inf_id, inf_name, username")
              .in("inf_id", infIds);
            for (const c of (cr ?? []) as Array<{ inf_id: string; inf_name: string | null; username: string | null }>) {
              creatorByInf.set(c.inf_id, { inf_name: c.inf_name, username: c.username });
            }
          }

          const esc = (s: unknown) =>
            String(s ?? "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
          const inr = (n: number | null) =>
            n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;

          const built = pays.map((p) => {
            const c = p.inf_id ? creatorByInf.get(p.inf_id) : undefined;
            const handle = (c?.username ?? p.username ?? "").replace(/^@/, "");
            return {
              name: c?.inf_name ?? handle ?? p.inf_id ?? "—",
              handle,
              profile: handle ? `https://www.instagram.com/${handle}/` : "—",
              collab: p.collab_id ?? "—",
              amount: Number(p.amount ?? 0),
              due: p.due_date ?? "—",
              status: p.status ?? "—",
              bankName: p.bank_name ?? "—",
              bankNum: p.bank_number ?? "—",
              ifsc: p.ifsc ?? "—",
            };
          });
          const total = built.reduce((s, r) => s + r.amount, 0);

          const th = (t: string) =>
            `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #E7E2D2;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:#6E695E;">${t}</th>`;
          const tdc = (v: string) =>
            `<td style="padding:6px 8px;border-bottom:1px solid #EFEAE0;font-size:12px;color:#161513;">${v}</td>`;
          const bodyRows = built
            .map(
              (r) =>
                `<tr>${tdc(esc(r.name))}${tdc(r.handle ? `<a href="${r.profile}" style="color:#3B6FD4;">@${esc(r.handle)}</a>` : "—")}${tdc(esc(r.collab))}${tdc(`<strong>${inr(r.amount)}</strong>`)}${tdc(esc(r.due))}${tdc(esc(r.status))}${tdc(esc(r.bankName))}${tdc(esc(r.bankNum))}${tdc(esc(r.ifsc))}</tr>`,
            )
            .join("");

          const html = `<p style="margin:0 0 12px;">The following <strong>${built.length}</strong> collab payment${built.length === 1 ? "" : "s"} fall in the <strong>${cycleIso}</strong> payout cycle and still owe money. Please process them on or before the cycle date.</p>
<div style="overflow-x:auto;">
<table style="width:100%;border-collapse:collapse;margin:0 0 12px;">
<thead><tr>${th("Creator")}${th("Handle")}${th("Collab ID")}${th("Amount")}${th("Due")}${th("Status")}${th("Bank")}${th("A/C No.")}${th("IFSC")}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>
<p style="margin:0 0 4px;font-size:14px;"><strong>Total payable this cycle: ${inr(total)}</strong></p>
<p style="margin:0;font-size:12px;color:#9A9384;">Bank details are included for processing. Open the Accounts Hub to update each payment once paid.</p>`;

          const r = await sendNotification({
            type: NOTIFICATION_TYPES.ACCOUNTS_PAYABLE_DIGEST,
            to: recipients,
            subject: `Payments due ${cycleIso} — ${built.length} creator${built.length === 1 ? "" : "s"}, ${inr(total)}`,
            title: `Upcoming payout cycle — ${cycleIso}`,
            subtitle: `${built.length} payable collab${built.length === 1 ? "" : "s"}`,
            htmlBody: html,
          });
          if (r.ok) sent.accounts_payable_digest = built.length;
        }
      }
    }
  } catch (err) {
    console.error("[cron/notifications] payable_digest check failed:", err);
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
