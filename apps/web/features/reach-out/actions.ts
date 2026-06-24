"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { ReachOutSchema } from "./schema";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { stampTestRows } from "@/features/settings/actions";
import {
  fetchBusinessDiscovery,
  fetchBusinessDiscoveryBatch,
  fetchIgVerified,
  META_BATCH_SIZE,
  type MetaDiscoveryResult,
} from "@/lib/meta-graph";
import { checkMetaGate, recordMetaUsage } from "@/lib/meta-rate-limit";
import { logSystemError } from "@/lib/system-errors";
import { isVoidedStatus } from "@/lib/workflow";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
} from "@/lib/notifications";

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

export type ReachOutEditResult =
  | { ok: true; postId: string; message: string }
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

  // New rule (2026-06-24): Reach Out is for NEW creators only. An existing
  // creator starts a repeat collab (C2+) via Onboarding, not reach-out — so
  // C1 is only ever created at reach-out. Block if the creator already exists.
  const { data: existingCreator } = await (supabase as any)
    .from("creators")
    .select("inf_id")
    .ilike("username", username)
    .maybeSingle();
  if (existingCreator) {
    return {
      ok: false,
      error:
        "Existing creator — reach-out is for new creators only. Use Onboarding to start a repeat collab (C2+).",
      fieldErrors: { instagramLink: "Existing creator — use Onboarding" },
    };
  }

  // Shrishti error-handling: duplicate-creator guard. Block re-reaching the
  // same creator within the same campaign unless the prior collab was
  // Cancelled OR voided/Offboarded (per-campaign; RTO/Delivered/etc. still
  // count as active). Voiding a collab frees the slot — we're done with that
  // collab, so the creator can be reached out fresh for the campaign.
  const { data: dupes } = await (supabase as any)
    .from("posts")
    .select("post_id, workflow_status")
    .ilike("username", username)
    .eq("campaign_id", v.campaignId)
    .limit(10);
  const activeDup = ((dupes ?? []) as Array<{ workflow_status: string | null }>).find(
    (p) =>
      String(p.workflow_status ?? "") !== "Cancelled" &&
      !isVoidedStatus(p.workflow_status),
  );
  if (activeDup) {
    return {
      ok: false,
      error: "This creator is already in this campaign.",
      fieldErrors: { instagramLink: "Already reached out in this campaign" },
    };
  }

  // Reach-out is UNLIMITED per campaign (2026-06-10): the creator cap now applies
  // at ONBOARDING, not reach-out (see submitOnboarding). A campaign can collect
  // any number of reach-outs; only `cap` of them can be onboarded, and the
  // un-onboarded leftovers are voided (→ Cancelled) when the campaign closes.
  // We still reject reach-outs to a CLOSED campaign.
  const { data: campRow } = await (supabase as any)
    .from("campaigns")
    .select("status")
    .eq("campaign_id", v.campaignId)
    .maybeSingle();
  if (String(campRow?.status ?? "").trim().toLowerCase() === "closed") {
    return {
      ok: false,
      error: `Campaign ${v.campaignId} is closed. Reopen it (Campaign Owner / Global Admin) to add creators.`,
      fieldErrors: { campaignId: "Campaign is closed" },
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
    collab_id: string;
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
        // Legacy IG numeric profile id from the Meta/historic lookup — lets a
        // returning handle be recognised even if it changes username later.
        ...(v.profileId ? { profile_id: v.profileId } : {}),
      })
      .eq("inf_id", row.inf_id);
  }

  // Test Mode: stamp the new creator (creator scope) + reach-out post (collab
  // scope) when those scopes are on. No-op when Test Mode is off.
  await stampTestRows([
    { scope: "creator", table: "creators", idColumn: "inf_id", ids: row.inf_id ? [row.inf_id] : [] },
    { scope: "collab", table: "posts", idColumn: "post_id", ids: [row.post_id] },
  ]);

  // (Apify enqueue removed 2026-06-24 — Reach Out now fetches live via Meta
  // business_discovery on the Fetch click. See REVERT.md to restore.)

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.
  // See memory feedback_supabase_only_source_of_truth.md.

  // ── Submitter confirmation (Wave 7.x) ───────────────────────────────────
  // Email the logged-in actor that their reach-out was logged. Fire-and-forget
  // via after() so the form stays fast; best-effort, never blocks/throws.
  const confirmPostId = row.post_id;
  const confirmCollabId =
    row.collab_id ??
    (row.inf_id ? `${row.inf_id}-C${row.collab_number}` : confirmPostId);
  after(async () => {
    let campaignLabel = v.campaignId;
    try {
      const { data: camp } = await (supabase as any)
        .from("campaigns")
        .select("campaign_name")
        .eq("campaign_id", v.campaignId)
        .maybeSingle();
      const name = (camp?.campaign_name as string | null) ?? null;
      if (name) campaignLabel = `${v.campaignId} — ${name}`;
    } catch {
      // best-effort — fall back to the bare campaign id.
    }
    await notifyActorConfirmation({
      actor,
      type: NOTIFICATION_TYPES.REACHOUT_CONFIRMATION,
      subject: `Reach-out logged — @${username} added to ${v.campaignId}`,
      title: "Reach-out logged",
      subtitle: `COLLAB ID: ${confirmCollabId}`,
      summaryLines: [
        `@${username} has been added to your campaign as a ${
          direction === "inbound" ? "inbound" : "outbound"
        } reach-out.`,
      ],
      rows: [
        { label: "Creator", value: `@${username}` },
        { label: "Creator Name", value: v.influencerName },
        { label: "Instagram Link", value: v.instagramLink },
        { label: "Campaign", value: campaignLabel },
        { label: "Followers", value: v.followers ?? null },
        { label: "Gender", value: v.gender },
        { label: "Verification", value: v.verification },
        { label: "Content Type", value: v.contentType },
        { label: "Content Name", value: v.contentName || null },
        { label: "Language", value: v.language },
        { label: "Engagement Rate", value: v.er != null ? `${v.er}%` : null },
        { label: "Avg. Likes", value: v.avgLikes ?? null },
        { label: "Collab ID", value: confirmCollabId },
        { label: "Post ID (deliverable)", value: confirmPostId },
      ],
      postId: confirmPostId,
      collabId: confirmCollabId,
    });
  });

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
// Edit reach-out — DECISION D7 (applied).
//
// Only CONTENT fields are editable: contentType (persisted to posts.content_type)
// and contentName (legacy nomenclature segment — not a posts column, so it only
// affects the rebuilt nomenclature string).
//
// Creator metadata (followers / verification / inf_id / username) is FROZEN once
// the collab has progressed past "Reach Out". An edit that tries to change any
// frozen field after that point is REJECTED. While still in "Reach Out", those
// fields live on `creators`, not `posts`, so they are not edited here either —
// re-run the IG lookup / onboarding flow to refresh creator metadata.
//
// TODO(UI wiring): no standalone "existing reach-outs" list exists yet — reach-
// out posts surface inside the Onboarding board and Journey timeline. When an
// edit affordance is added there, render an inline content-type <select>
// (CONTENT_CODES) on the card and call editReachOut(post.post_id, { contentType,
// contentName }). The action already enforces D7 freezing, so the UI only needs
// to disable the control (or show the lock reason) when workflow_status leaves
// "Reach Out". Deferred here: threading an editor into the kanban card is a
// larger board change with no obvious single home, out of scope for this wave.
// ----------------------------------------------------------------------------

