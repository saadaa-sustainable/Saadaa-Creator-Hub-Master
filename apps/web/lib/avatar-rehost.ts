import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Re-host an Instagram avatar into the public `avatars` storage bucket.
 *
 * Meta business_discovery returns SIGNED fbcdn URLs that expire within days —
 * a creator fetched on Monday shows initials by Friday. Every persist path
 * routes the picture through here so `creators.profile_pic` /
 * `instagram_cache.profile_pic` hold a durable
 * `…/storage/v1/object/public/avatars/{username}` URL instead (same pattern
 * the 3-hr scrape cron's trigger uses).
 *
 * Best-effort: any failure (expired source, network, storage) returns null
 * and the caller keeps the raw URL — never worse than before.
 */
export async function rehostAvatar(
  username: string,
  srcUrl: string | null | undefined,
): Promise<string | null> {
  const user = (username ?? "").trim().toLowerCase();
  if (!user) return null;
  return rehostImage(`${user}.jpg`, srcUrl);
}

/**
 * Generic mirror: download `srcUrl` (a signed Instagram CDN link) and store
 * it at `path` inside the public `avatars` bucket, returning the durable
 * public URL. Also used for POST thumbnails (`post-thumbs/{post_id}.jpg`).
 */
export async function rehostImage(
  path: string,
  srcUrl: string | null | undefined,
): Promise<string | null> {
  const src = (srcUrl ?? "").trim();
  if (!src || !path) return null;
  // Already durable (our bucket or any non-Instagram host) — nothing to do.
  if (!/fbcdn\.net|cdninstagram\.com/i.test(src)) return null;

  try {
    const res = await fetch(src, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 5_000_000) return null;

    const supabase = createServiceClient();
    const { error } = await (supabase as any).storage
      .from("avatars")
      .upload(path, buf, {
        contentType: res.headers.get("content-type") ?? "image/jpeg",
        upsert: true,
      });
    if (error) {
      console.warn(`[avatar-rehost] upload ${path}: ${error.message}`);
      return null;
    }
    const { data } = (supabase as any).storage
      .from("avatars")
      .getPublicUrl(path);
    return (data?.publicUrl as string | undefined) ?? null;
  } catch (e) {
    console.warn(
      `[avatar-rehost] ${path}: ${e instanceof Error ? e.name : "failed"}`,
    );
    return null;
  }
}
