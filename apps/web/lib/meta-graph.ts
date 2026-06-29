import "server-only";
import { extractShortcode } from "./instagram-shortcode";

/**
 * Meta Graph `business_discovery` — INSTANT public-profile lookup for a handle.
 *
 * Replaces the old Apify 3-hr scrape path for Reach Out: on the Fetch click we
 * call Meta live and show followers / profile pic / avg likes / ER / the legacy
 * numeric profile id (`ig_id`) immediately, at no cost.
 *
 * Two modes (mirrors build_ig_data_historic.py / ig_fetching.py):
 *   - fetchBusinessDiscovery(handle)      → ONE GET (single outbound Fetch click)
 *   - fetchBusinessDiscoveryBatch(handles) → ONE batch POST, up to 50 sub-requests
 *     (the inbound bulk Fetch). Meta caps a batch at 50 sub-requests per HTTP call.
 *
 * Both return the X-App-Usage % so the caller can drive an adaptive cooldown
 * (see lib/meta-rate-limit.ts). The token is READ-ONLY (business_discovery); we
 * never write/publish to Meta. Creds read from process.env (mirrors meta-ads.ts):
 *   META_GRAPH_API_TOKEN — the long-lived access token
 *   ID                   — our own IG business id (17841412619002528, saadaadesigns)
 *
 * IMPORTANT — TWO ids: business_discovery returns `id` (a 17841… Graph/IGSID,
 * NOT used) AND `ig_id` (the legacy ~10-11 digit numeric profile id that matches
 * cleaned_data / commentpicker / the old Apify data). We use `ig_id` as profile_id.
 * Business / creator accounts ONLY — a PERSONAL account → "Cannot find User".
 */

const GRAPH_VERSION = "v21.0";

/** Meta caps a batch at 50 sub-requests per HTTP call (ig_fetching.py BATCH_MAX). */
export const META_BATCH_SIZE = 50;
/** media.limit — fewer recent posts = faster Meta response. 6 keeps ER reasonable
 *  while roughly halving the per-fetch latency vs 12 (Meta's media pull dominates). */
const MEDIA_LIMIT = 6;
const PROFILE_FIELDS =
  "ig_id,username,name,biography,followers_count,profile_picture_url";

export type MetaDiscoveryStatus = "ok" | "notfound" | "error";

export interface MetaDiscoveryNode {
  ig_id: string | null; // legacy numeric profile id (USE THIS as profile_id)
  username: string | null;
  name: string | null; // display/full name
  biography: string | null;
  followers: number | null;
  profile_pic: string | null;
  avg_likes: number | null; // mean like_count over recent media
  er: number | null; // (avg likes + avg comments) / followers × 100
}

export interface MetaDiscoveryResult {
  status: MetaDiscoveryStatus;
  node?: MetaDiscoveryNode;
  error?: string;
  /** Max X-App-Usage percent observed on this call (0 when unknown). */
  usagePct?: number;
}

function creds(): { token: string; ownId: string } | null {
  const token = process.env.META_GRAPH_API_TOKEN?.trim();
  // Our own IG business id. `META_IG_BUSINESS_ID` is the canonical name (set this
  // on Vercel — `ID` is too generic to rely on in prod); `ID` is kept as a local
  // fallback so existing .env.local files keep working.
  const ownId = (
    process.env.META_IG_BUSINESS_ID || process.env.ID
  )?.trim();
  if (!token || !ownId) return null;
  return { token, ownId };
}

export function isMetaGraphConfigured(): boolean {
  return creds() !== null;
}

function cleanHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/** Phrases Meta returns when a handle isn't a reachable business/creator account. */
function isNotFound(body: string): boolean {
  const low = body.toLowerCase();
  return (
    low.includes("cannot be found") ||
    low.includes("cannot find") ||
    low.includes("invalid user") ||
    low.includes("does not exist") ||
    low.includes("no instagram business account") ||
    low.includes("personal account")
  );
}

function discoveryField(handle: string): string {
  return (
    `business_discovery.username(${cleanHandle(handle)})` +
    `{${PROFILE_FIELDS},media.limit(${MEDIA_LIMIT}){like_count,comments_count}}`
  );
}

