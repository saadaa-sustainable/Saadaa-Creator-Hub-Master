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

// ─────────────────────────────────────────────────────────────────────────────
// Token expiry — "how many days until the MAIN token needs renewing?"
// ─────────────────────────────────────────────────────────────────────────────

const KEY_EXPIRY = "meta_token_expiry";
/** Re-ask Meta once a day; the answer only moves by the clock in between. */
const EXPIRY_RECHECK_MS = 24 * 60 * 60 * 1000;

export interface MetaTokenExpiry {
  /** Epoch ms when the token stops working (null = never / unknown). */
  expiresAt: number | null;
  /** Days left (ceil), null when the token never expires or is unknown. */
  daysLeft: number | null;
  checkedAt: number;
}

/**
 * Days remaining on the MAIN Meta token, via Meta's own `debug_token`
 * introspection (the token inspects itself). Long-lived user tokens run
 * ~60 days and do NOT auto-renew — this powers the header countdown so a
 * fresh token gets staged before fetching dies. Cached in app_settings
 * (`meta_token_expiry` JSON) and re-checked at most once a day; any failure
 * serves the last known answer.
 */
export async function getMetaTokenExpiry(): Promise<MetaTokenExpiry | null> {
  const main = process.env.META_GRAPH_API_TOKEN?.trim();
  if (!main) return null;
  const now = Date.now();
  const svc = createServiceClient();

  // Serve the cached answer while it's fresh enough.
  let cached: MetaTokenExpiry | null = null;
  try {
    const { data } = await (svc as any)
      .from("app_settings")
      .select("value")
      .eq("key", KEY_EXPIRY)
      .maybeSingle();
    const raw = (data as { value: unknown } | null)?.value;
    if (typeof raw === "string" && raw) {
      const o = JSON.parse(raw) as Partial<MetaTokenExpiry>;
      if (typeof o.checkedAt === "number") {
        cached = {
          expiresAt: typeof o.expiresAt === "number" ? o.expiresAt : null,
          daysLeft: null,
          checkedAt: o.checkedAt,
        };
      }
    }
  } catch {
    // fall through to a live check
  }
  const withDays = (e: MetaTokenExpiry): MetaTokenExpiry => ({
    ...e,
    daysLeft:
      e.expiresAt != null
        ? Math.max(0, Math.ceil((e.expiresAt - now) / 86_400_000))
        : null,
  });
  if (cached && now - cached.checkedAt < EXPIRY_RECHECK_MS) {
    return withDays(cached);
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(main)}&access_token=${encodeURIComponent(main)}`,
      { cache: "no-store", signal: AbortSignal.timeout(6000) },
    );
    const json = (await res.json()) as {
      data?: { expires_at?: number; data_access_expires_at?: number };
    };
    if (res.ok && json.data) {
      // Two clocks: the token's own expiry and the data-access window —
      // whichever ends first is when fetching stops. 0 = never.
      const candidates = [
        json.data.expires_at,
        json.data.data_access_expires_at,
      ]
        .map((v) => (typeof v === "number" && v > 0 ? v * 1000 : null))
        .filter((v): v is number => v != null);
      const next: MetaTokenExpiry = {
        expiresAt: candidates.length ? Math.min(...candidates) : null,
        daysLeft: null,
        checkedAt: now,
      };
      await (svc as any).from("app_settings").upsert(
        {
          key: KEY_EXPIRY,
          value: JSON.stringify({
            expiresAt: next.expiresAt,
            checkedAt: next.checkedAt,
          }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      return withDays(next);
    }
  } catch (err) {
    console.warn("[meta-token] expiry check failed:", err);
  }
  // Meta unreachable — last known beats nothing.
  return cached ? withDays(cached) : null;
}
