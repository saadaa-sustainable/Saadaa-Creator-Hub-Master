"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";

export type MoveToOffboardingResult =
  | { ok: true; movedCount: number }
  | { ok: false; error: string };

/**
 * Move a collab to the terminal 'Offboarding' workflow stage (Wave 9, D11).
 *
 * Gated to `offboarding_write` (held by Global Admins, incl. Tanvi). Manual,
 * operator-initiated transition. Updates every deliverable row that shares the
 * collab's (inf_id, collab_number) so parent + child stay consistent — the
 * same grouping key the rest of the app uses for a collab episode.
 *
 * Terminal: we deliberately do NOT touch payment_status here, so the collab
 * stays visible in Accounts Hub until it is fully paid.
 */
export async function moveToOffboarding(
  postId: string,
): Promise<MoveToOffboardingResult> {
  await assertPermission("offboarding_write");

  const id = postId.trim();
  if (!id) return { ok: false, error: "Missing post id" };

  const supabase = createServiceClient();

  // Resolve the collab grouping key from the target post.
  const { data: target, error: lookupError } = await (supabase as any)
    .from("posts")
    .select("inf_id, collab_number")
    .eq("post_id", id)
    .maybeSingle();

  if (lookupError) return { ok: false, error: lookupError.message };
  if (!target) return { ok: false, error: "Collab not found" };

  let updateQuery = (supabase as any)
    .from("posts")
    .update({ workflow_status: "Offboarding" });

  // Prefer grouping by (inf_id, collab_number) when both are present so the
  // whole collab episode moves together; otherwise fall back to the single row.
  if (target.inf_id != null && target.collab_number != null) {
    updateQuery = updateQuery
      .eq("inf_id", target.inf_id)
      .eq("collab_number", target.collab_number);
  } else {
    updateQuery = updateQuery.eq("post_id", id);
  }

  const { data: updated, error: updateError } = await updateQuery.select("post_id");
  if (updateError) return { ok: false, error: updateError.message };

  revalidateTag("posts");
  revalidatePath("/offboarding");
  revalidatePath("/order-status");
  revalidatePath("/accounts-hub");
  revalidatePath("/journey");
  revalidatePath("/dashboard");

  return {
    ok: true,
    movedCount: Array.isArray(updated) ? updated.length : 1,
  };
}
