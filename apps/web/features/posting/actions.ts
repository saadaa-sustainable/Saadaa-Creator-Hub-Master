"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { attributionName } from "@/lib/impersonation";
import { createServiceClient } from "@/lib/supabase/server";
import { closeCampaignIfComplete } from "@/lib/campaign-lifecycle";
import { getCampaignAutoCloseEnabled } from "@/features/settings/actions";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
} from "@/lib/notifications";
import {
  extractShortcode,
  formatIstDate,
  postDateFromUrl,
} from "@/lib/instagram-shortcode";
import { fetchPostByShortcode, isMetaGraphConfigured } from "@/lib/meta-graph";
import { checkMetaGate, recordMetaUsage } from "@/lib/meta-rate-limit";
import {
  fetchCdnFile,
  rehostImage,
  uploadToAvatarsBucket,
} from "@/lib/avatar-rehost";
import { uploadCollabVideo } from "@/lib/google-drive";
import { PostingSchema } from "./schema";

export type PostingResult =
  | {
      ok: true;
      postId: string;
      postDate: string;
      postDateSource: "form" | "shortcode" | "today";
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Live post lookup for the Posting form. On a pasted Instagram link we hit Meta
 * `business_discovery` for the creator's recent media and match the shortcode —
 * which yields the AUTHORITATIVE post date (Meta's timestamp, not the ±1-day
 * shortcode estimate), confirms the post belongs to that creator, and returns
 * the caption / like / comment / media-type details for the in-app preview.
 *
 * Graceful fallback: when Meta is rate-limited / the account is personal / the
 * post is older than the recent window, `metaMatched=false` and `date` falls
 * back to the local shortcode decode (`dateSource:"shortcode"`). The preview
 * popup still renders via the public Instagram embed (no token needed).
 */
export type PostDetailsResult =
  | {
      ok: true;
      shortcode: string;
      date: string;
      dateSource: "instagram" | "shortcode";
      ownerConfirmed: boolean;
      metaMatched: boolean;
      caption: string | null;
      likeCount: number | null;
      commentsCount: number | null;
      mediaType: string | null;
      permalink: string | null;
      /** Why live stats are unavailable (only when metaMatched=false). */
      note: string | null;
    }
  | { ok: false; reason: string };

export async function fetchPostDetails(input: {
  postLink: string;
  username?: string | null;
}): Promise<PostDetailsResult> {
  await assertPermission("posting_submit");

  const link = (input.postLink ?? "").trim();
  const shortcode = extractShortcode(link);
  if (!shortcode) {
    return { ok: false, reason: "No Instagram post link detected." };
  }

  const handle = (input.username ?? "").trim().replace(/^@/, "");
  const bitshift = postDateFromUrl(link);

  // Accurate reason when we can't pull live stats — distinguishes "old post" from
  // "private account" from "cooling down", instead of a misleading catch-all.
  let note: string | null = null;
  if (!handle) {
    note =
      "Live stats need the creator's @handle — confirm ownership below. The embed is the live post.";
  } else if (!isMetaGraphConfigured()) {
    note =
      "Live stats need the Instagram fetch configured. The embed is the live post.";
  } else {
    const gate = await checkMetaGate();
    if (gate.coolingDown) {
      note = `Instagram fetch is cooling down (try again in ~${gate.retryAfterSec}s). The embed is the live post.`;
    } else {
      const r = await fetchPostByShortcode(handle, shortcode);
      await recordMetaUsage(1, r.usagePct ?? 0);
      if (r.status === "ok" && r.node) {
        const n = r.node;
        return {
          ok: true,
          shortcode,
          date: n.timestamp
            ? formatIstDate(new Date(n.timestamp))
            : (bitshift ?? todayIso()),
          dateSource: n.timestamp ? "instagram" : "shortcode",
          ownerConfirmed: true,
          metaMatched: true,
          caption: n.caption,
          likeCount: n.likeCount,
          commentsCount: n.commentsCount,
          mediaType: n.mediaType,
          permalink: n.permalink,
          note: null,
        };
      }
      note = r.accountResolved
        ? `This post isn't in @${handle}'s recent Instagram media (older than the window Instagram exposes), so live stats can't be pulled. The embed is the live post.`
        : `Instagram didn't return live stats for @${handle} — only business / creator accounts expose them. The embed is the live post.`;
    }
  }

  // Fallback: no Meta match — local shortcode decode only (popup still embeds).
  if (bitshift) {
    return {
      ok: true,
      shortcode,
      date: bitshift,
      dateSource: "shortcode",
      ownerConfirmed: false,
      metaMatched: false,
      caption: null,
      likeCount: null,
      commentsCount: null,
      mediaType: null,
      permalink: null,
      note,
    };
  }
  return { ok: false, reason: "Could not read this post." };
}

/**
 * Server action — submit posting data for one deliverable. Mirrors legacy
 * submitPosting: writes post_date / post_link / download_link / raw_dump,
 * flips workflow_status='Posted'. Hard-rejects missing download link when
 * ads_usage_rights='Yes' (legacy §7.1).
 *
 * Partnership auto-invite (2026-07-02): after the write, the creator's Meta
 * branded-content permission is synced — and when NO record exists yet, the
 * invite is sent automatically (the creator approves it in their IG
 * professional dashboard). Runs before the draft-payment init so an
 * already-approved creator passes the payment gate in the same submit.
 * Fail-soft: a Meta error never blocks the posting.
 *
 * post_date resolution (legacy parity):
 *   1. Form value if supplied
 *   2. Decode from postLink shortcode (Instagram epoch bitshift, no API)
 *   3. Fallback to today
 */
export async function submitPosting(input: unknown) {
  const actor = await assertPermission("posting_submit");

  const parsed = PostingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false as const, error: "Validation failed", fieldErrors };
  }

  const { postId, postDate, postLink, downloadLink, rawDump, bankName, bankNumber, ifsc } =
    parsed.data;

  // Resolve post_date: form > shortcode decode > today
  let resolvedDate = postDate?.trim() || "";
  let dateSource: "form" | "shortcode" | "today" = "form";
  if (!resolvedDate) {
    const decoded = postDateFromUrl(postLink);
    if (decoded) {
      resolvedDate = decoded;
      dateSource = "shortcode";
    } else {
      resolvedDate = todayIso();
      dateSource = "today";
    }
  }

  const supabase = createServiceClient();

  // GATE: block posting while this collab has an onboarding edit awaiting admin
  // approval. The corrected onboarding (e.g. a fixed order_id) must be ratified
  // before any -P{n} deliverable can be marked Posted.
  let collabKey: string | null = null;
  let postUsername: string | null = null;
  {
    const { data: postRow } = await (supabase as any)
      .from("posts")
      .select(
        "collab_id, inf_id, collab_number, collab_type, bank_name, bank_number, ifsc, username",
      )
      .eq("post_id", postId)
      .maybeSingle();
    postUsername = (postRow?.username as string | null) ?? null;
    collabKey =
      (postRow?.collab_id as string | null) ||
      (postRow?.inf_id
        ? `${postRow.inf_id}-C${Number(postRow.collab_number ?? 1)}`
        : null);
    if (collabKey) {
      const { data: pendingEdit } = await (supabase as any)
        .from("onboarding_edit_requests")
        .select("id")
        .eq("collab_id", collabKey)
        .eq("status", "Pending Approval")
        .maybeSingle();
      if (pendingEdit) {
        return {
          ok: false as const,
          error:
            "This collab has an onboarding edit awaiting admin approval. Posting is blocked until it is approved or rejected in the Approvals page.",
        };
      }
    }

    // GATE: Barter + Paid needs bank details before Posted. Optional at
    // onboarding (2026-07-11) — if the collab still has none, the posting form
    // must supply all three. COLLAB-LEVEL check: bank present on ANY deliverable
    // of the collab satisfies it (e.g. filled while posting a sibling P{n}).
    const isBarterPaid =
      String(postRow?.collab_type ?? "").trim().toLowerCase() ===
      "barter + paid";
    let bankOnCollab =
      String(postRow?.bank_number ?? "").trim().length > 0 &&
      String(postRow?.ifsc ?? "").trim().length > 0;
    if (isBarterPaid && !bankOnCollab && postRow?.inf_id) {
      const { data: sibs } = await (supabase as any)
        .from("posts")
        .select("collab_id, collab_number, bank_number, ifsc")
        .eq("inf_id", postRow.inf_id)
        .limit(100);
      bankOnCollab = ((sibs ?? []) as Array<Record<string, unknown>>).some(
        (s) => {
          const sKey =
            (s.collab_id as string | null) ||
            `${postRow.inf_id}-C${Number(s.collab_number ?? 1)}`;
          return (
            sKey === collabKey &&
            String(s.bank_number ?? "").trim().length > 0 &&
            String(s.ifsc ?? "").trim().length > 0
          );
        },
      );
    }
    const bankInForm =
      (bankName ?? "").length > 0 &&
      (bankNumber ?? "").length > 0 &&
      (ifsc ?? "").length > 0;
    if (isBarterPaid && !bankOnCollab && !bankInForm) {
      const fieldErrors: Record<string, string> = {};
      if (!bankName) fieldErrors.bankName = "Required for Barter + Paid";
      if (!bankNumber) fieldErrors.bankNumber = "Required for Barter + Paid";
      if (!ifsc) fieldErrors.ifsc = "Required for Barter + Paid";
      return {
        ok: false as const,
        error:
          "Bank details were not filled at onboarding — add them here to mark this Barter + Paid collab as Posted.",
        fieldErrors,
      };
    }
  }

  const { error: updErr } = await (supabase as any)
    .from("posts")
    .update({
      post_date: resolvedDate,
      post_link: postLink,
      download_link: downloadLink || null,
      raw_dump: rawDump || null,
      workflow_status: "Posted",
      // Posting-stage attribution — drives the "Posted by" filter on Submitted.
      // Follows the acting-as identity when a Global Admin submits on a team
      // member's behalf (lib/impersonation.ts).
      posted_by: await attributionName(actor),
    })
    .eq("post_id", postId);

  if (updErr) return { ok: false as const, error: updErr.message };

  // Capture the POST's cover image (fire-and-forget): probe the creator's
  // recent media for this shortcode and mirror thumbnail_url into storage —
  // Meta's link is signed and dies in days, the bucket copy doesn't. Skips
  // quietly when the gate is cooling; the UI falls back to the avatar.
  {
    const shortcodeForThumb = extractShortcode(postLink);
    const handleForThumb = (postUsername ?? "").trim();
    if (shortcodeForThumb && handleForThumb) {
      after(async () => {
        try {
          const gate = await checkMetaGate();
          if (gate.coolingDown) return;
          const probe = await fetchPostByShortcode(
            handleForThumb,
            shortcodeForThumb,
          );
          await recordMetaUsage(1, probe.usagePct ?? 0);
          if (probe.status !== "ok" || !probe.node) return;
          const patch: Record<string, string> = {};
          const thumbSrc = probe.node.thumbnailUrl ?? probe.node.mediaUrl;
          if (thumbSrc) {
            const hosted = await rehostImage(
              `post-thumbs/${postId}.jpg`,
              thumbSrc,
            );
            if (hosted) patch.post_thumbnail = hosted;
          }
          // Mirror the MEDIA — downloaded ONCE, used twice. EVERY deliverable
          // type files into the collab's Drive folder (a 3-deliverable collab
          // = three files in Saadaa All Collabs/{collab_id}/):
          //   reels  → {post_id}.mp4 (also bucket-mirrored so the lightbox
          //             plays natively — embeds refuse licensed-music reels)
          //   static → {post_id}.jpg (first frame for carousels)
          // The Drive link auto-fills the row's empty Download Link.
          const isVideo = probe.node.mediaType === "VIDEO";
          if (probe.node.mediaUrl) {
            const media = await fetchCdnFile(probe.node.mediaUrl, {
              maxBytes: isVideo ? 45_000_000 : 10_000_000,
              timeoutMs: 60_000,
            });
            if (media) {
              if (isVideo) {
                const hostedVideo = await uploadToAvatarsBucket(
                  `post-media/${postId}.mp4`,
                  media.buf,
                  media.contentType || "video/mp4",
                );
                if (hostedVideo) patch.post_media = hostedVideo;
              }

              if (collabKey) {
                const ext = isVideo ? "mp4" : "jpg";
                const driveLink = await uploadCollabVideo(
                  collabKey,
                  `${postId}.${ext}`,
                  media.buf,
                  media.contentType || (isVideo ? "video/mp4" : "image/jpeg"),
                );
                if (driveLink && !downloadLink) {
                  patch.download_link = driveLink;
                }
              }
            }
          }
          if (Object.keys(patch).length === 0) return;
          await (supabase as any)
            .from("posts")
            .update(patch)
            .eq("post_id", postId);
        } catch (e) {
          console.warn(`[posting] thumbnail capture ${postId}:`, e);
        }
      });
    }
  }

  // Bank details supplied in the posting form → stamp them on EVERY deliverable
  // of the collab (payments read them from the representative row). Covers
  // legacy rows whose collab_id is null via the inf_id-C{n} fallback key.
  if (collabKey && bankName && bankNumber && ifsc) {
    const patch = { bank_name: bankName, bank_number: bankNumber, ifsc };
    const { count } = await (supabase as any)
      .from("posts")
      .update(patch, { count: "exact" })
      .eq("collab_id", collabKey);
    if (!count) {
      const m = collabKey.match(/^(SIF-\d+)-C(\d+)$/i);
      if (m) {
        await (supabase as any)
          .from("posts")
          .update(patch)
          .eq("inf_id", m[1])
          .eq("collab_number", Number(m[2]))
          .is("collab_id", null);
      }
    }
  }

  // Partnership auto-invite happens CLIENT-DRIVEN right after this action
  // returns: the posting form opens a blocking status popup that checks the
  // creator's live Meta permission, auto-sends the invite when none exists,
  // and offers Resend on a rejection (see partnership-flow-modal.tsx +
  // syncPartnershipForPost). Kept out of this write path so a slow Meta
  // response can never hang the posting submit.

  // §8.1 — auto-init draft payment row on every Posted transition. Idempotent
  // (skips when a non-Done row already exists for this post). Child
  // deliverables are skipped — payment lives on the parent collab only.
  await autoInitDraftPayment(supabase, postId);

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  // Resolve the collab + campaign for this deliverable once — used by the
  // auto-close sweep and the confirmation email (which references Collab ID).
  const { data: idRow } = await (supabase as any)
    .from("posts")
    .select("collab_id, campaign_id")
    .eq("post_id", postId)
    .maybeSingle();
  const collabId = (idRow?.collab_id as string | null) ?? postId;
  const campaignIdOfPost = (idRow?.campaign_id as string | null)?.trim() ?? "";

  // Auto-close the campaign if this posting fills its full creator allocation
  // (cap creators all Posted/Delivered). Fire-and-forget; the daily cron also
  // sweeps as a backstop. Best-effort, never blocks the posting response.
  // Respects the campaign auto-close master switch (Settings) — when off (backlog
  // mode) campaigns stay open even when complete.
  if (campaignIdOfPost) {
    after(async () => {
      if (await getCampaignAutoCloseEnabled()) {
        await closeCampaignIfComplete(campaignIdOfPost);
      }
    });
  }

  // ── Submitter confirmation (Wave 7.x) ───────────────────────────────────
  // Email the actor that posting was submitted. Keyed on Collab ID (SIF-N-Cn);
  // the specific deliverable post id is a secondary detail row. Fire-and-forget.
  after(async () => {
    await notifyActorConfirmation({
      actor,
      type: NOTIFICATION_TYPES.POSTING_CONFIRMATION,
      subject: `Posting submitted — ${collabId} marked Posted`,
      title: "Posting submitted",
      subtitle: `COLLAB ID: ${collabId}`,
      summaryLines: [
        `Posting details were saved and ${postId} is now marked Posted.`,
      ],
      rows: [
        { label: "Collab ID", value: collabId },
        { label: "Post ID (deliverable)", value: postId },
        { label: "Post Date", value: resolvedDate },
        { label: "Post Link", value: postLink },
        { label: "Drive / Download Link", value: downloadLink || null },
        { label: "Raw Footage Dump", value: rawDump || null },
      ],
      postId,
      collabId,
    });
  });

  revalidateTag("posts");
  revalidateTag("payments");
  revalidatePath("/posting");
  revalidatePath("/journey");
  revalidatePath("/accounts-hub");

  return {
    ok: true as const,
    postId,
    postDate: resolvedDate,
    postDateSource: dateSource,
  };
}

