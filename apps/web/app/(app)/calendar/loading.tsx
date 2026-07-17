import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="onboarding-stage">
      <PageHeader
        icon={CalendarDays}
        title="Content Calendar"
      />
      <TableSkeleton rows={6} />
    </div>
  );
}
