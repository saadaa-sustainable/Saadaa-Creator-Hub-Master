import "server-only";

import { createServiceClient } from "./supabase/server";
import {
  getPartnershipStatus,
  isPartnershipConfigured,
  sendPartnershipInvite,
} from "./meta-partnership";
import { type PartnershipState } from "./partnership";
import { logSystemError } from "./system-errors";

/**
 * Partnership sync orchestrator — reads the creator's live Meta
 * branded-content permission and mirrors it onto every `posts` row of that
 * creator, optionally auto-sending the invite when none exists.
 *
 * Called from submitPosting (auto-invite ON) and safe to call from any
 * status-refresh surface (auto-invite OFF). Fail-soft by contract: errors are
 * logged to system_errors (type 'partnership_sync') and returned, never
 * thrown — a Meta hiccup must never block a posting submit.
 *
 * Stamping rules (per-creator state fanned onto per-post columns):
 *   - partnership_status   = normalized state, ALL rows of the creator
 *   - partnership_id       = Meta permission id when known
 *   - ad_partnership_valid = state === 'approved' (single source for gates)
 *   - partnership_sent_at / _approved_at / _declined_at = stamped ONLY when
 *     currently NULL (first-transition history, never overwritten)
 *
 * Auto-invite policy: send ONLY when NO permission record exists. A rejected
 * or revoked record is NOT auto-resent — the creator explicitly said no, so
 * resending is a deliberate manual action, not a side effect of a submit.
 */
export interface PartnershipSyncResult {
  ok: boolean;
  state: PartnershipState | null;
  invited: boolean;
  error?: string;
}

