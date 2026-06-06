/**
 * Tabbed Dashboard — command-centre tab registry.
 *
 * The Dashboard is a TABBED command centre: an "Overview" tab with
 * cross-system headline KPIs, followed by one tab per workflow view. Each
 * view tab reuses that feature's already-exported KPI query fn + strip
 * component (no logic re-implemented here). Tab state lives in the `?tab=`
 * URL search param so tabs are linkable + server-rendered.
 */

export const DASHBOARD_TABS = [
  "overview",
  "reach-out",
  "onboarding",
  "order-status",
  "posting",
  "ad-status",
  "payments",
  "cost",
  "tat",
  "journey",
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DEFAULT_TAB: DashboardTab = "overview";

export const TAB_LABELS: Record<DashboardTab, string> = {
  overview: "Overview",
  "reach-out": "Reach Out",
  onboarding: "Onboarding",
  "order-status": "Order Status",
  posting: "Posting",
  "ad-status": "Ad Status",
  payments: "Payments",
  cost: "Cost",
  tat: "TAT",
  journey: "Journey",
};

export function resolveTab(raw: string | undefined | null): DashboardTab {
  const v = String(raw ?? "").trim();
  return (DASHBOARD_TABS as readonly string[]).includes(v)
    ? (v as DashboardTab)
    : DEFAULT_TAB;
}
