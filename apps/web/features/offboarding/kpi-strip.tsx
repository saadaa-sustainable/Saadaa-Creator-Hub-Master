import { AlarmClock, Ban, FileWarning, UserMinus } from "lucide-react";
import { HeroKpi } from "@/features/dashboard/bento-kit";
import type { OffboardingKpi } from "./types";

export function OffboardingKpiStrip({ kpi }: { kpi: OffboardingKpi }) {
  return (
    <section>
      <div className="acc-kpi-group">
        <UserMinus size={13} aria-hidden /> Creator offboarding overview
      </div>
      <div className="acc-kpi-grid bento-stagger">
        <HeroKpi
          color="#C0392B"
          icon={<UserMinus size={15} aria-hidden />}
          label="Needs Review"
          value={kpi.candidates}
          sub="Creators past their posting deadline"
          info="Unique creators with at least one deliverable whose estimated delivery date has passed and whose posting form is still not submitted."
        />
        <HeroKpi
          color="#B57514"
          icon={<FileWarning size={15} aria-hidden />}
          label="Overdue Deliverables"
          value={kpi.overdueDeliverables}
          sub="Unsubmitted post forms"
          info="Every overdue deliverable still sitting in On Board or Order Sent. One creator may have more than one overdue deliverable."
        />
        <HeroKpi
          color="#7B4FBF"
          icon={<AlarmClock size={15} aria-hidden />}
          label="Longest Overdue"
          value={kpi.longestOverdueDays}
          suffix="d"
          sub="Oldest missed deadline"
          info="Days since the oldest missed estimated delivery date among creators currently waiting for review."
        />
        <HeroKpi
          color="#161513"
          icon={<Ban size={15} aria-hidden />}
          label="Offboarded"
          value={kpi.offboardedCreators}
          sub="Blocked from future reach-outs"
          info="Creators permanently offboarded at creator level. They cannot be reached out or onboarded again."
        />
      </div>
    </section>
  );
}