export async function syncCreatorPartnership(opts: {
  infId?: string | null;
  username?: string | null;
  autoInvite?: boolean;
  source?: string;
}): Promise<PartnershipSyncResult> {
  const source = opts.source ?? "partnership-sync";
  const handle = (opts.username ?? "").trim().replace(/^@/, "").toLowerCase();
  const infId = (opts.infId ?? "").trim();

  if (!handle && !infId) {
    return { ok: false, state: null, invited: false, error: "No creator handle" };
  }
  if (!isPartnershipConfigured()) {
    return {
      ok: false,
      state: null,
      invited: false,
      error: "Meta partnership not configured",
    };
  }

  const supabase = createServiceClient();

  // Resolve the handle from the creator's posts when only inf_id was passed.
  let resolvedHandle = handle;
  if (!resolvedHandle && infId) {
    const { data } = await (supabase as any)
      .from("posts")
      .select("username")
      .eq("inf_id", infId)
      .not("username", "is", null)
      .limit(1)
      .maybeSingle();
    resolvedHandle = ((data?.username as string | null) ?? "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
  }
  if (!resolvedHandle) {
    return { ok: false, state: null, invited: false, error: "No creator handle" };
  }

  const read = await getPartnershipStatus(resolvedHandle);
  if (!read.ok) {
    await logSystemError({
      type: "partnership_sync",
      key: resolvedHandle,
      message: `Status read failed: ${read.error}`,
      source,
    });
    return { ok: false, state: null, invited: false, error: read.error };
  }

  let state = read.status.state;
  let permissionId = read.status.permissionId;
  let invited = false;

  if (state === "none" && opts.autoInvite) {
    const sent = await sendPartnershipInvite(resolvedHandle);
    if (sent.ok) {
      invited = true;
      state = "pending";
      permissionId = sent.permissionId ?? permissionId;
    } else {
      await logSystemError({
        type: "partnership_sync",
        key: resolvedHandle,
        message: `Auto-invite failed: ${sent.error}`,
        source,
      });
      // Keep going — stamp the (none) state so the UI shows the truth.
    }
  }

  // Fan the creator-level state onto every posts row of this creator. Match by
  // inf_id when known (authoritative), else by username.
  const match = (q: any) =>
    infId ? q.eq("inf_id", infId) : q.eq("username", resolvedHandle);

  // ad_partnership_valid doubles as the admin's manual override (set via the
  // inline Partnership Key edit), so the sync only touches it on explicit
  // creator decisions: approved → true, rejected/revoked → false. Pending /
  // none leave it alone. partnership_id likewise only written when Meta
  // returned a real permission id — never wiped.
  const payload: Record<string, unknown> = { partnership_status: state };
  if (permissionId) payload.partnership_id = permissionId;
  if (state === "approved") payload.ad_partnership_valid = true;
  if (state === "rejected" || state === "revoked")
    payload.ad_partnership_valid = false;

  const { error: updErr } = await match(
    (supabase as any).from("posts").update(payload),
  );
  if (updErr) {
    await logSystemError({
      type: "partnership_sync",
      key: resolvedHandle,
      message: `DB stamp failed: ${updErr.message}`,
      source,
    });
    return { ok: false, state, invited, error: updErr.message };
  }

  // First-transition timestamps — only fill when currently NULL.
  const now = new Date().toISOString();
  if (invited || read.status.exists) {
    await match(
      (supabase as any)
        .from("posts")
        .update({ partnership_sent_at: now })
        .is("partnership_sent_at", null),
    );
  }
  if (state === "approved") {
    await match(
      (supabase as any)
        .from("posts")
        .update({ partnership_approved_at: now })
        .is("partnership_approved_at", null),
    );
  }
  if (state === "rejected" || state === "revoked") {
    await match(
      (supabase as any)
        .from("posts")
        .update({ partnership_declined_at: now })
        .is("partnership_declined_at", null),
    );
  }

  return { ok: true, state, invited };
}

/**
 * Explicit RESEND after a rejection/revocation — a deliberate operator action
 * (popup / kanban button), never automatic. Sends a fresh request and stamps
 * the creator's rows back to pending with a NEW sent_at (overwritten — it is
 * a new request; the declined_at of the previous one is kept as history).
 */
export async function resendCreatorPartnershipInvite(opts: {
  infId?: string | null;
  username?: string | null;
  source?: string;
}): Promise<PartnershipSyncResult> {
  const source = opts.source ?? "partnership-resend";
  const handle = (opts.username ?? "").trim().replace(/^@/, "").toLowerCase();
  const infId = (opts.infId ?? "").trim();
  if (!handle && !infId) {
    return { ok: false, state: null, invited: false, error: "No creator handle" };
  }
  if (!isPartnershipConfigured()) {
    return {
      ok: false,
      state: null,
      invited: false,
      error: "Meta partnership not configured",
    };
  }

  const supabase = createServiceClient();
  let resolvedHandle = handle;
  if (!resolvedHandle && infId) {
    const { data } = await (supabase as any)
      .from("posts")
      .select("username")
      .eq("inf_id", infId)
      .not("username", "is", null)
      .limit(1)
      .maybeSingle();
    resolvedHandle = ((data?.username as string | null) ?? "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
  }
  if (!resolvedHandle) {
    return { ok: false, state: null, invited: false, error: "No creator handle" };
  }

  const sent = await sendPartnershipInvite(resolvedHandle);
  if (!sent.ok) {
    await logSystemError({
      type: "partnership_sync",
      key: resolvedHandle,
      message: `Resend failed: ${sent.error}`,
      source,
    });
    return { ok: false, state: null, invited: false, error: sent.error };
  }

  const match = (q: any) =>
    infId ? q.eq("inf_id", infId) : q.eq("username", resolvedHandle);
  const payload: Record<string, unknown> = {
    partnership_status: "pending",
    partnership_sent_at: new Date().toISOString(),
    ad_partnership_valid: false,
  };
  if (sent.permissionId) payload.partnership_id = sent.permissionId;
  const { error: updErr } = await match(
    (supabase as any).from("posts").update(payload),
  );
  if (updErr) {
    await logSystemError({
      type: "partnership_sync",
      key: resolvedHandle,
      message: `DB stamp failed after resend: ${updErr.message}`,
      source,
    });
    return { ok: false, state: "pending", invited: true, error: updErr.message };
  }
  return { ok: true, state: "pending", invited: true };
}
