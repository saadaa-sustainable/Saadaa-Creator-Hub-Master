import { Suspense } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { fetchErrorPortalData } from "@/features/errors/queries";
import { ErrorPortalBody } from "@/features/errors/page-client";

export const metadata = { title: "Error Portal" };

export default async function ErrorsPage() {
  return (
    <div className="onboarding-stage errors-stage">
      <PageHeader
        icon={AlertTriangle}
        title="Error Portal"
        knowMore="errors"
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ErrorData />
      </Suspense>
    </div>
  );
}

async function ErrorData() {
  const data = await fetchErrorPortalData();
  return <ErrorPortalBody data={data} />;
}
