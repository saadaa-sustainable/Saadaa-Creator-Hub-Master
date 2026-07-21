import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getActor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
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

  const supabase = createServiceClient();
  const [{ events }, { data: campaignRows }] = await Promise.all([
    getCalendarData(year, month),
    (supabase as any)
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .order("campaign_id"),
  ]);
  const campaigns = ((campaignRows ?? []) as Array<{
    campaign_id: string | null;
    campaign_name: string | null;
  }>).filter((c): c is { campaign_id: string; campaign_name: string | null } =>
    Boolean(c.campaign_id),
  );

  return (
    <div className="onboarding-stage">
      <PageHeader
        icon={CalendarDays}
        title="Content Calendar"
        knowMore="calendar"
      />
      <CalendarView
        year={year}
        month={month}
        events={events}
        campaigns={campaigns}
      />
    </div>
  );
}
