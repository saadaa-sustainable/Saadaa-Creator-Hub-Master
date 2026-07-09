import "server-only";
import { createServiceClient } from "./supabase/server";

/**
 * Generic error sink — surfaces in Error Portal.
 *
 * Mirrors legacy `logSystemError_` in InfluencerBackend.js. One unresolved
 * row per (type, key, source) — duplicate reports update `message` + bump
 * `created_at` rather than spamming the table.
 *
 * Production users so far:
 *   - 'ig_fetch'      — instaloader live call failed during lookupCreator
 *   - 'apify_fail'    — 3-hour Apify retry exhausted in scrape-pending-apify
 *   - 'collab_email'  — missing creator email at sendCollabEmail time
 *   - 'payment_*'     — payment-advice / payable-cycle failures
 *   - 'shopify_sync'  — webhook / cron fetch failures
 */
export interface LogSystemErrorInput {
  type: string;
  key?: string | null;
  message: string;
  source?: string | null;
}

export async function logSystemError({
  type,
  key,
  message,
  source,
}: LogSystemErrorInput): Promise<void> {
  try {
    const supabase = createServiceClient();
    // Try to update an existing unresolved row first (dedupe). The partial
    // unique index `system_errors_dedupe_idx` keeps the table from growing
    // unbounded under flapping conditions.
    const { data: existing } = await (supabase as any)
      .from("system_errors")
      .select("id")
      .eq("type", type)
      .eq("key", key ?? "")
      .eq("source", source ?? "")
      .eq("resolved", false)
      .maybeSingle();

    if (existing) {
      await (supabase as any)
        .from("system_errors")
        .update({ message, created_at: new Date().toISOString() })
        .eq("id", existing.id);
      return;
    }

    await (supabase as any).from("system_errors").insert({
      type,
      key: key ?? null,
      message,
      source: source ?? null,
    });
  } catch (err) {
    // Logger must never throw — Error Portal is the floor, not the ceiling.
    console.error("logSystemError failed", err);
  }
}

/**
 * Mark matching unresolved error rows as resolved. Called when the underlying
 * problem is fixed (e.g. a blocked collab email is successfully re-sent) so the
 * row drops out of the Error Portal instead of lingering. Never throws.
 */
export async function resolveSystemError(
  type: string,
  key?: string | null,
  source?: string | null,
): Promise<void> {
  try {
    const supabase = createServiceClient();
    let q = (supabase as any)
      .from("system_errors")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("type", type)
      .eq("resolved", false);
    q = key != null ? q.eq("key", key) : q.is("key", null);
    if (source != null) q = q.eq("source", source);
    await q;
  } catch (err) {
    console.error("resolveSystemError failed", err);
  }
}
