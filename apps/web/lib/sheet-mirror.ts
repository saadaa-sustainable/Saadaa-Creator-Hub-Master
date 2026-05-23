import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "./env.server";

export type MirrorAction =
  | "mirror_reachout"
  | "mirror_campaign"
  | "mirror_onboard"
  | "mirror_posting"
  | "mirror_payment"
  | "ping";

interface MirrorResponse {
  ok: boolean;
  action?: string;
  data?: unknown;
  error?: string;
}

/**
 * Sends an HMAC-signed JSON POST to the legacy GAS mirror endpoint.
 * Failure is non-fatal — Supabase remains source of truth.
 */
export async function mirrorToSheet(
  action: MirrorAction,
  data: Record<string, unknown>,
): Promise<MirrorResponse> {
  const endpoint = serverEnv.GAS_MIRROR_ENDPOINT;
  const secret = serverEnv.GAS_MIRROR_SECRET;
  if (!endpoint || !secret) {
    return { ok: false, error: "mirror not configured" };
  }

  const ts = Math.floor(Date.now() / 1000).toString();
  const canonical = `${action}.${ts}.${JSON.stringify(data)}`;
  const sig = createHmac("sha256", secret).update(canonical).digest("hex");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ts, data, sig }),
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: MirrorResponse;
    try {
      parsed = JSON.parse(text) as MirrorResponse;
    } catch {
      return { ok: false, error: `non-JSON response: ${text.slice(0, 200)}` };
    }
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "mirror fetch failed";
    return { ok: false, error: msg };
  }
}
