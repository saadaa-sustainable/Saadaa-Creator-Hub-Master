import { cache } from "react";
import { createClient } from "./supabase/server";
import type { UserAccessRow } from "./supabase/types.gen";

/**
 * Cached per-request lookup of the active user + their user_access row.
 * Safe to call from layouts and pages — React `cache` dedupes within one request.
 */
export const getActor = cache(async (): Promise<UserAccessRow | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data } = await supabase
    .from("user_access")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  const row = data as any;
  if (!row || !row.active) return null;
  return row;
});

export async function requireActor(): Promise<UserAccessRow> {
  const actor = await getActor();
  if (!actor) throw new Error("Not authenticated or access revoked");
  return actor;
}
