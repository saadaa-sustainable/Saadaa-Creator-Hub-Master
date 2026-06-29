import "server-only";
import { hasPermission, type ActorPermissions } from "./rbac";
import { getTestModeScopes } from "@/features/settings/actions";
import type { TestScope } from "@/features/settings/test-scopes";

/**
 * Test Mode create-gate. While a scope is ON, only admins may create in that
 * scope's views (they're sandboxing test rows). Non-admins are paused so they
 * don't create entries mid-test — mirrors the DAM "Non-admins cannot create here
 * until it is turned off" rule. No-op when the scope is off or the actor is an
 * admin; throws otherwise (the create action surfaces it as an error toast).
 */
export async function assertCreateAllowed(
  scope: TestScope,
  actor: ActorPermissions,
  label: string,
): Promise<void> {
  if (hasPermission(actor, "admin")) return;
  const scopes = await getTestModeScopes();
  if (!scopes.includes(scope)) return;
  throw new Error(
    `Test Mode is ON for ${label} — only an admin can create new entries until it is turned off.`,
  );
}
