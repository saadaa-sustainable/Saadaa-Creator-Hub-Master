import "server-only";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "./supabase/server";
import { isOnboardedActive, isVoidedStatus } from "./workflow";

/**
 * Void (→ Cancelled) every reach-out on a campaign that was never onboarded.
 *
 * The creator cap is an ONBOARDING cap (2026-06-10), so a campaign can collect
 * more reach-outs than it onboards. When the campaign CLOSES (end-date,
 * completion, or manual), the un-onboarded leftovers can no longer proceed, so
 * we void them. Their data is preserved — Cancelled rows stay in Sheet View and
 * the per-campaign dashboard metrics. Onboarded-active, already-Cancelled, and
 * already-voided rows are left untouched. Best-effort; returns the count voided.
 */
export async function voidUnonboardedForCampaign(
  campaignId: string,
): Promise<number> {
  const id = (campaignId ?? "").trim();
  if (!id) return 0;
  try {
    const supabase = createServiceClient();
    const { data: rows } = await (supabase as any)
      .from("posts")
      .select("post_id, workflow_status")
      .eq("campaign_id", id);
    const toVoid = ((rows ?? []) as Array<{
      post_id: string;
      workflow_status: string | null;
    }>)
      .filter(
        (p) =>
          !isOnboardedActive(p.workflow_status) &&
          !isVoidedStatus(p.workflow_status) &&
          String(p.workflow_status ?? "") !== "Cancelled",
      )
      .map((p) => p.post_id)
      .filter(Boolean);
    if (toVoid.length === 0) return 0;

    const { error } = await (supabase as any)
      .from("posts")
      .update({ workflow_status: "Cancelled" })
      .in("post_id", toVoid);
    if (error) {
      console.error(
        `[campaign-lifecycle] void-unonboarded failed for ${id}:`,
        error.message,
      );
      return 0;
    }
    revalidatePath("/reach-out");
    revalidatePath("/dashboard");
    return toVoid.length;
  } catch (err) {
    console.error(
      `[campaign-lifecycle] voidUnonboardedForCampaign threw for ${campaignId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return 0;
  }
}

/**
 * Auto-close a campaign once its full creator allocation has POSTED.
 *
 * "Complete" = the number of distinct creators with a Posted/Delivered collab
 * on the campaign reaches the creator cap (Σ `campaign_budget.num_influencers`,
 * cap > 0). i.e. every planned creator slot is filled and posted — "all the
 * creators we mentioned have reached out, onboarded and posted". Cancelled /
 * voided (Offboarded) collabs are ignored (they aren't Posted/Delivered, and
 * they freed their slot). If the cap is never filled, only the end-date
 * auto-close (the daily cron) closes the campaign.
 *
 * Skips campaigns already Closed or carrying `auto_closed_at` (a deliberately
 * reopened campaign is left alone — same rule as the end-date auto-close, so an
 * owner who reopened to add creators isn't immediately re-closed).
 *
 * System action — no permission gate (called fire-and-forget from submitPosting
 * and the daily cron). Best-effort: never throws; returns true only when it
 * actually closed the campaign.
 */
export async function closeCampaignIfComplete(
  campaignId: string,
): Promise<boolean> {
  const id = (campaignId ?? "").trim();
  if (!id) return false;
  try {
    const supabase = createServiceClient();

    const { data: camp } = await (supabase as any)
      .from("campaigns")
      .select("status, auto_closed_at")
      .eq("campaign_id", id)
      .maybeSingle();
    if (!camp) return false;
    if (camp.auto_closed_at != null) return false; // reopened — leave alone
    if (String(camp.status ?? "").trim().toLowerCase() === "closed") return false;

    const { data: budgets } = await (supabase as any)
      .from("campaign_budget")
      .select("num_influencers")
      .eq("campaign_id", id);
    const cap = ((budgets ?? []) as Array<{ num_influencers: number | null }>).reduce(
      (s, b) => s + (Number(b.num_influencers ?? 0) || 0),
      0,
    );
    if (cap <= 0) return false; // no allocation ⇒ no completion close

    const { data: posted } = await (supabase as any)
      .from("posts")
      .select("username")
      .eq("campaign_id", id)
      .in("workflow_status", ["Posted", "Delivered"]);
    const postedCreators = new Set(
      ((posted ?? []) as Array<{ username: string | null }>)
        .map((p) => (p.username ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    if (postedCreators.size < cap) return false;

    const now = new Date().toISOString();
    // Race guard: only close if still open + not reopened between read and write.
    const { error } = await (supabase as any)
      .from("campaigns")
      .update({ status: "Closed", auto_closed_at: now, updated_at: now })
      .eq("campaign_id", id)
      .is("auto_closed_at", null)
      .not("status", "ilike", "closed");
    if (error) {
      console.error(
        `[campaign-lifecycle] completion-close failed for ${id}:`,
        error.message,
      );
      return false;
    }

    // Void any reach-outs that never onboarded — the campaign is now closed.
    await voidUnonboardedForCampaign(id);

    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    return true;
  } catch (err) {
    console.error(
      `[campaign-lifecycle] closeCampaignIfComplete threw for ${campaignId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
