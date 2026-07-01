import "server-only";

/**
 * Meta Partnership Ads (branded content) — partnership permission status + invite.
 *
 * Permissions are PER-CREATOR (account-level): the brand (Saadaa IGBA) holds one
 * permission record per creator. Status drives the posting form + dashboards:
 *   • Approved        → partner already exists (skip invite)
 *   • Pending Approval → invite sent, awaiting the creator
 *   • Rejected/Revoked → resend allowed
 *   • (none)          → no partnership yet, can invite
 *
 * READ (`getPartnershipStatus`) is validated (dry-run, HTTP 200). WRITE
 * (`sendPartnershipInvite`) is the brand-initiated request — gated behind an
 * explicit user action (the /posting test button) until confirmed on a
 * controlled account (@saadaa_women). Token = META_GRAPH_API_TOKEN; brand IGBA =
 * META_IG_BUSINESS_ID || ID.
 */

const GRAPH_VERSION = "v22.0";

export type PartnershipState =
  | "approved"
  | "pending"
  | "rejected"
  | "revoked"
  | "none"
  | "unknown";

export interface PartnershipStatus {
  state: PartnershipState;
  rawStatus: string | null; // Meta's permission_status verbatim
  exists: boolean; // a permission record exists (any state)
  permissionId: string | null;
  creatorIgId: string | null;
  handle: string;
}

function creds(): { token: string; ownId: string } | null {
  const token = process.env.META_GRAPH_API_TOKEN?.trim();
  const ownId = (process.env.META_IG_BUSINESS_ID || process.env.ID)?.trim();
  if (!token || !ownId) return null;
  return { token, ownId };
}

export function isPartnershipConfigured(): boolean {
  return creds() !== null;
}

function cleanHandle(h: string): string {
  return (h ?? "").trim().replace(/^@/, "").toLowerCase();
}

/** Map Meta's permission_status text → our normalized state.
 *
 * ORDER MATTERS: "Pending Approval" contains the substring "approv", so the
 * pending / rejected / revoked checks MUST run before the approved check —
 * otherwise a still-pending invite (request sent, awaiting creator) is
 * mis-read as "approved". Meta values: Approved / Pending Approval /
 * Rejected / Revoked (Declined seen on some surfaces). */
function toState(raw: string | null | undefined): PartnershipState {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "none";
  if (s.includes("pending")) return "pending";
  // "Canceled" is what Meta reports when the creator DECLINES a brand-initiated
  // branded_content_ad_permission request → treat as rejected.
  if (s.includes("reject") || s.includes("declin") || s.includes("cancel"))
    return "rejected";
  if (s.includes("revok")) return "revoked";
  if (s.includes("approv")) return "approved";
  return "unknown";
}

/** READ — current partnership permission for a creator (per-creator). */
export async function getPartnershipStatus(
  handleInput: string,
): Promise<
  | { ok: true; status: PartnershipStatus }
  | { ok: false; error: string }
> {
  const c = creds();
  if (!c) return { ok: false, error: "Meta partnership not configured" };
  const handle = cleanHandle(handleInput);
  if (!handle) return { ok: false, error: "Empty creator handle" };

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${c.ownId}/branded_content_ad_permissions?` +
    `creator_username=${encodeURIComponent(handle)}&access_token=${encodeURIComponent(c.token)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: String(msg).slice(0, 240) };
    }
    const first = (body?.data ?? [])[0] ?? null;
    if (!first) {
      return {
        ok: true,
        status: {
          state: "none",
          rawStatus: null,
          exists: false,
          permissionId: null,
          creatorIgId: null,
          handle,
        },
      };
    }
    const rawStatus =
      first.permission_status ?? first.status ?? null;
    return {
      ok: true,
      status: {
        state: toState(rawStatus),
        rawStatus: rawStatus ?? null,
        exists: true,
        permissionId: first.id ?? null,
        creatorIgId: first.creator_ig_id ?? null,
        handle: first.creator_username ?? handle,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 240) : "fetch failed",
    };
  }
}

/**
 * WRITE — send a brand-initiated partnership-ad permission request to a creator.
 * REAL outward action: the creator receives an invite to approve in their IG
 * professional dashboard. Only call from an explicit, gated user action.
 */
export async function sendPartnershipInvite(
  handleInput: string,
): Promise<
  | { ok: true; permissionId: string | null; rawStatus: string | null }
  | { ok: false; error: string }
> {
  const c = creds();
  if (!c) return { ok: false, error: "Meta partnership not configured" };
  const handle = cleanHandle(handleInput);
  if (!handle) return { ok: false, error: "Empty creator handle" };

  const form = new URLSearchParams();
  form.set("creator_instagram_username", handle);
  form.set("access_token", c.token);

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${c.ownId}/branded_content_ad_permissions`,
      { method: "POST", body: form, cache: "no-store" },
    );
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: String(msg).slice(0, 300) };
    }
    return {
      ok: true,
      permissionId: body?.id ?? body?.permission_id ?? null,
      rawStatus: body?.permission_status ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "request failed",
    };
  }
}
