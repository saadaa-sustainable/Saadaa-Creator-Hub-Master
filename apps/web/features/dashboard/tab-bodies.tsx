import {
  CalendarClock,
  Mail,
  Send,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

// Existing per-feature KPI queries + strip components — REUSED, not
// re-implemented. The Dashboard only composes them with empty filters so each
// tab body shows that view's global KPI aggregate.
import { fetchAccountsHubData } from "@/features/accounts-hub/queries";
import { AccountsKpiStrip } from "@/features/accounts-hub/kpi-strip";
import { fetchAdStatusData } from "@/features/ad-status/queries";
import { AdStatusKpiStrip } from "@/features/ad-status/kpi-strip";
import { fetchCostAnalyticsData } from "@/features/cost-analytics/queries";
import { fetchJourneyData } from "@/features/journey/queries";
import { JourneyKpiStrip } from "@/features/journey/kpi-strip";
import { JourneyFunnelStrip } from "@/features/journey/funnel-strip";
import { fetchOnboardingKpis } from "@/features/onboarding/queries";
import { OnboardingKpiStrip } from "@/features/onboarding/kpi-strip";
import { fetchOrderStatusData } from "@/features/order-status/queries";
import {
  CommerceIntelStrip,
  OrderVolumeStrip,
} from "@/features/order-status/kpi-strips";
import { fetchPostingKpis } from "@/features/posting/queries";
import { PostingKpiStrip } from "@/features/posting/kpi-strip";
import { fetchTatData } from "@/features/tat/queries";
import { TatKpiStrip } from "@/features/tat/kpi-strip";

import { fetchDashboardData } from "./queries";
import { DashboardOverviewStrip } from "./overview-strip";
import { DashboardCostStrip } from "./cost-strip";
import { DashboardBento } from "./dashboard-bento";
import type { DashboardFilters } from "./types";

/** Small reusable section heading inside a tab body. */
function TabSectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Send;
  children: React.ReactNode;
}) {
  return (
    <div className="acc-kpi-group">
      <Icon size={13} aria-hidden /> {children}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────
// Reuses the existing dashboard aggregate: headline cross-system KPI strip on
// top, then the full bento command-centre (preserves all prior content).
export async function OverviewTabBody({ params }: { params: DashboardFilters }) {
  const data = await fetchDashboardData(params);
  return (
    <div className="flex flex-col gap-4">
      <DashboardOverviewStrip data={data} />
      <DashboardBento data={data} />
    </div>
  );
}

// ── Reach Out ───────────────────────────────────────────────────────────────
// Reach Out has no dedicated KPI query/strip (it's a submission flow). Compose
// a compact grid from the existing dashboard aggregate, which already counts
// reach-outs, today/yesterday pulse, and the missing-email/order actions.
export async function ReachOutTabBody({
  params,
}: {
  params: DashboardFilters;
}) {
  const data = await fetchDashboardData(params);
  return (
    <section className="flex flex-col gap-3">
      <TabSectionLabel icon={Send}>Reach Out pipeline</TabSectionLabel>
      <div className="acc-kpi-grid">
        <SimpleKpi
          tone="accent"
          icon={<Send size={16} aria-hidden />}
          label="In Reach Out"
          primary={String(data.pipeline.reachOut)}
          secondary="Awaiting onboarding"
        />
        <SimpleKpi
          tone="info"
          icon={<CalendarClock size={16} aria-hidden />}
          label="Today vs Yesterday"
          primary={`${data.pulse.reachOut.today}`}
          secondary={`${data.pulse.reachOut.delta >= 0 ? "+" : ""}${data.pulse.reachOut.delta} vs yesterday`}
        />
        <SimpleKpi
          tone="warning"
          icon={<Mail size={16} aria-hidden />}
          label="Missing Email"
          primary={String(data.actions.needsEmail)}
          secondary="Reach Out / On Board w/o email"
        />
        <SimpleKpi
          tone="danger"
          icon={<ShoppingCart size={16} aria-hidden />}
          label="Pending Order"
          primary={String(data.actions.needsOrder)}
          secondary="No order linked yet"
        />
      </div>
    </section>
  );
}

// ── Onboarding ────────────────────────────────────────────────────────────
export async function OnboardingTabBody() {
  const kpi = await fetchOnboardingKpis();
  return (
    <section className="flex flex-col gap-3">
      <TabSectionLabel icon={Send}>Onboarding</TabSectionLabel>
      <OnboardingKpiStrip kpi={kpi} />
    </section>
  );
}

// ── Order Status ──────────────────────────────────────────────────────────
export async function OrderStatusTabBody() {
  const { kpi } = await fetchOrderStatusData({});
  return (
    <section className="flex flex-col gap-3">
      <OrderVolumeStrip kpi={kpi} activeBucket="all" currentParams={{}} />
      <CommerceIntelStrip kpi={kpi} />
    </section>
  );
}

// ── Posting ─────────────────────────────────────────────────────────────────
export async function PostingTabBody() {
  const kpi = await fetchPostingKpis();
  return (
    <section className="flex flex-col gap-3">
      <TabSectionLabel icon={Send}>Posting</TabSectionLabel>
      <PostingKpiStrip kpi={kpi} />
    </section>
  );
}

// ── Ad Status ─────────────────────────────────────────────────────────────
export async function AdStatusTabBody() {
  const { kpi, warehouseConnected } = await fetchAdStatusData({});
  return (
    <section className="flex flex-col gap-3">
      <TabSectionLabel icon={TrendingUp}>
        Ad performance{warehouseConnected ? "" : " · warehouse not connected"}
      </TabSectionLabel>
      <AdStatusKpiStrip kpi={kpi} />
    </section>
  );
}

// ── Payments (Accounts Hub) ─────────────────────────────────────────────────
export async function PaymentsTabBody() {
  const { kpi } = await fetchAccountsHubData({});
  return (
    <section className="flex flex-col gap-3">
      <TabSectionLabel icon={Send}>Payments &amp; settlements</TabSectionLabel>
      <AccountsKpiStrip kpi={kpi} />
    </section>
  );
}

// ── Cost ────────────────────────────────────────────────────────────────────
export async function CostTabBody() {
  const data = await fetchCostAnalyticsData();
  return (
    <section className="flex flex-col gap-3">
      <TabSectionLabel icon={TrendingUp}>Budget vs actuals</TabSectionLabel>
      <DashboardCostStrip kpis={data.kpis} />
    </section>
  );
}

// ── TAT ──────────────────────────────────────────────────────────────────────
export async function TatTabBody() {
  const { kpi } = await fetchTatData({});
  return (
    <section className="flex flex-col gap-3">
      <TabSectionLabel icon={CalendarClock}>Turnaround time</TabSectionLabel>
      <TatKpiStrip kpi={kpi} />
    </section>
  );
}

// ── Journey ──────────────────────────────────────────────────────────────────
export async function JourneyTabBody() {
  const { kpi, funnel } = await fetchJourneyData({});
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <TabSectionLabel icon={Send}>Pipeline snapshot</TabSectionLabel>
        <JourneyKpiStrip kpi={kpi} />
      </div>
      <div className="flex flex-col gap-3">
        <TabSectionLabel icon={TrendingUp}>Funnel conversion</TabSectionLabel>
        <JourneyFunnelStrip funnel={funnel} />
      </div>
    </section>
  );
}

/** Local KPI tile for tabs that build a grid from the dashboard aggregate. */
function SimpleKpi({
  tone,
  icon,
  label,
  primary,
  secondary,
}: {
  tone: "accent" | "muted" | "warning" | "success" | "info" | "danger";
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className={`acc-kpi acc-kpi--${tone}`}>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          {icon}
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary tabular">{primary}</div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </div>
  );
}
