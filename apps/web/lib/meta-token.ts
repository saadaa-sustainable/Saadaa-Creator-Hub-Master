import "server-only";
import { createServiceClient } from "./supabase/server";

/**
 * Meta Graph token resolution with a TEMPORARY-token override.
 *
 * When the main long-lived token hits Meta's app-level rate limit, an admin can
 * stage a short-lived replacement (Graph Explorer token) that the app uses
 * until an expiry timestamp, then automatically falls back to the main token —
 * no redeploy, no code change to revert.
 *
 * Sources, in priority order:
 *   1. app_settings rows `meta_temp_token` + `meta_temp_token_until` (ISO) —
 *      works on PROD instantly; set both via SQL/Settings and the app picks
 *      them up within a minute (60s in-memory cache below).
 *   2. env META_GRAPH_TEMP_TOKEN + META_GRAPH_TEMP_TOKEN_UNTIL — local dev.
 *   3. env META_GRAPH_API_TOKEN — the main token.
 *
 * The temp token is used ONLY while `until` is in the future. Missing/expired/
 * malformed override → main token. DB errors fail soft to the main token.
 */

const KEY_TOKEN = "meta_temp_token";
const KEY_UNTIL = "meta_temp_token_until";
const CACHE_MS = 60_000;

let cache: { temp: string | null; at: number } | null = null;

function envTemp(now: number): string | null {
  const tok = process.env.META_GRAPH_TEMP_TOKEN?.trim();
  if (!tok) return null;
  const untilRaw = process.env.META_GRAPH_TEMP_TOKEN_UNTIL?.trim();
  const until = untilRaw ? Date.parse(untilRaw) : NaN;
  return Number.isFinite(until) && now < until ? tok : null;
}

export async function resolveMetaToken(): Promise<string | null> {
  const main = process.env.META_GRAPH_API_TOKEN?.trim() || null;
  const now = Date.now();

  if (cache && now - cache.at < CACHE_MS) {
    return cache.temp ?? envTemp(now) ?? main;
  }

  let temp: string | null = null;
  try {
    const svc = createServiceClient();
    const { data } = await (svc as any)
      .from("app_settings")
      .select("key, value")
      .in("key", [KEY_TOKEN, KEY_UNTIL]);
    const map = new Map<string, string>(
      ((data ?? []) as Array<{ key: string; value: unknown }>).map((r) => [
        r.key,
        String(r.value ?? "").trim(),
      ]),
    );
    const tok = map.get(KEY_TOKEN) ?? "";
    const untilRaw = map.get(KEY_UNTIL) ?? "";
    const until = untilRaw ? Date.parse(untilRaw) : NaN;
    if (tok && Number.isFinite(until) && now < until) temp = tok;
  } catch (err) {
    console.warn("[meta-token] temp-token lookup failed, using main:", err);
  }

  cache = { temp, at: now };
  return temp ?? envTemp(now) ?? main;
}