const ReachOutEditSchema = z.object({
  contentType: z.string().trim().min(1, "Content type required"),
  contentName: z.string().trim().optional().default(""),
  // Frozen creator metadata — accepted so callers can pass the full form, but
  // only used to DETECT an attempted change vs. the stored row. Never written.
  followers: z.coerce.number().int().nonnegative().optional(),
  verification: z.enum(["Verified", "Non-Verified", "Pending"]).optional(),
  influencerName: z.string().trim().optional(),
  username: z.string().trim().optional(),
});

export async function editReachOut(
  postId: string,
  input: unknown,
): Promise<ReachOutEditResult> {
  await assertPermission("reachout_outbound");

  const id = (postId ?? "").trim();
  if (!id) return { ok: false, error: "Post ID is required." };

  const parsed = ReachOutEditSchema.safeParse(input);
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

  const { data: post, error: postErr } = await (supabase as any)
    .from("posts")
    .select("post_id, username, inf_id, content_type, workflow_status")
    .eq("post_id", id)
    .maybeSingle();
  if (postErr) return { ok: false, error: postErr.message };
  if (!post) return { ok: false, error: `Reach-out ${id} not found.` };

  const stage = String(post.workflow_status ?? "");
  const isFrozen = stage !== "" && stage !== "Reach Out";

  // D7 — reject attempts to mutate frozen creator metadata past Reach Out.
  if (isFrozen) {
    const frozenViolations: string[] = [];
    if (
      v.username != null &&
      v.username.toLowerCase() !==
        String(post.username ?? "").toLowerCase()
    ) {
      frozenViolations.push("username");
    }
    // followers / verification / influencerName live on `creators` and are
    // surfaced read-only; any inbound value differing from the frozen snapshot
    // is a violation. We only have username/inf_id on the post row, so compare
    // the creator-owned fields against the live creators row.
    if (
      v.followers != null ||
      v.verification != null ||
      (v.influencerName != null && v.influencerName !== "")
    ) {
      const { data: creator } = await (supabase as any)
        .from("creators")
        .select("followers, verification, inf_name")
        .eq("inf_id", post.inf_id)
        .maybeSingle();
      const curVer =
        creator?.verification === "Yes"
          ? "Verified"
          : creator?.verification === "No"
            ? "Non-Verified"
            : null;
      if (v.followers != null && creator && v.followers !== creator.followers) {
        frozenViolations.push("followers");
      }
      if (
        v.verification != null &&
        v.verification !== "Pending" &&
        curVer != null &&
        v.verification !== curVer
      ) {
        frozenViolations.push("verification");
      }
      if (
        v.influencerName != null &&
        v.influencerName !== "" &&
        creator?.inf_name != null &&
        v.influencerName !== creator.inf_name
      ) {
        frozenViolations.push("name");
      }
    }
    if (frozenViolations.length > 0) {
      return {
        ok: false,
        error: `Creator details are locked once a collab leaves Reach Out. Cannot edit: ${frozenViolations.join(", ")}.`,
      };
    }
  }

  // Persist content edit. content_name has no posts column; it only feeds the
  // legacy nomenclature string, which we rebuild to stay consistent.
  const username = String(post.username ?? "");
  const { error: updateErr } = await (supabase as any)
    .from("posts")
    .update({
      content_type: v.contentType,
      nomenclature: buildLegacyNomenclature(id, username, v.contentType),
      updated_at: new Date().toISOString(),
    })
    .eq("post_id", id);
  if (updateErr) return { ok: false, error: updateErr.message };

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  revalidateTag("posts");
  revalidatePath("/reach-out/outbound");
  revalidatePath("/onboarding");
  revalidatePath("/journey");

  return {
    ok: true,
    postId: id,
    message: `Reach-out ${id} updated.`,
  };
}

