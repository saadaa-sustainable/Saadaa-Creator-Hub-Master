/**
 * Decode an Instagram media shortcode → Date.
 *
 * Direct TS port of legacy InfluencerBackend.js#shortcodeToDate.
 * Formula: timestamp_ms = (media_id >> 23) + 1314220021721
 * (shift=23, Instagram epoch=1314220021721 — verified against real posts).
 *
 * Shortcodes use base64url charset; no API call required.
 */
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const INSTAGRAM_EPOCH = 1_314_220_021_721n;

export function shortcodeToDate(shortcode: string): Date | null {
  if (!shortcode) return null;
  let id = 0n;
  for (const ch of shortcode) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    id = id * 64n + BigInt(idx);
  }
  try {
    const tsMs = (id >> 23n) + INSTAGRAM_EPOCH;
    const d = new Date(Number(tsMs));
    if (Number.isNaN(d.getTime())) return null;
    if (d.getFullYear() < 2010 || d.getFullYear() > 2099) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Extract the shortcode segment from any Instagram URL form:
 *   https://instagram.com/p/{code}/
 *   https://www.instagram.com/reel/{code}/
 *   https://www.instagram.com/{user}/p/{code}/
 *   https://instagram.com/tv/{code}/
 */
export function extractShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|tv|reels)\/([^/?#]+)/i);
  return match ? match[1] : null;
}

/**
 * Convenience: derive an IST (Asia/Kolkata) yyyy-MM-dd post date from any IG URL.
 * Returns null when the URL doesn't contain a decodable shortcode.
 *
 * Why IST: Instagram displays dates in the viewer's local timezone, and our
 * operators are all in India. A post published at 00:30 IST May 7 is May 6
 * 19:00 UTC — UTC-sliced date would say "May 6" while IG shows "May 7".
 */
export function postDateFromUrl(url: string | null | undefined): string | null {
  const sc = extractShortcode(url);
  if (!sc) return null;
  const d = shortcodeToDate(sc);
  if (!d) return null;
  return formatIstDate(d);
}

/** Format a Date as yyyy-MM-dd in Asia/Kolkata (IST = UTC+5:30, no DST). */
export function formatIstDate(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA already emits yyyy-MM-dd, but Intl returns parts unordered on some
  // engines — assemble explicitly to be safe.
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

/**
 * Pull the username from an IG post URL when present.
 *   https://instagram.com/{user}/p/{code}/ → "{user}"
 *   https://instagram.com/reel/{code}/     → null (no user in path)
 */
export function usernameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/instagram\.com\/([a-z0-9._]+)\/p\//i);
  return m ? m[1].toLowerCase() : null;
}
