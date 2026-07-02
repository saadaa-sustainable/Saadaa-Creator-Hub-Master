"use client";

import {
  Clock,
  Instagram,
  PackageCheck,
  UserCheck,
  Send,
  Truck,
} from "lucide-react";
import type { CampaignTat, TatData, TatKpi } from "./types";
import { TatCard } from "./tat-card";
import { TatKpiStrip } from "./kpi-strip";
import { CampaignTatChart } from "./campaign-chart";

function SectionLabel({
  bg,
  text,
  icon: Icon,
  title,
  subtitle,
}: {
  bg: string;
  text: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-6 flex-wrap">
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[0.74rem] font-extrabold uppercase tracking-[0.05em]"
        style={{ background: bg, color: text }}
      >
        <Icon size={13} aria-hidden />
        {title}
      </span>
      <span className="text-[0.78rem] text-text-tertiary">{subtitle}</span>
    </div>
  );
}

export function TatPageClient({
  tatData,
  campaignTats,
  kpi,
}: {
  tatData: TatData;
  campaignTats: CampaignTat[];
  kpi: TatKpi;
}) {
  return (
    <>
      {/* KPI strip */}
      <TatKpiStrip kpi={kpi} />

      {/* Section 1: Reach Out base */}
      <SectionLabel
        bg="rgba(79,70,229,0.12)"
        text="#4f46e5"
        icon={Send}
        title="Base: Reach Out"
        subtitle="How long after initial reach-out does each milestone get hit?"
      />
      <div className="bento-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
        <TatCard
          from="Reach Out"
          to="Onboarded"
          stats={tatData.ro_to_onboard}
          tone="indigo"
          icon={UserCheck}
        />
        <TatCard
          from="Reach Out"
          to="Order Created"
          stats={tatData.ro_to_order_created}
          tone="warning"
          icon={PackageCheck}
        />
        <TatCard
          from="Reach Out"
          to="Posted"
          stats={tatData.ro_to_posting}
          tone="success"
          icon={Instagram}
        />
      </div>

      {/* Section 2: Onboarding base */}
      <SectionLabel
        bg="rgba(16,185,129,0.12)"
        text="#16a34a"
        icon={UserCheck}
        title="Base: Onboarding"
        subtitle="Time from on-boarding to key downstream events."
      />
      <div className="bento-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
        <TatCard
          from="Onboarding"
          to="Delivered"
          stats={tatData.ob_to_delivered}
          tone="warning"
          icon={Truck}
        />
        <TatCard
          from="Onboarding"
          to="Posted"
          stats={tatData.ob_to_posting}
          tone="success"
          icon={Instagram}
        />
      </div>

      {/* Section 3: Order & Delivery */}
      <SectionLabel
        bg="rgba(245,158,11,0.12)"
        text="#d97706"
        icon={PackageCheck}
        title="Base: Order & Delivery"
        subtitle="Product journey from order placed → delivered → live content."
      />
      <div className="bento-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <TatCard
          from="Order Created"
          to="Delivered"
          stats={tatData.order_to_delivered}
          tone="info"
          icon={Truck}
        />
        <TatCard
          from="Delivered"
          to="Posted"
          stats={tatData.delivered_to_posting}
          tone="success"
          icon={Instagram}
        />
      </div>

      {/* Campaign TAT benchmark */}
      <CampaignTatChart data={campaignTats} />
    </>
  );
}
