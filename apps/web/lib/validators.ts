import { z } from "zod";

/**
 * Centralized URL validation (REQ #1) — single source of truth for every link
 * input across the app so "random alphabet" entries are rejected consistently
 * (reach-out IG, inbound IG, posting links, campaign briefs).
 */

/** Instagram profile URL — https://instagram.com/<handle>. */
export const IG_PROFILE_RE =
  /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+/i;

/**
 * Generic http(s) URL with a real host. Uses the URL parser (not a loose
 * regex) so "https://", "http://x" (no TLD), and bare text are all rejected.
 */
export function isValidUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = value.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      u.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

export function isInstagramProfileUrl(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  return IG_PROFILE_RE.test(value.trim());
}

/** Zod: required Instagram profile URL field. */
export const instagramProfileField = (
  requiredMsg = "Instagram URL required",
  invalidMsg = "Must be a valid Instagram profile URL",
) => z.string().trim().min(1, requiredMsg).regex(IG_PROFILE_RE, invalidMsg);

/** Zod: optional generic URL field (blank ok, else must be a valid URL). */
export const optionalUrlField = (invalidMsg = "Must be a valid URL") =>
  z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => !v || isValidUrl(v), { message: invalidMsg });

/** Zod: required generic URL field. */
export const requiredUrlField = (
  requiredMsg = "URL required",
  invalidMsg = "Must be a valid URL",
) =>
  z
    .string()
    .trim()
    .min(1, requiredMsg)
    .refine((v) => isValidUrl(v), { message: invalidMsg });
