"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getPartnershipStatus,
  isPartnershipConfigured,
  sendPartnershipInvite,
  type PartnershipStatus,
} from "@/lib/meta-partnership";
import {
  resendCreatorPartnershipInvite,
  syncCreatorPartnership,
  type PartnershipSyncResult,
} from "@/lib/partnership-sync";

/** The controlled IG account we send the validation invite to. */
const TEST_HANDLE = "saadaa_women";

export type PartnershipStatusResult =
  | { ok: true; status: PartnershipStatus }
  | { ok: false; error: string };

/** Read-only: current partnership state for a creator (posting form + dashboards). */
export async function checkCreatorPartnership(
  handle: string,
): Promise<PartnershipStatusResult> {
  await assertPermission("posting_submit");
  if (!isPartnershipConfigured())
    return { ok: false, error: "Meta partnership not configured." };
  return getPartnershipStatus(handle);
}

export type TestInviteResult = {
  handle: string;
  sent: { ok: true; permissionId: string | null; rawStatus: string | null } | { ok: false; error: string };
  statusAfter: PartnershipStatusResult;
};

/**
 * TEST — send a real partnership invite to @saadaa_women (controlled account) and
 * re-read the status. Admin-only, explicit action. Validates the Meta WRITE path
 * before the auto-invite rolls out to real creators.
 */
export async function sendTestPartnershipInvite(): Promise<TestInviteResult> {
  await assertPermission("admin");
  const sent = await sendPartnershipInvite(TEST_HANDLE);
  const statusAfter = await getPartnershipStatus(TEST_HANDLE);
  return { handle: TEST_HANDLE, sent, statusAfter };
}

/** Read-only status of the test account (no send). */
export async function checkTestPartnershipStatus(): Promise<PartnershipStatusResult> {
  await assertPermission("posting_submit");
  return getPartnershipStatus(TEST_HANDLE);
}

// ─── Per-post / per-creator partnership flow (auto-invite rollout) ──────────

async function resolveCreatorOfPost(
  postId: string,
): Promise<{ infId: string | null; username: string | null } | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("posts")
    .select("inf_id, username")
    .eq("post_id", postId)
    .maybeSingle();
  if (!data) return null;
  return {
    infId: (data.inf_id as string | null) ?? null,
    username: (data.username as string | null) ?? null,
  };
}

function revalidatePartnershipSurfaces() {
  revalidateTag("posts");
  revalidatePath("/posting");
  revalidatePath("/accounts-hub");
  revalidatePath("/dashboard");
}

/**
 * Popup step — live-check the creator's Meta permission and stamp it onto
 * their posts rows. With `autoInvite` the invite is sent when NO record
 * exists (the posting-submit popup's "sending request" phase). Rejected /
 * revoked records are never auto-resent — that path is the explicit Resend
 * button (resendPartnershipForPost).
 */
export async function syncPartnershipForPost(
  postId: string,
  opts?: { autoInvite?: boolean },
): Promise<PartnershipSyncResult & { handle: string | null }> {
  await assertPermission("posting_submit");
  const creator = await resolveCreatorOfPost(postId);
  if (!creator || (!creator.infId && !creator.username)) {
    return {
      ok: false,
      state: null,
      invited: false,
      error: "Creator not found for this post",
      handle: null,
    };
  }
  const res = await syncCreatorPartnership({
    infId: creator.infId,
    username: creator.username,
    autoInvite: opts?.autoInvite === true,
    source: "posting-popup",
  });
  if (res.ok) revalidatePartnershipSurfaces();
  return { ...res, handle: creator.username };
}

/** Explicit RESEND after a rejection — posting popup button. */
export async function resendPartnershipForPost(
  postId: string,
): Promise<PartnershipSyncResult> {
  await assertPermission("posting_submit");
  const creator = await resolveCreatorOfPost(postId);
  if (!creator || (!creator.infId && !creator.username)) {
    return {
      ok: false,
      state: null,
      invited: false,
      error: "Creator not found for this post",
    };
  }
  const res = await resendCreatorPartnershipInvite({
    infId: creator.infId,
    username: creator.username,
    source: "posting-popup",
  });
  if (res.ok) revalidatePartnershipSurfaces();
  return res;
}

/** Explicit RESEND from the Partnership Status kanban (per-creator card). */
export async function resendPartnershipForCreator(
  infId: string,
): Promise<PartnershipSyncResult> {
  await assertPermission("posting_submit");
  const res = await resendCreatorPartnershipInvite({
    infId,
    source: "partnership-kanban",
  });
  if (res.ok) revalidatePartnershipSurfaces();
  return res;
}

/**
 * Refresh a creator's stored status from Meta (no invite). Used by the
 * Partnership Status kanban so accept/reject decisions show without waiting
 * for the next posting submit.
 */
export async function refreshPartnershipForCreator(
  infId: string,
): Promise<PartnershipSyncResult> {
  await assertPermission("performance_view");
  const res = await syncCreatorPartnership({
    infId,
    autoInvite: false,
    source: "partnership-kanban",
  });
  if (res.ok) revalidatePartnershipSurfaces();
  return res;
}