// ----------------------------------------------------------------------------
// IG profile lookup — cache-first, service-role (RLS bypass).
// Legacy parity: Creator Data → Instagram Cache → mark for 3-hr Apify trigger.
// ----------------------------------------------------------------------------

export interface CreatorLookupHit {
  /**
   * creator     — row already in `creators` (existing relationship → submit blocked,
   *               guided to Onboarding for a repeat collab)
   * meta        — live Meta business_discovery hit (instant; the normal new-creator path)
   * historic    — Meta failed but we have the handle in ig_data_historic (cached metrics)
   * deactivated — Meta says "Cannot find User" (personal/dead) and no historic data;
   *               not fetchable → label deactivated, manual entry still allowed
   * error       — transient Meta failure (rate-block/token/network) with no historic
   *               fallback; let the user retry or enter manually
   */
  source: "creator" | "meta" | "historic" | "deactivated" | "error";
  username: string;
  inf_id?: string;
  /** historic_creator (from the archive) vs new_creator (added in the new project). */
  creator_type?: "historic_creator" | "new_creator" | null;
  /** Legacy IG numeric profile id (Meta `ig_id` / historic). Persisted on submit. */
  profile_id?: string | null;
  /** Historic legacy SIF for this handle (from cleaned_data), if any. */
  historic_sif?: string | null;
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
  /** Optional human note for non-data tiers (deactivated/error). */
  note?: string | null;
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

