"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { postDateFromUrl } from "@/lib/instagram-shortcode";
import { isContentLink } from "@/lib/workflow";
import { syncCreatorPartnership } from "@/lib/partnership-sync";

/**
 * Historic backlog filling — POSTING ONLY (per product decision 2026-07-10):
 * for historic rows that are already onboarded (order present) but missing a
 * real post link, the team pastes the post URL straight from the Historic
 * Analytics row drawer. The post date auto-derives from the IG shortcode (same
 * rule as the live Posting form), optional download link + raw dump are stored,
 * and the creator's Meta partnership invite is auto-sent (best-effort). There
 * is deliberately NO onboard/order fill flow here.
 *
 * Funnel + Internal (historic source) read historic_posts on render, so counts
 * reflect the fill on the next refresh.
 */

function todayIsoInIndia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export interface BacklogPostingResult {
  ok: boolean;
  error?: string;
  postDate?: string;
  dateSource?: "shortcode" | "today";
  /** Real partnership outcome (same semantics as the live Posting flow):
   *  state = approved/pending/rejected/revoked/none; invited = an invite was
   *  actually sent NOW. Null when the check itself failed. */
  partnershipState?: string | null;
  invited?: boolean;
}

/** Fill the post link on a historic row — auto post-date + auto partnership invite. */
export async function historicBacklogPosting(input: {
  id: number;
  postLink: string;
  downloadLink?: string;
  rawDump?: string;
}): Promise<BacklogPostingResult> {
  await assertPermission("posting_submit");
  const id = Number(input.id);
  const postLink = (input.postLink ?? "").trim();
  if (!Number.isFinite(id) || id <= 0)
    return { ok: false, error: "Row id missing" };
  if (!isContentLink(postLink))
    return {
      ok: false,
      error: "Enter a real content URL (instagram.com/… or youtube).",
    };

  // Post date: decoded from the IG shortcode (same rule as the live Posting
  // form); falls back to today when the URL carries no decodable id.
  const decoded = postDateFromUrl(postLink);
  const postDate = decoded ?? todayIsoInIndia();

  const supabase = createServiceClient();
  const { data: row, error: rowErr } = await (supabase as any)
    .from("historic_posts")
    .select("id, inf_id, username")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row) return { ok: false, error: "Historic row not found" };

  const patch: Record<string, unknown> = {
    post_link: postLink,
    post_date: postDate,
    workflow_status: "Posted",
  };
  const downloadLink = (input.downloadLink ?? "").trim();
  const rawDump = (input.rawDump ?? "").trim();
  if (downloadLink) patch.download_link = downloadLink;
  if (rawDump) patch.raw_dump = rawDump;

  const { error: updErr } = await (supabase as any)
    .from("historic_posts")
    .update(patch)
    .eq("id", id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/historic-analytics");

  // Partnership check + auto-invite — AWAITED (same semantics as the live
  // Posting flow) so the UI can report the REAL outcome: an already-approved
  // creator gets no invite (state=approved, invited=false); only a creator
  // with no active permission gets one (invited=true). Never fails the save.
  let partnershipState: string | null = null;
  let invited = false;
  const infId = (row.inf_id as string | null) ?? null;
  const username = (row.username as string | null) ?? null;
  if (infId || username) {
    try {
      const sync = await syncCreatorPartnership({
        infId,
        username,
        autoInvite: true,
        source: "historic-backlog",
      });
      partnershipState = sync.state ?? null;
      invited = sync.invited;
    } catch (err) {
      console.error("[historic-backlog] partnership sync failed:", err);
    }
  }

  return {
    ok: true,
    postDate,
    dateSource: decoded ? "shortcode" : "today",
    partnershipState,
    invited,
  };
}
