import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { META_BATCH_SIZE } from "@/lib/meta-graph";

/**
 * Server-side rate gate for Meta business_discovery (the Reach Out Fetch).
 *
 * The Meta token is GLOBAL across all users, and Meta abuse-blocks the whole app
 * after a burst (~500 calls). So we throttle centrally, mirroring ig_fetching.py:
 *
 *   - A rolling counter of calls. Every outbound Fetch = 1 call; an inbound bulk
 *     Fetch = up to META_BATCH_SIZE (50) calls in one Meta batch POST.
 *   - After the counter CROSSES 50 (a full batch worth of calls), a cooldown is
 *     enforced — new fetches are blocked until it elapses, then the counter resets.
 *   - If Meta's X-App-Usage crosses HIGH_USAGE_PCT, a LONGER cooldown kicks in
 *     immediately (the real abuse-block early-warning, like ig_fetching.py --cool-pct).
 *
 * State lives in app_settings.meta_fetch_window as JSON {count, cooldownUntil}.
 * Best-effort (read-modify-write isn't atomic across concurrent users) — fine for
 * a small team; the goal is to avoid a burst, not perfect accounting.
 */

const META_FETCH_WINDOW_KEY = "meta_fetch_window";

/** Calls per rolling window before a cooldown (one Meta batch worth). */
const COOLDOWN_AFTER = META_BATCH_SIZE; // 50
/** Cooldown after crossing the batch-of-50 (seconds). */
const POST_BATCH_COOLDOWN_SEC = 60;
/** X-App-Usage % that forces an early, longer cooldown. */
const HIGH_USAGE_PCT = 75;
/** Cooldown when X-App-Usage is high (seconds) — ig_fetching.py --cool-sec. */
const HIGH_USAGE_COOLDOWN_SEC = 300;

export interface MetaGate {
  coolingDown: boolean;
  retryAfterSec: number;
  count: number;
  /** Meta's own X-App-Usage % from the most recent call (0 = unknown/stale).
   *  This is the real hourly-quota gauge; `count` is only our local pacing
   *  window (cache-served fetches never move either). */
  usagePct: number;
}

interface WindowState {
  count: number;
  cooldownUntil: number | null; // epoch ms
  lastUsagePct?: number;
  lastUsageAt?: number; // epoch ms of the last usage report
}

/** X-App-Usage is an hourly gauge — treat a reading older than this as stale. */
const USAGE_FRESH_MS = 30 * 60 * 1000;

function parseState(raw: unknown): WindowState {
  if (typeof raw !== "string") return { count: 0, cooldownUntil: null };
  try {
    const o = JSON.parse(raw) as Partial<WindowState>;
    return {
      count: typeof o.count === "number" ? o.count : 0,
      cooldownUntil:
        typeof o.cooldownUntil === "number" ? o.cooldownUntil : null,
      lastUsagePct: typeof o.lastUsagePct === "number" ? o.lastUsagePct : 0,
      lastUsageAt: typeof o.lastUsageAt === "number" ? o.lastUsageAt : 0,
    };
  } catch {
    return { count: 0, cooldownUntil: null };
  }
}

async function readState(): Promise<WindowState> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("app_settings")
    .select("value")
    .eq("key", META_FETCH_WINDOW_KEY)
    .maybeSingle();
  return parseState((data as { value: unknown } | null)?.value);
}

async function writeState(state: WindowState): Promise<void> {
  const svc = createServiceClient();
  await svc.from("app_settings").upsert(
    {
      key: META_FETCH_WINDOW_KEY,
      value: JSON.stringify(state),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

function gateFrom(state: WindowState): MetaGate {
  const now = Date.now();
  const usagePct =
    state.lastUsagePct && state.lastUsageAt && now - state.lastUsageAt < USAGE_FRESH_MS
      ? state.lastUsagePct
      : 0;
  if (state.cooldownUntil && now < state.cooldownUntil) {
    return {
      coolingDown: true,
      retryAfterSec: Math.ceil((state.cooldownUntil - now) / 1000),
      count: state.count,
      usagePct,
    };
  }
  return { coolingDown: false, retryAfterSec: 0, count: state.count, usagePct };
}

/** Is a Meta fetch allowed right now? Read-only — call before fetching. */
export async function checkMetaGate(): Promise<MetaGate> {
  return gateFrom(await readState());
}

/**
 * Record `callsMade` Meta calls + the X-App-Usage % they reported, then decide
 * whether to open a cooldown. Returns the resulting gate. Call AFTER fetching.
 */
export async function recordMetaUsage(
  callsMade: number,
  usagePct: number,
): Promise<MetaGate> {
  const state = await readState();
  const now = Date.now();

  // A still-active cooldown means the counter already reset; leave it.
  if (state.cooldownUntil && now < state.cooldownUntil) {
    return gateFrom(state);
  }

  let count = state.count + Math.max(0, callsMade);
  let cooldownUntil: number | null = null;

  if (usagePct >= HIGH_USAGE_PCT) {
    cooldownUntil = now + HIGH_USAGE_COOLDOWN_SEC * 1000;
    count = 0;
  } else if (count >= COOLDOWN_AFTER) {
    cooldownUntil = now + POST_BATCH_COOLDOWN_SEC * 1000;
    count = 0;
  }

  const next: WindowState = {
    count,
    cooldownUntil,
    // Keep the freshest real usage reading for the header pill (a 0 report
    // usually means "header missing on this call", not "quota back to zero").
    lastUsagePct: usagePct > 0 ? usagePct : state.lastUsagePct,
    lastUsageAt: usagePct > 0 ? now : state.lastUsageAt,
  };
  await writeState(next);
  return gateFrom(next);
}
