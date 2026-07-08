"use server";

import { getActor } from "@/lib/auth";
import { fetchCreatorAdsInfo, fetchCreatorCollabHistory } from "./queries";
import type { CreatorAdInfo, CreatorCollabEpisode } from "./types";

/**
 * On-demand loader for a single creator's collab history, called from the
 * Creator Analytics history modal when it opens. Wraps the
 * `creator_collab_history` RPC behind a logged-in-actor gate so the public
 * server-action endpoint never dumps collab data to an unauthenticated caller.
 */
export async function loadCreatorCollabHistory(
  infId: string,
): Promise<CreatorCollabEpisode[]> {
  const actor = await getActor();
  if (!actor) throw new Error("Forbidden");
  return fetchCreatorCollabHistory(infId);
}

/**
 * On-demand loader for a creator's Meta Ads rollups (from the local
 * `meta_ads_cache` mirror), shown in the history modal's "Meta Ads" section.
 * Same actor gate as the collab history.
 */
export async function loadCreatorAdsInfo(
  infId: string,
  username: string | null,
): Promise<CreatorAdInfo[]> {
  const actor = await getActor();
  if (!actor) throw new Error("Forbidden");
  return fetchCreatorAdsInfo(infId, username);
}
