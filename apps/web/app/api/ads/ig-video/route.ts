import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireActor } from "@/lib/auth";
import { fetchPostByShortcodeDeep } from "@/lib/meta-graph";

/**
 * Resolve an Instagram post's REAL media file for the Ad Preview popup.
 *
 * The public IG embed never plays Reels inline ("Watch on Instagram" links
 * out), so the popup asks Meta business_discovery for the post's signed CDN
 * media_url and plays it in a native <video autoplay>. READ-ONLY lookup.
 *
 * Historic ads reference posts months old, so this pages backward through the
 * creator's media (up to 10 × 90 posts, one Graph call per page, hit stops
 * the loop — typically 2-4 calls). Fail-soft to {media:null} → the popup
 * keeps the embed fallback. Doesn't resolve: personal (non business/creator)
 * accounts, posts beyond ~900 back, occasional reels without media_url.
 *
 * Cached 30 min per (username, shortcode) — the signed CDN URL is short-lived
 * but comfortably outlives that window.
 */
const resolveIgMedia = unstable_cache(
  async (handle: string, shortcode: string) => {
    const res = await fetchPostByShortcodeDeep(handle, shortcode);
    if (res.status !== "ok" || !res.node) return { media: null };
    return {
      media: {
        mediaType: res.node.mediaType,
        mediaUrl: res.node.mediaUrl,
        posterUrl: res.node.thumbnailUrl,
      },
    };
  },
  ["ad-status-ig-video"],
  { revalidate: 1800 },
);

export async function GET(request: Request) {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("username") ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  const shortcode = (searchParams.get("shortcode") ?? "").trim();
  if (!username || !/^[A-Za-z0-9_-]+$/.test(shortcode)) {
    return NextResponse.json({ media: null });
  }

  try {
    return NextResponse.json(await resolveIgMedia(username, shortcode));
  } catch {
    return NextResponse.json({ media: null });
  }
}
