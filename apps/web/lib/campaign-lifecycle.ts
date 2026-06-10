import "server-only";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "./supabase/server";

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