/** Max % from an X-App-Usage object (call_count / total_cputime / total_time). */
function usageMaxPct(raw: string | null): number {
  if (!raw) return 0;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const nums = Object.values(obj)
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter((n) => !Number.isNaN(n));
    return nums.length ? Math.max(...nums) : 0;
  } catch {
    return 0;
  }
}

/** Map one business_discovery node object → MetaDiscoveryNode (likes/ER computed). */
function buildNode(
  bd: {
    ig_id?: number | string;
    username?: string;
    name?: string;
    biography?: string;
    followers_count?: number;
    profile_picture_url?: string;
    media?: { data?: Array<{ like_count?: number; comments_count?: number }> };
  },
  fallbackHandle: string,
): MetaDiscoveryNode {
  const followers =
    typeof bd.followers_count === "number" ? bd.followers_count : null;
  let avgLikes: number | null = null;
  let er: number | null = null;
  const media = bd.media?.data ?? [];
  if (media.length > 0) {
    const meanLikes =
      media.reduce((a, m) => a + Number(m.like_count ?? 0), 0) / media.length;
    const meanComments =
      media.reduce((a, m) => a + Number(m.comments_count ?? 0), 0) /
      media.length;
    avgLikes = Math.round(meanLikes);
    if (followers && followers > 0) {
      // ER can exceed 100% on small accounts with a viral reel — expected.
      er = Number((((meanLikes + meanComments) / followers) * 100).toFixed(2));
    }
  }
  return {
    ig_id: bd.ig_id != null ? String(bd.ig_id) : null,
    username: typeof bd.username === "string" ? bd.username : fallbackHandle,
    name: typeof bd.name === "string" && bd.name.length > 0 ? bd.name : null,
    biography:
      typeof bd.biography === "string" && bd.biography.length > 0
        ? bd.biography
        : null,
    followers,
    profile_pic:
      typeof bd.profile_picture_url === "string"
        ? bd.profile_picture_url
        : null,
    avg_likes: avgLikes,
    er,
  };
}

/** Map a parsed business_discovery body → MetaDiscoveryResult (no usage here). */
function parseBody(
  body: { business_discovery?: Parameters<typeof buildNode>[0]; error?: { message?: string; code?: number } } | null,
  handle: string,
): MetaDiscoveryResult {
  if (!body) return { status: "error", error: "empty sub-response" };
  if (body.error) {
    const msg = body.error.message ?? "unknown";
    if (body.error.code === 4 || /request limit/i.test(msg)) {
      return { status: "error", error: `rate_limited: ${msg}` };
    }
    if (isNotFound(msg)) return { status: "notfound" };
    return { status: "error", error: msg.slice(0, 200) };
  }
  const bd = body.business_discovery;
  if (!bd || bd.ig_id == null) return { status: "notfound" };
  return { status: "ok", node: buildNode(bd, handle) };
}

/**
 * Cheap /me call to read the true X-App-Usage (the batch OUTER response omits it).
 * Returns 0 on any failure.
 */
