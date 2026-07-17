import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getActor } from "@/lib/auth";
import { CalendarView } from "@/features/calendar/calendar-view";
import { getCalendarData } from "@/features/calendar/queries";

export const metadata = { title: "Content Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  // Read-only view — any logged-in team member can see the calendar.
  const actor = await getActor();
  if (!actor) redirect("/dashboard");

  const { year: yParam, month: mParam } = await searchParams;
  const now = new Date();
  const year = Number(yParam) || now.getFullYear();
  const mNum = Number(mParam);
  const month = mNum >= 1 && mNum <= 12 ? mNum : now.getMonth() + 1;

  const { events } = await getCalendarData(year, month);

  return (
    <div className="onboarding-stage">
      <PageHeader
        icon={CalendarDays}
        title="Content Calendar"
        knowMore="calendar"
      />
      <CalendarView year={year} month={month} events={events} />
    </div>
  );
}
