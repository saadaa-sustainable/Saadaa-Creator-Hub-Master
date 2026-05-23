"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { InboundBatchSchema, inboundUsernameFromUrl } from "./inbound-schema";
import { findContentCode } from "./content-codes";

interface RowFailure {
  row: number;
  error: string;
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

export type InboundBatchResult = {
  ok: boolean;
  created: number;
  failures: RowFailure[];
  error?: string;
};

/**
 * Server action — submit a batch of Inbound rows. Each row gets its own
 * submit_reachout RPC call (direction='inbound'). Failures are isolated per
 * row, all successes still commit. Mirrors legacy submitReachOutBatch.
 */
export async function submitInboundBatch(
  input: unknown,
): Promise<InboundBatchResult> {
  const actor = await assertPermission("reachout_inbound");

  const parsed = InboundBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      created: 0,
      failures: [],
      error: parsed.error.issues[0]?.message || "Validation failed",
    };
  }

  const { campaignId, rows } = parsed.data;
  const supabase = createServiceClient();
  const created: {
    postId: string;
    postIdShort: string;
    infId: string;
    row: number;
    username: string;
    contentName: string | null;
  }[] = [];
  const failures: RowFailure[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const username = inboundUsernameFromUrl(r.instagramLink);
    if (!username) {
      failures.push({
        row: i + 1,
        error: "Could not derive username from URL",
      });
      continue;
    }
    const contentName = findContentCode(r.contentCode)?.name ?? null;

    const { data, error } = await (supabase as any)
      .rpc("submit_reachout", {
        p_username: username,
        p_inf_name: "",
        p_instagram_link: r.instagramLink,
        p_followers: null,
        p_gender: r.gender,
        p_state: null,
        p_email: null,
        p_campaign_id: campaignId,
        p_content_type: r.contentCode,
        p_content_name: contentName,
        p_reachout_type: "Inbound",
        p_reachout_direction: "inbound",
        p_reels: 0,
        p_static_posts: 0,
        p_stories: 0,
        p_ads_usage_rights: null,
        p_collab_type: null,
        p_commercial_amount: null,
        p_commercial_reel_rate: r.reelRate ?? null,
        p_commercial_post_rate: r.postRate ?? null,
        p_commercial_story_rate: null,
        p_raw_dump: null,
        p_logged_by_email: actor.name || actor.email,
      })
      .single();

    if (error || !data) {
      failures.push({ row: i + 1, error: error?.message || "RPC failed" });
      continue;
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
          r.contentCode,
        ),
      })
      .eq("post_id", row.post_id);

    created.push({
      postId: row.post_id,
      postIdShort: row.post_id_short,
      infId: row.inf_id,
      row: i + 1,
      username,
      contentName,
    });
  }

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  revalidateTag("posts");
  revalidateTag("creators");
  revalidatePath("/reach-out/inbound");
  revalidatePath("/onboarding");
  revalidatePath("/journey");

  return { ok: true, created: created.length, failures };
}
