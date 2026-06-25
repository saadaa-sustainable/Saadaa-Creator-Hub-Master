"use server";

import { getActor } from "@/lib/auth";
import { fetchCreatorCollabHistory } from "./queries";
import type { CreatorCollab } from "./types";

/**
 * On-demand loader for a single creator's collab history, called from the
 * Creator Analytics history modal when it opens. Wraps the
 * `creator_collab_history` RPC behind a logged-in-actor gate so the public
 * server-action endpoint never dumps collab data to an unauthenticated caller.
 */
export async function loadCreatorCollabHistory(
  infId: string,
): Promise<CreatorCollab[]> {
  const actor = await getActor();
  if (!actor) throw new Error("Forbidden");
  return fetchCreatorCollabHistory(infId);
}
