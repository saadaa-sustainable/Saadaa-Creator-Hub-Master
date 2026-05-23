import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export default async function Page() {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "admin")) redirect("/dashboard");

  return (
    <PagePlaceholder
      title="Users"
      legacyRef="getUserPanelData + saveUserAccess + deleteUserAccess"
      description="Admin-only. Phase: MOM §10 fine-grained permissions + assigned_campaigns scoping."
    />
  );
}
