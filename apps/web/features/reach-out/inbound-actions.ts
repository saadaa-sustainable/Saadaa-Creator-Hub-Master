"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
} from "@/lib/notifications";
import {
  InboundBatchSchema,
  applyInboundBarterLock,
  inboundUsernameFromUrl,
} from "./inbound-schema";
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

  // Creator cap (decision 2026-06-07): the campaign accepts at most its
  // allocated creator count (Σ num_influencers across budget tiers). Seed a
  // running slot count with the campaign's existing active (non-Cancelled)
  // creators; each committed row consumes a slot. Rows beyond the cap are
  // skipped as failures. cap=0 (no budget rows) ⇒ no cap.
  const [capBudgetRes, capPostsRes] = await Promise.all([
    (supabase as any)
      .from("campaign_budget")
      .select("num_influencers")
      .eq("campaign_id", campaignId),
    (supabase as any)
      .from("posts")
      .select("username, workflow_status")
      .eq("campaign_id", campaignId)
      .limit(5000),
  ]);
  const creatorCap = (
    (capBudgetRes.data ?? []) as Array<{ num_influencers: number | null }>
  ).reduce((sum, r) => sum + (Number(r.num_influencers ?? 0) || 0), 0);
  let slotsUsed = new Set(
    (
      (capPostsRes.data ?? []) as Array<{
        username: string | null;
        workflow_status: string | null;
      }>
    )
      .filter((p) => String(p.workflow_status ?? "") !== "Cancelled")
      .map((p) => (p.username ?? "").trim().toLowerCase())
      .filter(Boolean),
  ).size;

  for (let i = 0; i < rows.length; i++) {
    const r = applyInboundBarterLock(rows[i]);
    const username = inboundUsernameFromUrl(r.instagramLink);
    if (!username) {
      failures.push({
        row: i + 1,
        error: "Could not derive username from URL",
      });
      continue;
    }

    // Shrishti duplicate-creator guard (per-campaign; Cancelled allows re-add).
    // Sequential loop → a prior row's commit is visible to later rows, so
    // intra-batch duplicates are caught too.
    const { data: dupes } = await (supabase as any)
      .from("posts")
      .select("workflow_status")
      .ilike("username", username)
      .eq("campaign_id", campaignId)
      .limit(10);
    const activeDup = (
      (dupes ?? []) as Array<{ workflow_status: string | null }>
    ).some((p) => String(p.workflow_status ?? "") !== "Cancelled");
    if (activeDup) {
      failures.push({ row: i + 1, error: "Already in this campaign" });
      continue;
    }

    // Cap guard — this row is a new creator (passed the dup guard); reject once
    // the campaign is full. Raise the budget allocation to add more.
    if (creatorCap > 0 && slotsUsed >= creatorCap) {
      failures.push({
        row: i + 1,
        error: `Campaign at creator cap (${slotsUsed}/${creatorCap}) — raise the allocation to add more`,
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
        p_collab_type: r.collabType,
        p_commercial_amount: r.collabType === "Barter" ? 0 : r.commercials ?? 0,
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
    slotsUsed++; // consumed one creator slot
  }

  // Sheet mirror removed 2026-05-21 — Supabase is sole source of truth.

  // ── Submitter confirmation (Wave 7.x) ───────────────────────────────────
  // ONE summary email to the actor (not one per row). Only when at least one
  // row committed. Fire-and-forget via after(); best-effort, never throws.
  if (created.length > 0) {
    const createdCount = created.length;
    const failureCount = failures.length;
    const sampleHandles = created
      .slice(0, 5)
      .map((c) => `@${c.username}`)
      .join(", ");
    after(async () => {
      let campaignLabel = campaignId;
      try {
        const { data: camp } = await (supabase as any)
          .from("campaigns")
          .select("campaign_name")
          .eq("campaign_id", campaignId)
          .maybeSingle();
        const name = (camp?.campaign_name as string | null) ?? null;
        if (name) campaignLabel = `${campaignId} — ${name}`;
      } catch {
        // best-effort — fall back to the bare campaign id.
      }
      await notifyActorConfirmation({
        actor,
        type: NOTIFICATION_TYPES.INBOUND_CONFIRMATION,
        subject: `${createdCount} inbound creator${
          createdCount === 1 ? "" : "s"
        } added to ${campaignId}`,
        title: "Inbound creators added",
        subtitle: `CAMPAIGN: ${campaignId}`,
        summaryLines: [
          `Your inbound batch was logged — ${createdCount} creator${
            createdCount === 1 ? "" : "s"
          } added to this campaign and now in the Reach Out stage${
            failureCount > 0
              ? `, ${failureCount} row${failureCount === 1 ? "" : "s"} skipped`
              : ""
          }.`,
        ],
        rows: [
          { label: "Campaign", value: campaignLabel },
          { label: "Creators Added", value: createdCount },
          {
            label: "Rows Skipped",
            value: failureCount > 0 ? failureCount : null,
          },
          {
            label: "Handles",
            value:
              sampleHandles +
              (createdCount > 5 ? `, +${createdCount - 5} more` : ""),
          },
        ],
      });
    });
  }

  revalidateTag("posts");
  revalidateTag("creators");
  revalidatePath("/reach-out/inbound");
  revalidatePath("/onboarding");
  revalidatePath("/journey");

  return { ok: true, created: created.length, failures };
}
