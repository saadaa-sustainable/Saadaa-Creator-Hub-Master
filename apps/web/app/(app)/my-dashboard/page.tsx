import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { getActor } from "@/lib/auth";
import { fetchMyDashboardData } from "@/features/my-dashboard/queries";
import { MyDashboardBody } from "@/features/my-dashboard/page-client";

export const metadata = { title: "My Dashboard" };

export default async function MyDashboardPage() {
  const actor = await getActor();

  if (!actor) {
    return (
      <div className="onboarding-stage my-dashboard-stage">
        <PageHeader
          icon={LayoutDashboard}
          title="My Dashboard"
          knowMore="my-dashboard"
        />
        <div className="flex items-center justify-center py-20 text-sm text-[--text-secondary]">
          Sign in to view your dashboard
        </div>
      </div>
    );
  }

  // onboarded_by stores actor.name || actor.email — match the same logic used
  // when writing the field in onboarding/actions.ts.
  const actorIdentifier = actor.name || actor.email;

  return (
    <div className="onboarding-stage my-dashboard-stage">
      <PageHeader
        icon={LayoutDashboard}
        title="My Dashboard"
        knowMore="my-dashboard"
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <MyDashboardData actorIdentifier={actorIdentifier} />
      </Suspense>
    </div>
  );
}

async function MyDashboardData({
  actorIdentifier,
}: {
  actorIdentifier: string;
}) {
  const { posts, kpi, pendingActions, filterOptions, leaderboard } =
    await fetchMyDashboardData(actorIdentifier);

  return (
    <MyDashboardBody
      kpi={kpi}
      pendingActions={pendingActions}
      posts={posts}
      filterOptions={filterOptions}
      leaderboard={leaderboard}
    />
  );
}
