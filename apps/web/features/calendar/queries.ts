import { createServiceClient } from "@/lib/supabase/server";
import { firstNonEmptyString } from "@/lib/attribution";
import { isPastDue } from "@/lib/workflow";

/**
 * Content Calendar data — CreatorHub port of the Workflow Optimizer calendar.
 * Two event kinds:
 *  • delivery — est_delivery of ONBOARDED collabs still awaiting their post
 *               (one event per collab, the parent deliverable). Overdue ones
 *               are flagged (est date passed, nothing posted).
 *  • posting  — post_date of POSTED deliverables (one event per deliverable).
 */

export type CalendarEventType = "delivery" | "posting";

export interface CalendarEvent {
  type: CalendarEventType;
  date: string; // YYYY-MM-DD
  day: number;
  label: string;
  postId: string | null;
  collabId: string | null;
  username: string | null;
  campaignId: string | null;
  collabType: string | null;
  orderId: string | null;
  owner: string | null; // onboarded_by for deliveries, posted_by for postings
  /** delivery events only — promised date passed with no post yet. */
  overdue?: boolean;
  /** delivery events only — creator-facing EDD reminder was sent. */
  reminderSentAt?: string | null;
}

export interface CalendarData {
  year: number;
  month: number; // 1-12
  events: CalendarEvent[];
}

function ymd(raw: unknown): { iso: string; y: number; m: number; d: number } | null {
  if (!raw) return null;
  const s = String(raw).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { iso: s, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export async function getCalendarData(
  year: number,
  month: number,
): Promise<CalendarData> {
  const supabase = createServiceClient();
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [{ data: dueRows }, { data: postedRows }] = await Promise.all([
    // Onboarded collabs awaiting their post — one event per collab (parent).
    (supabase as any)
      .from("posts")
      .select(
        "post_id, post_id_short, collab_id, username, campaign_id, collab_type, order_id, onboarded_by, est_delivery, delivery_reminder_sent_at, reach_out_date, workflow_status, deliverable_index, is_test",
      )
      .in("workflow_status", ["On Board", "Order Sent"])
      .gte("est_delivery", first)
      .lte("est_delivery", last)
      .eq("is_test", false)
      .limit(3000),
    // Posted deliverables — one event per deliverable.
    (supabase as any)
      .from("posts")
      .select(
        "post_id, post_id_short, collab_id, username, campaign_id, collab_type, order_id, posted_by, onboarded_by, logged_by, post_date, workflow_status, is_test",
      )
      .in("workflow_status", ["Posted", "Delivered"])
      .gte("post_date", first)
      .lte("post_date", last)
      .eq("is_test", false)
      .limit(3000),
  ]);

  const events: CalendarEvent[] = [];

  for (const r of (dueRows ?? []) as Array<Record<string, unknown>>) {
    // Parent deliverable only — the whole collab shares one est date.
    const idx = r.deliverable_index;
    if (idx != null && Number(idx) !== 1) continue;
    const d = ymd(r.est_delivery);
    if (!d) continue;
    events.push({
      type: "delivery",
      date: d.iso,
      day: d.d,
      label: `@${r.username ?? "—"} · ${r.post_id_short ?? r.post_id ?? ""}`,
      postId: (r.post_id_short as string | null) ?? (r.post_id as string | null),
      collabId: (r.collab_id as string | null) ?? null,
      username: (r.username as string | null) ?? null,
      campaignId: (r.campaign_id as string | null) ?? null,
      collabType: (r.collab_type as string | null) ?? null,
      orderId: (r.order_id as string | null) ?? null,
      owner: (r.onboarded_by as string | null) ?? null,
      overdue: isPastDue(r.est_delivery, r.reach_out_date),
      reminderSentAt: (r.delivery_reminder_sent_at as string | null) ?? null,
    });
  }

  for (const r of (postedRows ?? []) as Array<Record<string, unknown>>) {
    const d = ymd(r.post_date);
    if (!d) continue;
    events.push({
      type: "posting",
      date: d.iso,
      day: d.d,
      label: `@${r.username ?? "—"} · ${r.post_id_short ?? r.post_id ?? ""}`,
      postId: (r.post_id_short as string | null) ?? (r.post_id as string | null),
      collabId: (r.collab_id as string | null) ?? null,
      username: (r.username as string | null) ?? null,
      campaignId: (r.campaign_id as string | null) ?? null,
      collabType: (r.collab_type as string | null) ?? null,
      orderId: (r.order_id as string | null) ?? null,
      owner:
        firstNonEmptyString(r.posted_by, r.onboarded_by, r.logged_by) || null,
    });
  }

  return { year, month, events };
}