export async function probeAppUsage(): Promise<number> {
  const c = creds();
  if (!c) return 0;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id&access_token=${encodeURIComponent(c.token)}`,
      { cache: "no-store" },
    );
    return usageMaxPct(res.headers.get("x-app-usage"));
  } catch {
    return 0;
  }
}

/**
 * BEST-EFFORT verified-badge lookup via Instagram's public web_profile_info JSON
 * (the `<title>Verified</title>` badge isn't exposed by Meta business_discovery).
 * READ-ONLY, no auth. IG throttles data-center IPs hard, so this often gets blocked
 * from a server — returns null on ANY failure (caller falls back to manual). Use
 * ONLY for the low-volume single (outbound) fetch; never in the 50-row bulk.
 * Returns true/false (verified) or null (unknown / blocked).
 */
export async function fetchIgVerified(handle: string): Promise<boolean | null> {
  const clean = cleanHandle(handle);
  if (!clean) return null;
  try {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
      {
        headers: {
          "x-ig-app-id": "936619743392459",
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram",
          accept: "*/*",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) {
      // Almost always IG blocking the server's data-center IP (401/429). Logged so
      // it's visible in the Vercel runtime logs; caller falls back to manual.
      console.warn(`[fetchIgVerified] ${clean} HTTP ${res.status} (likely IP block)`);
      return null;
    }
    const j = (await res.json()) as {
      data?: { user?: { is_verified?: boolean } };
    };
    const v = j?.data?.user?.is_verified;
    return typeof v === "boolean" ? v : null;
  } catch (e) {
    console.warn(
      `[fetchIgVerified] ${clean} failed: ${e instanceof Error ? e.name : "err"}`,
    );
    return null;
  }
}

/** Single business_discovery GET (one outbound Fetch click). */
export async function fetchBusinessDiscovery(
  handle: string,
): Promise<MetaDiscoveryResult> {
  const c = creds();
  if (!c) return { status: "error", error: "Meta Graph not configured" };
  const clean = cleanHandle(handle);
  if (!clean) return { status: "error", error: "empty handle" };

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${c.ownId}?` +
    `fields=${encodeURIComponent(discoveryField(clean))}&access_token=${encodeURIComponent(c.token)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const usagePct = usageMaxPct(res.headers.get("x-app-usage"));

    if (!res.ok) {
      if (isNotFound(text)) return { status: "notfound", usagePct };
      return { status: "error", error: text.slice(0, 200), usagePct };
    }
    const json = JSON.parse(text) as Parameters<typeof parseBody>[0];
    return { ...parseBody(json, clean), usagePct };
  } catch (e) {
    return {
      status: "error",
      error: e instanceof Error ? e.message.slice(0, 200) : "fetch failed",
    };
  }
}

/** media.limit for the single-post probe — enough recent posts to cover a
 *  just-published collab without an expensive deep pull. */
const POST_PROBE_MEDIA_LIMIT = 50;

/** Rich node for the matched post (powers the post-date auto-fill + preview). */
export interface MetaPostNode {
  permalink: string | null;
  timestamp: string | null; // ISO 8601 publish time
  caption: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  mediaType: string | null; // IMAGE | VIDEO | CAROUSEL_ALBUM
  thumbnailUrl: string | null; // poster for VIDEO (signed, short-lived)
  mediaUrl: string | null; // CDN media (signed, short-lived)
}

export interface MetaPostResult {
  /** ok = matched the shortcode in the creator's media (we have the real data). */
  status: "ok" | "notfound" | "error";
  node?: MetaPostNode;
  error?: string;
  usagePct?: number;
}

function postProbeField(handle: string): string {
  return (
    `business_discovery.username(${cleanHandle(handle)})` +
    `{username,media.limit(${POST_PROBE_MEDIA_LIMIT})` +
    `{permalink,timestamp,caption,like_count,comments_count,media_type,thumbnail_url,media_url}}`
  );
}

type RawMedia = {
  permalink?: string;
  timestamp?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  thumbnail_url?: string;
  media_url?: string;
};

function buildPostNode(m: RawMedia): MetaPostNode {
  return {
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? null,
    caption: typeof m.caption === "string" && m.caption ? m.caption : null,
    likeCount: typeof m.like_count === "number" ? m.like_count : null,
    commentsCount: typeof m.comments_count === "number" ? m.comments_count : null,
    mediaType: m.media_type ?? null,
    thumbnailUrl: m.thumbnail_url ?? null,
    mediaUrl: m.media_url ?? null,
  };
}

/**
 * Resolve a single Instagram post by looking it up in the creator's own recent
 * media via business_discovery, matched on shortcode. Returns the post's REAL
 * published timestamp + caption / like_count / comments_count / media_type.
 *
 * A match proves BOTH facts the posting form needs: the authoritative post date
 * (Meta's `timestamp`, not the ±1-day shortcode estimate) AND that the post
 * actually belongs to `handle` (it's in that account's media edge). READ-ONLY —
 * `status:"notfound"` when the handle resolves but the post isn't among its
 * recent ~50 media (older post / wrong creator / personal account), so the caller
 * can fall back to the local shortcode decode.
 */
export async function fetchPostByShortcode(
  handle: string,
  shortcode: string,
): Promise<MetaPostResult> {
  const c = creds();
  if (!c) return { status: "error", error: "Meta Graph not configured" };
  const clean = cleanHandle(handle);
  const sc = shortcode.trim();
  if (!clean || !sc) return { status: "error", error: "missing handle/shortcode" };

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${c.ownId}?` +
    `fields=${encodeURIComponent(postProbeField(clean))}&access_token=${encodeURIComponent(c.token)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const usagePct = usageMaxPct(res.headers.get("x-app-usage"));

    if (!res.ok) {
      if (isNotFound(text)) return { status: "notfound", usagePct };
      return { status: "error", error: text.slice(0, 200), usagePct };
    }
    const json = JSON.parse(text) as {
      business_discovery?: { media?: { data?: RawMedia[] } };
      error?: { message?: string; code?: number };
    };
    if (json.error) {
      const msg = json.error.message ?? "unknown";
      if (json.error.code === 4 || /request limit/i.test(msg)) {
        return { status: "error", error: `rate_limited: ${msg}`, usagePct };
      }
      if (isNotFound(msg)) return { status: "notfound", usagePct };
      return { status: "error", error: msg.slice(0, 200), usagePct };
    }
    const media = json.business_discovery?.media?.data ?? [];
    const hit = media.find((m) => extractShortcode(m.permalink) === sc);
    if (hit) return { status: "ok", node: buildPostNode(hit), usagePct };
    return { status: "notfound", usagePct };
  } catch (e) {
    return {
      status: "error",
      error: e instanceof Error ? e.message.slice(0, 200) : "fetch failed",
    };
  }
}

/**
 * Batch business_discovery — ONE Meta Batch POST with up to 50 sub-requests.
 * Returns results PARALLEL to `handles` plus the max X-App-Usage % observed.
 * Mirrors ig_fetching.py fetch_meta_batch. Caller must pass ≤ META_BATCH_SIZE.
 */
export async function fetchBusinessDiscoveryBatch(
  handles: string[],
): Promise<{ results: MetaDiscoveryResult[]; usagePct: number }> {
  const c = creds();
  if (!c) {
    return {
      results: handles.map(() => ({
        status: "error" as const,
        error: "Meta Graph not configured",
      })),
      usagePct: 0,
    };
  }
  const slice = handles.slice(0, META_BATCH_SIZE);

  const sub = slice.map((h) => ({
    method: "GET",
    relative_url: `${GRAPH_VERSION}/${c.ownId}?fields=${encodeURIComponent(discoveryField(h))}`,
  }));

  try {
    const form = new URLSearchParams();
    form.set("access_token", c.token);
    form.set("batch", JSON.stringify(sub));
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    let usagePct = usageMaxPct(res.headers.get("x-app-usage"));
    const text = await res.text();

    if (!res.ok) {
      const msg = text.slice(0, 200);
      return {
        results: slice.map(() => ({
          status: "error" as const,
          error: `HTTP ${res.status}: ${msg}`,
        })),
        usagePct,
      };
    }

    const arr = JSON.parse(text) as Array<{
      code?: number;
      body?: string;
    } | null>;
    const results: MetaDiscoveryResult[] = slice.map((h, i) => {
      const subResp = arr[i];
      if (!subResp) {
        return { status: "error", error: "sub-response null (throttled)" };
      }
      let parsed: Parameters<typeof parseBody>[0] = null;
      try {
        parsed = JSON.parse(subResp.body ?? "{}");
      } catch {
        return { status: "error", error: "sub body decode failed" };
      }
      const r = parseBody(parsed, cleanHandle(h));
      if (subResp.code && subResp.code !== 200 && r.status === "ok") {
        return { status: "error", error: `sub HTTP ${subResp.code}` };
      }
      return r;
    });

    // The batch OUTER response usually omits X-App-Usage → probe /me for truth.
    if (usagePct === 0) usagePct = await probeAppUsage();

    return { results, usagePct };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 200) : "batch failed";
    return {
      results: slice.map(() => ({ status: "error" as const, error })),
      usagePct: 0,
    };
  }
}
