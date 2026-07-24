import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getActingAs, listActingTargets } from "@/lib/impersonation";
import { DashboardInteractionLayer } from "@/features/dashboard/interaction-layer";
import { fetchMyDashboardData } from "@/features/my-dashboard/queries";
import { MyDashboardBody } from "@/features/my-dashboard/page-client";
import { ViewAsControl } from "@/features/impersonation/view-as";

export const metadata = { title: "My Dashboard" };

export default async function MyDashboardPage() {
  const actor = await getActor();

  if (!actor) {
    return (
      <DashboardInteractionLayer
        className="onboarding-stage my-dashboard-stage"
        variant="personal"
      >
        <PageHeader
          icon={LayoutDashboard}
          title="My Dashboard"
          knowMore="my-dashboard"
        />
        <div className="flex items-center justify-center py-20 text-sm text-[--text-secondary]">
          Sign in to view your dashboard
        </div>
      </DashboardInteractionLayer>
    );
  }

  // "View as" (Global Admins): when acting as a team member, the dashboard
  // shows THEIR pipeline. onboarded_by stores name || email — match the same
  // logic used when writing the field in onboarding/actions.ts.
  const actingAs = await getActingAs();
  const viewAsMembers = hasPermission(actor, "admin")
    ? await listActingTargets(actor)
    : [];
  const actorIdentifier = actingAs?.name ?? (actor.name || actor.email);

  return (
    <DashboardInteractionLayer
      className="onboarding-stage my-dashboard-stage"
      variant="personal"
    >
      <PageHeader
        icon={LayoutDashboard}
        title="My Dashboard"
        knowMore="my-dashboard"
      />
      <ViewAsControl members={viewAsMembers} actingAs={actingAs} />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <MyDashboardData actorIdentifier={actorIdentifier} />
      </Suspense>
    </DashboardInteractionLayer>
  );
}

async function MyDashboardData({
  actorIdentifier,
}: {
  actorIdentifier: string;
}) {
  const { posts, kpi, pendingActions, snapshots, filterOptions, leaderboard } =
    await fetchMyDashboardData(actorIdentifier);

  return (
    <MyDashboardBody
      kpi={kpi}
      pendingActions={pendingActions}
      snapshots={snapshots}
      memberLabel={actorIdentifier}
      posts={posts}
      filterOptions={filterOptions}
      leaderboard={leaderboard}
    />
  );
}
