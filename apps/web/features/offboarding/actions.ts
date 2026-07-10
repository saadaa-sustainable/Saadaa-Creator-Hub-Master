"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { OffboardCreatorSchema } from "./rules";

export type OffboardCreatorResult =
  | { ok: true; username: string }
  | { ok: false; error: string };

/**
 * Permanently offboard one creator. The action re-checks the overdue queue on
 * the server immediately before writing so a stale browser cannot blacklist a
 * creator whose post was submitted in the meantime. The creator update and its
 * audit record are atomic because the database trigger writes the audit row in
 * the same transaction.
 */
export async function offboardCreator(
  input: unknown,
): Promise<OffboardCreatorResult> {
  const actor = await assertPermission("offboarding_write");
  const parsed = OffboardCreatorSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { infId, reason } = parsed.data;
  const supabase = createServiceClient();

  const { data: creator, error: creatorError } = await (supabase as any)
    .from("creators")
    .select(
      "inf_id, username, inf_name, is_blacklisted, blacklist_reason, blacklisted_at",
    )
    .eq("inf_id", infId)
    .maybeSingle();

  if (creatorError) return { ok: false, error: creatorError.message };
  if (!creator) return { ok: false, error: "Creator not found" };
  if (creator.is_blacklisted) {
    return {
      ok: false,
      error: `@${creator.username} is already offboarded.`,
    };
  }

  const { data, error: updateError } = await (supabase as any).rpc(
    "offboard_creator_if_eligible",
    {
      p_inf_id: infId,
      p_reason: reason,
      p_actor_email: actor.email,
    },
  );

  if (updateError) return { ok: false, error: updateError.message };
  const updated = Array.isArray(data) ? data[0] : null;
  if (!updated?.creator_username) {
    return {
      ok: false,
      error:
        "This creator was already offboarded or no longer qualifies. Their deadline or posting status may have changed. Refresh the tray and review again.",
    };
  }

  revalidateTag("creators");
  revalidateTag("posts");
  revalidatePath("/offboarding");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/reach-out/inbound");
  revalidatePath("/onboarding");
  revalidatePath("/audit-log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    username: String(updated.creator_username ?? creator.username),
  };
}
