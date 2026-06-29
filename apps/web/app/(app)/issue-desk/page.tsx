import { Suspense } from "react";
import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { fetchSupportTicketDesk } from "@/features/issue-desk/queries";
import { IssueDeskBody } from "@/features/issue-desk/page-client";

export const metadata = { title: "Issue Desk" };

/**
 * Issue Desk — support/issue tickets. Open to everyone (raise a ticket); admins
 * also get the resolution controls. Layout ported from the DAM project; data +
 * palette + shell are CreatorHub's. The route group already gates auth.
 */
export default async function IssueDeskPage() {
  return (
    <div className="onboarding-stage issue-desk-stage">
      <PageHeader icon={LifeBuoy} title="Issue Desk" knowMore="issue-desk" />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <IssueDeskData />
      </Suspense>
    </div>
  );
}

async function IssueDeskData() {
  const data = await fetchSupportTicketDesk();
  return <IssueDeskBody data={data} />;
}
