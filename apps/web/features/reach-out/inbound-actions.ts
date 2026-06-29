"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { assertCreateAllowed } from "@/lib/test-mode";
import { createServiceClient } from "@/lib/supabase/server";
import { stampTestRows } from "@/features/settings/actions";
import { isVoidedStatus } from "@/lib/workflow";
import {
  NOTIFICATION_TYPES,
  notifyActorConfirmation,
} from "@/lib/notifications";
import {
  InboundBatchSchema,
  inboundUsernameFromUrl,
} from "./inbound-schema";
import { findContentCode } from "./content-codes";

interface RowFailure {
  row: number;
  error: string;
}

// Nomenclature is no longer built at reach-out — it embeds the post_id, which
// is minted at ONBOARDING. submitOnboarding builds it then.

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
  await assertCreateAllowed("creator", actor, "Creators (Reach Out)");

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
    id: number;
    // post_id / post_id_short are minted at ONBOARDING — NULL at reach-out.
    postId: string | null;
    postIdShort: string | null;
    infId: string;
    row: number;
    username: string;
    contentName: string | null;
  }[] = [];
  const failures: RowFailure[] = [];

  // Reach-out is UNLIMITED per campaign (2026-06-10): the creator cap now applies
  // at ONBOARDING, not reach-out (see submitOnboarding). We still reject the whole
  // batch for a CLOSED campaign.
  const { data: campRow } = await (supabase as any)
    .from("campaigns")
    .select("status")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  const campStatus = String(campRow?.status ?? "").trim().toLowerCase();
  if (campStatus !== "active") {
    return {
      ok: false,
      created: 0,
      failures: [],
      error: campStatus.startsWith("pending")
        ? `Campaign ${campaignId} is awaiting approval — it can't take reach-outs until an admin approves it.`
        : `Campaign ${campaignId} is ${campRow?.status ?? "not active"}. Only approved (active) campaigns accept reach-outs.`,
    };
  }

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

    // New rule (2026-06-24): Reach Out (inbound too) is for NEW creators only.
    // Existing creators start repeat collabs (C2+) via Onboarding, not reach-out.
    const { data: existsRow } = await (supabase as any)
      .from("creators")
      .select("inf_id")
      .ilike("username", username)
      .maybeSingle();
    if (existsRow) {
      failures.push({
        row: i + 1,
        error: "Existing creator — use Onboarding (repeat collab C2+)",
      });
      continue;
    }

    // Shrishti duplicate-creator guard (per-campaign; Cancelled OR voided/
    // Offboarded allow re-add). Sequential loop → a prior row's commit is
    // visible to later rows, so intra-batch duplicates are caught too.
    const { data: dupes } = await (supabase as any)
      .from("posts")
      .select("workflow_status")
      .ilike("username", username)
      .eq("campaign_id", campaignId)
      .limit(10);
    const activeDup = (
      (dupes ?? []) as Array<{ workflow_status: string | null }>
    ).some(
      (p) =>
        String(p.workflow_status ?? "") !== "Cancelled" &&
        !isVoidedStatus(p.workflow_status),
    );
    if (activeDup) {
      failures.push({ row: i + 1, error: "Already in this campaign" });
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
        // Inbound no longer captures collab type / commercials — those are set
        // in Onboarding. Leave collab_type unset (null) so the row isn't
        // auto-marked Barter (which wrongly counted in the Barter funnel
        // bucket); commercial stays 0 until onboarding.
        p_collab_type: null,
        p_commercial_amount: 0,
        p_raw_dump: null,
        p_logged_by_email: actor.name || actor.email,
      })
      .single();

    if (error || !data) {
      failures.push({ row: i + 1, error: error?.message || "RPC failed" });
      continue;
    }

    const row = data as {
      id: number;
      // post_id / post_id_short are minted at ONBOARDING now — NULL at reach-out.
      // The bigserial `id` identifies the new reach-out row.
      post_id: string | null;
      post_id_short: string | null;
      post_number: number;
      // NULL now — collab is minted at onboarding, not reach-out.
      collab_number: number | null;
      inf_id: string;
    };

    // No nomenclature at reach-out: nomenclature embeds the post_id, which
    // doesn't exist until onboarding mints it. submitOnboarding builds it then.

    // Persist the legacy profile_id from the Meta/historic Fetch onto the new
    // creator (lets a returning handle be recognised later). Best-effort.
    if (r.profileId && row.inf_id) {
      await (supabase as any)
        .from("creators")
        .update({ profile_id: r.profileId })
        .eq("inf_id", row.inf_id);
    }

    created.push({
      id: row.id,
      // postId / postIdShort are NULL until onboarding mints them.
      postId: row.post_id,
      postIdShort: row.post_id_short,
      infId: row.inf_id,
      row: i + 1,
      username,
      contentName,
    });
  }

  // Test Mode: stamp every new creator (creator scope) + post (collab scope) in
  // this batch when those scopes are on. Two batched updates; no-op when off.
  if (created.length > 0) {
    await stampTestRows([
      {
        scope: "creator",
        table: "creators",
        idColumn: "inf_id",
        ids: created.map((c) => c.infId).filter(Boolean),
      },
      {
        // Reach-out rows have NULL post_id (minted at onboarding) — stamp by id.
        scope: "collab",
        table: "posts",
        idColumn: "id",
        ids: created.map((c) => c.id),
      },
    ]);
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
