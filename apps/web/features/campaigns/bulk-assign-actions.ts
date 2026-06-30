"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";

export type BulkAssignResult =
  | { ok: true; assigned: number; message: string }
  | { ok: false; error: string };

/**
 * Bulk-assign unassigned reach-out posts to an existing campaign. Campaign
 * Owner / Global Admin only (campaign_edit). Only moves rows that are still
 * unassigned (campaign_id IS NULL) — never reassigns a row already on another
 * campaign. The target campaign must exist and be live (not Pending / Rejected).
 */
export async function bulkAssignPostsToCampaign(
  postIds: number[],
  campaignId: string,
): Promise<BulkAssignResult> {
  await assertPermission("campaign_edit");

  const id = (campaignId ?? "").trim();
  if (!id) return { ok: false, error: "Pick a campaign to assign to." };

  const ids = Array.from(
    new Set((postIds ?? []).filter((n) => Number.isInteger(n))),
  );
  if (ids.length === 0)
    return { ok: false, error: "Select at least one reach-out row." };

  const supabase = createServiceClient();

  const { data: camp, error: campErr } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, status")
    .eq("campaign_id", id)
    .maybeSingle();
  if (campErr) return { ok: false, error: campErr.message };
  if (!camp) return { ok: false, error: `Campaign ${id} not found.` };

  const status = (camp.status ?? "").toLowerCase();
  if (status.startsWith("pending"))
    return { ok: false, error: `${id} is pending approval — approve it first.` };
  if (status.startsWith("rejected"))
    return { ok: false, error: `${id} was rejected — pick a live campaign.` };

  const now = new Date().toISOString();
  const { data, error } = await (supabase as any)
    .from("posts")
    .update({ campaign_id: id, updated_at: now })
    .in("id", ids as never[])
    .is("campaign_id", null)
    .select("id");
  if (error) return { ok: false, error: error.message };

  const assigned = (data ?? []).length;

  revalidateTag("campaigns");
  revalidatePath("/campaigns");
  revalidatePath("/reach-out");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/reach-out/inbound");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");

  return {
    ok: true,
    assigned,
    message:
      assigned === ids.length
        ? `${assigned} reach-out${assigned === 1 ? "" : "s"} assigned to ${id}.`
        : `${assigned} of ${ids.length} assigned to ${id} — the rest were already on a campaign.`,
  };
}
