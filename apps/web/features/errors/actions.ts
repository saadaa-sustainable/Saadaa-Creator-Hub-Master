"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import {
  getCollabEmailPreview,
  sendCollabEmail,
} from "@/features/onboarding/actions";

/**
 * Retry a collab email that was blocked (missing attachments / CC) or whose SMTP
 * send failed — driven from the Error Portal "Send again" button. Rebuilds the
 * send payload from the live preview (so a since-fixed brief / T&C / email is
 * picked up) and re-runs the same gated {@link sendCollabEmail}. On success the
 * gate resolves the matching `collab_email_blocked` / `collab_email_send_failed`
 * row, so it drops off the portal.
 */
export async function resendBlockedCollabEmail(
  postId: string,
): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
  await assertPermission("onboarding_write");
  const id = postId.trim();
  if (!id) return { ok: false, error: "Missing post id" };

  const preview = await getCollabEmailPreview(id);
  if (!preview.ok) {
    return { ok: false, error: preview.error };
  }

  const result = await sendCollabEmail({
    postId: id,
    emailTo: preview.emailTo,
  });

  revalidatePath("/errors");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, sentTo: result.sentTo };
}
