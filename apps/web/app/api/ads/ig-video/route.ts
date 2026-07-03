import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { fetchPostByShortcodeDeep } from "@/lib/meta-graph";
import { checkMetaGate, recordMetaUsage } from "@/lib/meta-rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Resolve an Instagram post's REAL media file for the Ad Preview popup.
 *
 * The public IG embed never plays Reels inline ("Watch on Instagram" links
 * out), so the popup asks Meta business_discovery for the post's signed CDN
 * media_url and plays it in a native <video autoplay>. READ-ONLY lookup.
 *
 * Speed: results persist in `ig_media_cache` — a repeat open anywhere is ONE
 * DB read. A cold resolve pages backward through the creator's media (90 per
 * Graph call, hit stops the loop, and the post's known date early-exits a
 * hopeless scan). Fail-soft to {media:null} → the popup keeps the embed
 * fallback. Doesn't resolve: personal (non business/creator) accounts, posts
 * beyond ~900 back, occasional reels without media_url.
 *
 * TTLs: ok rows re-resolve after 12h (signed CDN URLs expire in days —
 * the client also falls back to the embed on playback error); notfound rows
 * retry after 24h.
 */
const OK_TTL_MS = 12 * 3600_000;
const MISS_TTL_MS = 24 * 3600_000;

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
  const postDate = (searchParams.get("postDate") ?? "").trim() || null;
  if (!username || !/^[A-Za-z0-9_-]+$/.test(shortcode)) {
    return NextResponse.json({ media: null });
  }

  const supabase = createServiceClient();

  let staleOk: { mediaType: string | null; mediaUrl: string | null; posterUrl: string | null } | null =
    null;
  try {
    const { data: cached } = await (supabase as any)
      .from("ig_media_cache")
      .select("status, media_type, media_url, poster_url, resolved_at")
      .eq("shortcode", shortcode)
      .maybeSingle();
    if (cached) {
      const age = Date.now() - new Date(cached.resolved_at).getTime();
      const fresh =
        cached.status === "ok" ? age < OK_TTL_MS : age < MISS_TTL_MS;
      const media =
        cached.status === "ok"
          ? {
              mediaType: cached.media_type,
              mediaUrl: cached.media_url,
              posterUrl: cached.poster_url,
            }
          : null;
      if (fresh) return NextResponse.json({ media });
      if (media) staleOk = media;
    }
  } catch {
    // cache read is best-effort — fall through to a live resolve
  }

  // Shared adaptive gate (same one Reach Out's Meta fetch uses) — popup
  // opens must never starve the rest of the app's Graph budget. While
  // cooling down, serve the stale URL if we have one (the client falls back
  // to the embed if it has expired) and DON'T cache a miss.
  try {
    const gate = await checkMetaGate();
    if (gate.coolingDown) return NextResponse.json({ media: staleOk });
  } catch {
    // gate read failed — proceed, the deep fetch has its own usage bail
  }

  try {
    const res = await fetchPostByShortcodeDeep(
      username,
      shortcode,
      10,
      postDate,
    );
    recordMetaUsage(res.callsMade ?? 1, res.usagePct ?? 0).catch(() => {});
    const ok = res.status === "ok" && !!res.node;
    // Transient errors (rate limit, network) keep the old row and serve the
    // stale URL; only a definitive "notfound" overwrites a previous hit.
    if (ok || res.status === "notfound") {
      await (supabase as any)
        .from("ig_media_cache")
        .upsert({
          shortcode,
          username,
          status: ok ? "ok" : "notfound",
          media_type: ok ? res.node!.mediaType : null,
          media_url: ok ? res.node!.mediaUrl : null,
          poster_url: ok ? res.node!.thumbnailUrl : null,
          resolved_at: new Date().toISOString(),
        })
        .then(
          () => undefined,
          () => undefined,
        );
    }
    return NextResponse.json({
      media: ok
        ? {
            mediaType: res.node!.mediaType,
            mediaUrl: res.node!.mediaUrl,
            posterUrl: res.node!.thumbnailUrl,
          }
        : res.status === "error"
          ? staleOk
          : null,
    });
  } catch {
    return NextResponse.json({ media: staleOk });
  }
}
