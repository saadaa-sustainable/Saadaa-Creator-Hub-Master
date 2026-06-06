"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { ReachOutSchema } from "./schema";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";

export type ReachOutResult =
  | {
      ok: true;
      postId: string;
      postIdShort: string;
      postNumber: number;
      collabNumber: number;
      infId: string;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function extractUsernameFromInput(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/instagram\.com\/(?:@)?([A-Za-z0-9._]+)/i);
  return (urlMatch?.[1] ?? trimmed.replace(/^@/, "")).toLowerCase();
}

function todayIsoInIndia(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

function buildLegacyNomenclature(
  postId: string,
  username: string,
  contentType: string,
  date = todayIsoInIndia(),
): string {
  return `${postId}-${username}-${contentType}-${date}`;
}

/**
 * Server action — outbound reach-out submission.
 * Permission-gated, Zod-validated, delegated to submit_reachout Postgres RPC
 * for atomic POST_ID generation (replaces legacy LockService.waitLock).
 */
export async function submitReachOut(input: unknown): Promise<ReachOutResult> {
  // Permission gate — inbound + outbound share write surface; gate on either.
  const direction =
    (input as { reachoutDirection?: string })?.reachoutDirection === "inbound"
      ? "inbound"
      : "outbound";
  const actor = await assertPermission(
    direction === "inbound" ? "reachout_inbound" : "reachout_outbound",
  );

  const parsed = ReachOutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const v = parsed.data;
  const supabase = createServiceClient();

  const username = extractUsernameFromInput(v.instagramLink);
  if (!username) {
    return { ok: false, error: "Could not derive username from URL" };
  }

  // Shrishti error-handling: duplicate-creator guard. Block re-reaching the
  // same creator within the same campaign unless the prior collab was
  // Cancelled (per-campaign; RTO/Delivered/etc. still count as active).
  const { data: dupes } = await (supabase as any)
    .from("posts")
    .select("post_id, workflow_status")
    .ilike("username", username)
    .eq("campaign_id", v.campaignId)
    .limit(10);
  const activeDup = ((dupes ?? []) as Array<{ workflow_status: string | null }>).find(
    (p) => String(p.workflow_status ?? "") !== "Cancelled",
  );
  if (activeDup) {
    return {
      ok: false,
      error: "This creator is already in this campaign.",
      fieldErrors: { instagramLink: "Already reached out in this campaign" },
    };
  }

  const { data, error } = await (supabase as any)
    .rpc("submit_reachout", {
      p_username: username,
      p_inf_name: v.influencerName,
      p_instagram_link: v.instagramLink,
      p_followers: v.followers ?? null,
      p_gender: v.gender,
      p_state: null,
      p_email: null,
      p_campaign_id: v.campaignId,
      p_content_type: v.contentType,
      p_content_name: v.contentName || null,
      p_reachout_type: direction === "inbound" ? "Inbound" : "Outbound",
      p_reachout_direction: direction,
      p_reels: 0,
      p_static_posts: 0,
      p_stories: 0,
      p_ads_usage_rights: null,
      p_collab_type: null,
      p_commercial_amount: null,
      p_raw_dump: null,
      p_logged_by_email: actor.name || actor.email,
    })
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as {
    post_id: string;
    post_id_short: string;
    post_number: number;
    collab_number: number;
    inf_id: string;
  };

  await (supabase as any)
    .from("posts")
    .update({
      nomenclature: buildLegacyNomenclature(
        row.post_id,
        username,
        v.contentType,
      ),
    })
    .eq("post_id", row.post_id);

  // Persist enrichment fields directly on creators (not exposed via RPC args).
  // Best-effort — RPC succeeded already, so partial creator metadata is OK.
  if (row.inf_id) {
    await (supabase as any)
      .from("creators")
      .update({
        er: v.er ?? null,
        avg_likes: v.avgLikes ?? null,
        language: v.language ?? null,
        verification: v.verification === "Pending" ? null : v.verification,
      })
      .eq("inf_id", row.inf_id);
  }

  // Queue Instagram profile fetch for the 3-hr scrape-pending-apify cron.
  // Without this enqueue, a submit that bypasses the live IG lookup widget
  // (e.g. inbound paste-and-submit) leaves the creator with NULL followers /
  // verification / category forever. Insert-only — never demote a row that
  // already has scraped data back to 'pending'. The cron's stale-refresh
  // sweep handles refreshing 'auto' rows older than 3 hours.
  await (supabase as any)
    .from("instagram_cache")
    .upsert(
      { username, status: "pending", attempts: 0, scraped_at: null },
      { onConflict: "username", ignoreDuplicates: true },
    );

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.
  // See memory feedback_supabase_only_source_of_truth.md.

  revalidateTag("posts");
  revalidateTag("creators");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/onboarding");
  revalidatePath("/journey");

  return {
    ok: true,
    postId: row.post_id,
    postIdShort: row.post_id_short,
    postNumber: row.post_number,
    collabNumber: row.collab_number,
    infId: row.inf_id,
  };
}

// ----------------------------------------------------------------------------
// IG profile lookup — cache-first, service-role (RLS bypass).
// Legacy parity: Creator Data → Instagram Cache → mark for 3-hr Apify trigger.
// ----------------------------------------------------------------------------

export interface CreatorLookupHit {
  /**
   * creator         — row already in `creators`
   * instagram_cache — row in `instagram_cache` (populated by Apify 3-hr cron)
   * queued          — fresh handle, no cache hit yet; Apify 3-hr cron will fetch
   */
  source: "creator" | "instagram_cache" | "queued";
  username: string;
  inf_id?: string;
  inf_name: string | null;
  instagram_link: string | null;
  followers: number | null;
  gender: string | null;
  category: string | null;
  er: number | null;
  avg_likes: number | null;
  language: string | null;
  profile_pic: string | null;
  verification: "Yes" | "No" | null;
}

/** Derive Nano/Micro/Mid-tier/Macro/Mega from follower count (matches creators.category). */
function tierFor(followers: number | null | undefined): string | null {
  if (followers == null) return null;
  if (followers < 10_000) return "Nano";
  if (followers < 50_000) return "Micro";
  if (followers < 300_000) return "Mid tier";
  if (followers < 1_000_000) return "Macro";
  return "Mega";
}

function creatorLookupFromRow(
  username: string,
  creatorRow: Record<string, unknown>,
): CreatorLookupHit {
  const str = (k: string): string | null => {
    const v = creatorRow[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const num = (k: string): number | null => {
    const v = creatorRow[k];
    if (typeof v === "number") return v;
    if (v == null) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  const verRaw = str("verification");
  const followers = num("followers");

  return {
    source: "creator",
    username: String(creatorRow.username ?? username),
    inf_id:
      typeof creatorRow.inf_id === "string" ? creatorRow.inf_id : undefined,
    inf_name: str("inf_name") ?? str("full_name"),
    instagram_link:
      str("instagram_link") ?? `https://www.instagram.com/${username}/`,
    followers,
    gender: str("gender"),
    category: str("category") ?? tierFor(followers),
    er: num("er") ?? num("er_percent"),
    avg_likes: num("avg_likes"),
    language: str("language"),
    profile_pic: str("profile_pic"),
    verification:
      verRaw === "Yes" || verRaw === "Verified"
        ? "Yes"
        : verRaw === "No" || verRaw === "Non-Verified"
          ? "No"
          : null,
  };
}

/**
 * Cache-first lookup using service-role (bypasses RLS — already gated by
 * assertPermission). Mirrors legacy `fetchInstagramDataForReachOut`:
 *   1. creators (existing relationship) → return
 *   2. instagram_cache (Apify 3-hr sync) → return
 *   3. otherwise queue: insert empty cache row with ig_status='pending'
 *      so the next 3-hr trigger picks it up.
 */
export async function lookupCreator(
  usernameOrUrl: string,
  permission: "reachout_outbound" | "reachout_inbound" = "reachout_outbound",
): Promise<CreatorLookupHit | null> {
  await assertPermission(permission);
  const username = extractUsernameFromInput(usernameOrUrl);
  if (!username) return null;

  const supabase = createServiceClient();

  // 1. creators — dataset-first. Keep `select("*")` so live column drift
  //    cannot make an existing creator fall through to instagram_cache.
  const { data: creatorRow, error: creatorErr } = await supabase
    .from("creators")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (creatorErr) {
    console.error("[lookupCreator] creators select error:", creatorErr.message);
  }

  if (creatorRow) {
    return creatorLookupFromRow(
      username,
      creatorRow as Record<string, unknown>,
    );
  }

  // 2. instagram_cache — supports both flat columns (legacy mirror) and
  //    profile_data jsonb (KB-spec). Read everything, prefer flat values.
  const { data: cachedAny } = await supabase
    .from("instagram_cache")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  const cached = cachedAny as Record<string, unknown> | null;

  if (cached) {
    // jsonb fallback — actual live column is `raw_json` (Apify response);
    // KB-spec also mentioned `profile_data` and `ig_data`. Read whichever exists.
    const p = (cached.raw_json ??
      cached.profile_data ??
      cached.ig_data ??
      {}) as Record<string, unknown>;
    const num = (...keys: string[]): number | null => {
      for (const k of keys) {
        const v = cached[k] ?? p[k];
        if (v == null) continue;
        if (typeof v === "number") return v;
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
      }
      return null;
    };
    const str = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = cached[k] ?? p[k];
        if (typeof v === "string" && v.length > 0) return v;
      }
      return null;
    };
    const bool = (...keys: string[]): boolean | null => {
      for (const k of keys) {
        const v = cached[k] ?? p[k];
        if (v === true || v === "Yes" || v === "true" || v === 1 || v === "1")
          return true;
        if (v === false || v === "No" || v === "false" || v === 0 || v === "0")
          return false;
      }
      return null;
    };

    const followers = num("followers", "followersCount", "followers_count");
    const profilePic = str(
      "profile_pic",
      "pic",
      "profilePicUrl",
      "profile_pic_url",
      "profilePicUrlHD",
    );
    const cachedStatus =
      typeof cached.status === "string"
        ? (cached.status as string).toLowerCase()
        : "";
    const name = str("name", "fullName", "inf_name", "full_name");

    const hasMeaningfulData =
      followers != null || profilePic != null || name != null;

    if (hasMeaningfulData && cachedStatus !== "pending") {
      const verified = bool("is_verified", "verified", "isVerified");
      return {
        source: "instagram_cache",
        username,
        inf_name: name,
        instagram_link:
          str("insta_link", "instagram_link", "url") ??
          `https://www.instagram.com/${username}/`,
        followers,
        gender: null,
        category: tierFor(followers),
        er: num("er", "engagementRate", "engagement_rate"),
        avg_likes: num(
          "avg_likes",
          "averageLikes",
          "avgLikes",
          "average_likes",
        ),
        language: null,
        profile_pic: profilePic,
        verification:
          verified === true ? "Yes" : verified === false ? "No" : null,
      };
    }
  }

  // 3. QUEUE — fresh handle, no cache hit yet. Upsert a pending row; the
  //    `scrape-pending-apify` Supabase Edge Function picks these up on a
  //    3-hour cron, calls Apify, and writes the result back. If Apify itself
  //    exhausts retries, that Edge Function logs an `apify_fail` entry to
  //    `system_errors`, which surfaces in the Error Portal.
  await (supabase as any)
    .from("instagram_cache")
    .upsert(
      { username, status: "pending", scraped_at: null },
      { onConflict: "username" },
    );

  return {
    source: "queued",
    username,
    inf_name: null,
    instagram_link: `https://www.instagram.com/${username}/`,
    followers: null,
    gender: null,
    category: null,
    er: null,
    avg_likes: null,
    language: null,
    profile_pic: null,
    verification: null,
  };
}

export async function lookupCreatorsFromDataset(
  usernameOrUrls: string[],
  permission: "reachout_outbound" | "reachout_inbound" = "reachout_outbound",
): Promise<Record<string, CreatorLookupHit>> {
  await assertPermission(permission);

  const usernames = Array.from(
    new Set(
      usernameOrUrls
        .map(extractUsernameFromInput)
        .filter((username) => username),
    ),
  );

  if (usernames.length === 0) return {};

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .in("username", usernames);

  if (error) {
    console.error(
      "[lookupCreatorsFromDataset] creators select error:",
      error.message,
    );
    return {};
  }

  const hits: Record<string, CreatorLookupHit> = {};
  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const username =
      typeof record.username === "string" ? record.username.toLowerCase() : "";
    if (!username) continue;
    hits[username] = creatorLookupFromRow(username, record);
  }

  return hits;
}