/**
 * Reconcile payment eligibility after a posting transition. The database RPC
 * locks each collab, validates every sibling, and creates at most one Not Due
 * draft on the representative only when creator acceptance is already present.
 */
async function autoInitDraftPayment(
  supabase: ReturnType<typeof createServiceClient>,
  postId: string,
): Promise<void> {
  const { data: postRow, error: postError } = await (supabase as any)
    .from("posts")
    .select("inf_id, username, collab_number, collab_id")
    .eq("post_id", postId)
    .maybeSingle();
  if (postError || !postRow) {
    console.error(
      `[autoInitDraftPayment] post lookup failed for ${postId}: ${postError?.message ?? "not found"}`,
    );
    return;
  }
  if (!postRow.collab_id && postRow.collab_number == null) return;

  const { error: reconcileError } = await (supabase as any).rpc(
    "reconcile_creator_payment_eligibility",
    {
      p_inf_id: postRow.inf_id ?? null,
      p_username: postRow.username ?? null,
    },
  );
  if (reconcileError) {
    console.error(
      `[autoInitDraftPayment] reconcile failed for ${postId}: ${reconcileError.message}`,
    );
  }
}

/**
 * Patch partnership_id on a single post. Called from inline edit in the
 * Posting Overview modal, Accounts Hub kanban card, and list view.
 *
 * Since the auto-invite rollout this is the ADMIN OVERRIDE path: entering a
 * key also sets ad_partnership_valid=true so ads-only gates can pass when Meta
 * status is unavailable. Payment still requires the creator's real accepted
 * partnership_status. Clearing the key withdraws the ads override.
 */
export async function savePartnershipKey(
  postId: string,
  partnershipId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertPermission("posting_submit");
  const supabase = createServiceClient();
  const key = partnershipId.trim();
  const { error } = await (supabase as any)
    .from("posts")
    .update({
      partnership_id: key || null,
      ad_partnership_valid: key.length > 0,
    })
    .eq("post_id", postId);
  if (error) return { ok: false, error: error.message };
  revalidateTag("posts");
  revalidatePath("/posting");
  revalidatePath("/accounts-hub");
  return { ok: true };
}
