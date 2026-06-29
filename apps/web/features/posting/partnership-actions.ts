"use server";

import { assertPermission } from "@/lib/rbac.server";
import {
  getPartnershipStatus,
  isPartnershipConfigured,
  sendPartnershipInvite,
  type PartnershipStatus,
} from "@/lib/meta-partnership";

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
