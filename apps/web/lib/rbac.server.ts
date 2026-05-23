import "server-only";
import { requireActor } from "./auth";
import { hasPermission, type PermissionKey } from "./rbac";
import type { UserAccessRow } from "./supabase/types.gen";

export async function assertPermission(
  key: PermissionKey,
): Promise<UserAccessRow> {
  const actor = await requireActor();
  if (!hasPermission(actor, key)) {
    throw new Error(`Missing permission: ${key}`);
  }
  return actor;
}