  const ctypeRaw = str("creator_type");
  return {
    source: "creator",
    username: String(creatorRow.username ?? username),
    inf_id:
      typeof creatorRow.inf_id === "string" ? creatorRow.inf_id : undefined,
    creator_type:
      ctypeRaw === "historic_creator" || ctypeRaw === "new_creator"
        ? ctypeRaw
        : null,
    profile_id: str("profile_id"),
    historic_sif: str("historic_sif"),
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
 * Surface a non-fetchable Reach Out lookup in the Error Portal, split by cause so
 * the team can triage each separately (distinct KPIs in the portal):
 *   - "error"       → the Meta API itself failed (rate-limit / network / token)
 *                     → type `meta_fetch_failed`
 *   - "deactivated" → the API worked but the profile is unavailable (personal /
 *                     dead / deactivated) → type `meta_profile_unavailable`
 * Deduped per (type, handle) by logSystemError. Fire-and-forget via after().
 */
function reportLookupIssue(hit: CreatorLookupHit): void {
  if (hit.source !== "error" && hit.source !== "deactivated") return;
  const type =
    hit.source === "deactivated"
      ? "meta_profile_unavailable"
      : "meta_fetch_failed";
  const message =
    hit.note ??
    (hit.source === "deactivated"
      ? "Instagram profile unavailable (private, personal, or deactivated)."
      : "Meta live fetch failed.");
  after(() =>
    logSystemError({
      type,
      key: hit.username,
      message,
      source: "reach_out",
    }),
  );
}

/**
 * Persist a fetch result into instagram_cache (the "instagram fetch" record + the
 * app's avatar fallback). Only meta/historic hits (rows that carry real data) are
 * written — a transient error / not-found must NEVER overwrite a good cached row
 * with nulls. Upsert by username; fire-and-forget (after()) so it never adds to
 * the fetch latency.
 */
function persistFetches(
  supabase: ReturnType<typeof createServiceClient>,
  hits: CreatorLookupHit[],
): void {
  const rows = hits
    .filter((h) => h.source === "meta" || h.source === "historic")
    .map((h) => ({
      username: h.username,
      followers: h.followers,
      er: h.er,
      avg_likes: h.avg_likes,
      profile_pic: h.profile_pic,
      profile_id: h.profile_id ?? null,
      is_verified:
        h.verification === "Yes"
          ? true
          : h.verification === "No"
            ? false
            : null,
      status: h.source,
      scraped_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  after(async () => {
    try {
      await (supabase as any)
        .from("instagram_cache")
        .upsert(rows, { onConflict: "username" });
    } catch (e) {
      console.error("[persistFetches]", e);
    }
  });
}

interface HistRow {
  profile_id: string | null;
  followers: number | null;
  avg_likes: number | null;
  image_url: string | null;
}
interface CleanRow {
  sif_id: string | null;
  gender: string | null;
  profile_id: string | null;
  profile_status: string | null;
}

/**
 * Build a non-creator lookup hit from a Meta result + historic fallback rows.
 * Shared by the single (outbound) and batch (inbound) lookups so both tier the
 * same way: meta → historic → deactivated (Meta not-found) → error (transient).
 * Does NOT touch the creators table — the caller handles existing-creator checks.
 */
function assembleNonCreatorHit(
  username: string,
  link: string,
  meta: MetaDiscoveryResult,
  hist: HistRow | null,
  clean: CleanRow | null,
): CreatorLookupHit {
  const historicSif = clean?.sif_id ?? null;
  const historicGender = clean?.gender ?? null;

  if (meta.status === "ok" && meta.node) {
    const n = meta.node;
    const followers = n.followers ?? hist?.followers ?? null;
    return {
      source: "meta",
      username,
      profile_id: n.ig_id ?? hist?.profile_id ?? clean?.profile_id ?? null,
      historic_sif: historicSif,
      inf_name: n.name,
      instagram_link: link,
      followers,
      gender: historicGender,
      category: tierFor(followers),
      er: n.er,
      avg_likes: n.avg_likes ?? hist?.avg_likes ?? null,
      language: null,
      profile_pic: n.profile_pic ?? hist?.image_url ?? null,
      verification: null,
    };
  }

  // Meta missed but we have archived data → serve cached legacy metrics.
  if (hist?.profile_id || hist?.followers != null || hist?.image_url) {
    return {
      source: "historic",
      username,
      profile_id: hist.profile_id ?? clean?.profile_id ?? null,
      historic_sif: historicSif,
      inf_name: null,
      instagram_link: link,
      followers: hist.followers ?? null,
      gender: historicGender,
      category: tierFor(hist.followers ?? null),
      er: null,
      avg_likes: hist.avg_likes ?? null,
      language: null,
      profile_pic: hist.image_url ?? null,
      verification: null,
      note:
        meta.status === "notfound"
          ? "Live fetch unavailable (private/personal account) — showing last known data."
          : "Live fetch failed — showing last known data. You can retry.",
    };
  }

  // No data anywhere. Meta not-found ⇒ deactivated (manual entry ok). Transient
  // error ⇒ error (never mark a possibly-live account deactivated on a hiccup).
  if (meta.status === "notfound") {
    return {
      source: "deactivated",
      username,
      profile_id: clean?.profile_id ?? null,
      historic_sif: historicSif,
      inf_name: null,
      instagram_link: link,
      followers: null,
      gender: historicGender,
      category: null,
      er: null,
      avg_likes: null,
      language: null,
      profile_pic: null,
      verification: null,
      note: "Couldn’t fetch this profile (private, personal, or deactivated). Enter details manually to continue.",
    };
  }

  return {
    source: "error",
    username,
    profile_id: clean?.profile_id ?? null,
    historic_sif: historicSif,
    inf_name: null,
    instagram_link: link,
    followers: null,
    gender: historicGender,
    category: null,
    er: null,
    avg_likes: null,
    language: null,
    profile_pic: null,
    verification: null,
    note: meta.error
      ? `Live fetch failed (${meta.error}). Retry, or enter details manually.`
      : "Live fetch failed. Retry, or enter details manually.",
  };
}

/**
 * Cache-first lookup using service-role (bypasses RLS — already gated by
 * assertPermission). INSTANT — no Apify wait:
 *   1. creators (existing relationship) → return source "creator" (submit blocked)
 *   2. Meta business_discovery (live) → source "meta" (+ historic/cleaned_data enrich)
 *   3. Meta missed but archived → source "historic" (cached legacy metrics)
 *   4. Meta "Cannot find User" + no archive → source "deactivated" (manual entry ok);
 *      transient Meta error + no archive → source "error" (retry / manual).
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

  // Historic fallback data for this handle (used by every tier below). One read
  // each: ig_data_historic (legacy profile_id + cached followers/avg_likes/pic)
  // and cleaned_data (the legacy SIF, skipping SIF_ERROR audit markers + gender).
  const link = `https://www.instagram.com/${username}/`;
  const [{ data: histRow }, { data: cleanRow }] = await Promise.all([
    supabase
      .from("ig_data_historic")
      .select("profile_id, followers, avg_likes, image_url")
      .eq("username", username)
      .maybeSingle(),
    supabase
      .from("cleaned_data")
      .select("sif_id, gender, profile_id, profile_status")
      .eq("username", username)
      .neq("sif_id", "SIF_ERROR")
      .limit(1)
      .maybeSingle(),
  ]);
  const hist = histRow as {
    profile_id: string | null;
    followers: number | null;
    avg_likes: number | null;
    image_url: string | null;
  } | null;
  const clean = cleanRow as {
    sif_id: string | null;
    gender: string | null;
    profile_id: string | null;
    profile_status: string | null;
  } | null;
  const historicSif = clean?.sif_id ?? null;
  const historicGender = clean?.gender ?? null;

  // 2. Meta business_discovery — INSTANT live fetch (replaces the Apify 3-hr path),
  //    gated by the rolling batch-of-50 cooldown. When cooling down we DON'T hit
  //    Meta — historic / deactivated / error tiers cover the request.
  const gate = await checkMetaGate();
  let meta: MetaDiscoveryResult;
  // Best-effort verified-badge crawl (Meta can't return it) — run IN PARALLEL with
  // the Meta fetch so it adds no latency. Single-fetch only (never in bulk). null
  // when blocked/unknown → verification stays manual.
  let igVerified: boolean | null = null;
  if (gate.coolingDown) {
    meta = {
      status: "error",
      error: `rate-limit cooldown — retry in ${gate.retryAfterSec}s`,
    };
  } else {
    const [m, v] = await Promise.all([
      fetchBusinessDiscovery(username),
      fetchIgVerified(username),
    ]);
    meta = m;
    igVerified = v;
    await recordMetaUsage(1, meta.usagePct ?? 0);
  }

  // Returning creator who CHANGED their handle: username missed tier 1, but the
  // legacy profile_id matches → treat as an existing creator (submit blocked).
  if (meta.status === "ok" && meta.node?.ig_id) {
    const { data: byPid } = await supabase
      .from("creators")
      .select("*")
      .eq("profile_id", meta.node.ig_id)
      .maybeSingle();
    if (byPid) {
      const r = byPid as Record<string, unknown>;
      return creatorLookupFromRow(
        typeof r.username === "string" ? r.username : username,
        r,
      );
    }
  }

  const hit = assembleNonCreatorHit(username, link, meta, hist, clean);
  // Apply the best-effort verified badge to a live Meta hit (manual otherwise).
  if (hit.source === "meta" && igVerified !== null) {
    hit.verification = igVerified ? "Yes" : "No";
  }
  // Only report genuine fetch attempts — a cooldown defer isn't a real failure.
  if (!gate.coolingDown) reportLookupIssue(hit);
  persistFetches(supabase, [hit]);
  return hit;
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

export interface BatchLookupResult {
  /** keyed by lowercased handle. */
  hits: Record<string, CreatorLookupHit>;
  /** the rate gate opened a cooldown (or was already cooling). */
  coolingDown: boolean;
  retryAfterSec: number;
  /** how many handles were actually sent to Meta in this call. */
  fetched: number;
}

/**
 * Bulk Reach Out lookup — ONE Meta Batch POST for up to 50 handles (the inbound
 * Fetch-all button). Mirrors ig_fetching.py's batch model: each call consumes one
 * batch worth of the rolling rate window, then the gate may open a cooldown.
 *
 * Per handle, tiers identically to the single lookupCreator:
 *   creators (by username, then by Meta profile_id) → meta → historic → deactivated/error.
 * The caller (inbound form) should pass at most META_BATCH_SIZE (50) handles; any
 * beyond 50 are NOT Meta-fetched this call (they fall to historic/error) so the
 * form can chunk + respect the cooldown between chunks.
 */
export async function lookupCreatorsBatch(
  usernameOrUrls: string[],
  permission: "reachout_outbound" | "reachout_inbound" = "reachout_inbound",
): Promise<BatchLookupResult> {
  await assertPermission(permission);

  const handles = Array.from(
    new Set(usernameOrUrls.map(extractUsernameFromInput).filter(Boolean)),
  );
  if (handles.length === 0) {
    return { hits: {}, coolingDown: false, retryAfterSec: 0, fetched: 0 };
  }

  const supabase = createServiceClient();
  const hits: Record<string, CreatorLookupHit> = {};

  // Tier 1 — existing creators by username (one query).
  const { data: creatorRows } = await supabase
    .from("creators")
    .select("*")
    .in("username", handles);
  const creatorByUser = new Map<string, Record<string, unknown>>();
  for (const row of (creatorRows ?? []) as Record<string, unknown>[]) {
    const u =
      typeof row.username === "string" ? row.username.toLowerCase() : "";
    if (u) creatorByUser.set(u, row);
  }
  for (const h of handles) {
    const row = creatorByUser.get(h);
    if (row) hits[h] = creatorLookupFromRow(h, row);
  }

  const remaining = handles.filter((h) => !creatorByUser.has(h));
  if (remaining.length === 0) {
    return { hits, coolingDown: false, retryAfterSec: 0, fetched: 0 };
  }

  // Historic fallback rows (bulk) for the remaining handles.
  const [{ data: histRows }, { data: cleanRows }] = await Promise.all([
    supabase
      .from("ig_data_historic")
      .select("username, profile_id, followers, avg_likes, image_url")
      .in("username", remaining),
    supabase
      .from("cleaned_data")
      .select("username, sif_id, gender, profile_id, profile_status")
      .neq("sif_id", "SIF_ERROR")
      .in("username", remaining),
  ]);
  const histByUser = new Map<string, HistRow>();
  for (const r of (histRows ?? []) as (HistRow & { username: string })[]) {
    const u = (r.username ?? "").toLowerCase();
    if (u && !histByUser.has(u)) histByUser.set(u, r);
  }
  const cleanByUser = new Map<string, CleanRow>();
  for (const r of (cleanRows ?? []) as (CleanRow & { username: string })[]) {
    const u = (r.username ?? "").toLowerCase();
    if (u && !cleanByUser.has(u)) cleanByUser.set(u, r);
  }

  // Tier 2 — ONE Meta batch (≤50), gated by the rolling cooldown.
  const gate = await checkMetaGate();
  const metaByUser = new Map<string, MetaDiscoveryResult>();
  let coolingDown = gate.coolingDown;
  let retryAfterSec = gate.retryAfterSec;
  let fetched = 0;
  if (!gate.coolingDown) {
    const batch = remaining.slice(0, META_BATCH_SIZE);
    const { results, usagePct } = await fetchBusinessDiscoveryBatch(batch);
    batch.forEach((h, i) => metaByUser.set(h, results[i]));
    fetched = batch.length;
    const after = await recordMetaUsage(batch.length, usagePct);
    coolingDown = after.coolingDown;
    retryAfterSec = after.retryAfterSec;
  }

  // Changed-handle existing-creator check: bulk creators by Meta profile_id.
  const pids = Array.from(metaByUser.values())
    .map((m) => m.node?.ig_id)
    .filter((p): p is string => Boolean(p));
  const creatorByPid = new Map<string, Record<string, unknown>>();
  if (pids.length > 0) {
    const { data: pidRows } = await supabase
      .from("creators")
      .select("*")
      .in("profile_id", pids);
    for (const row of (pidRows ?? []) as Record<string, unknown>[]) {
      const p = row.profile_id;
      if (typeof p === "string") creatorByPid.set(p, row);
    }
  }

  for (const h of remaining) {
    if (hits[h]) continue;
    const meta = metaByUser.get(h);
    if (meta?.status === "ok" && meta.node?.ig_id) {
      const row = creatorByPid.get(meta.node.ig_id);
      if (row) {
        hits[h] = creatorLookupFromRow(
          typeof row.username === "string" ? row.username : h,
          row,
        );
        continue;
      }
    }
    const link = `https://www.instagram.com/${h}/`;
    const effMeta: MetaDiscoveryResult =
      meta ??
      (gate.coolingDown
        ? {
            status: "error",
            error: `rate-limit cooldown — retry in ${gate.retryAfterSec}s`,
          }
        : { status: "error", error: "not fetched in this batch (over 50)" });
    hits[h] = assembleNonCreatorHit(
      h,
      link,
      effMeta,
      histByUser.get(h) ?? null,
      cleanByUser.get(h) ?? null,
    );
    // Only report handles actually sent to Meta this batch (skip deferred >50
    // and cooldown cases — those aren't real failures).
    if (meta) reportLookupIssue(hits[h]);
  }

  persistFetches(supabase, Object.values(hits));

  return { hits, coolingDown, retryAfterSec, fetched };
}
