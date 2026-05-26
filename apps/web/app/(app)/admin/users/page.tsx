import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fetchUserPanelData } from "@/features/user-panel/queries";
import { listRoles } from "@/features/user-panel/roles-actions";
import { UserPanelBody } from "@/features/user-panel/page-client";

export const metadata = { title: "User Panel" };

export default async function Page() {
  const actor = await getActor();
  if (!actor || !hasPermission(actor, "admin")) redirect("/dashboard");

  return (
    <div className="onboarding-stage user-panel-stage">
      <PageHeader
        icon={Users}
        title="User Panel"
        knowMore="user-panel"
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <UserData />
      </Suspense>
    </div>
  );
}

async function UserData() {
  const [data, roles] = await Promise.all([fetchUserPanelData(), listRoles()]);
  return <UserPanelBody data={data} roles={roles} />;
}
