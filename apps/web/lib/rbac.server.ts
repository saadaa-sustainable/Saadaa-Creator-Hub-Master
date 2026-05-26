import "server-only";
import { requireActor } from "./auth";
import { hasPermission, type PermissionKey, type ActorPermissions } from "./rbac";

export async function assertPermission(
  key: PermissionKey,
): Promise<ActorPermissions> {
  const actor = await requireActor();
  if (!hasPermission(actor, key)) {
    throw new Error(`Missing permission: ${key}`);
  }
  return actor;
}
