/**
 * Tabbed Dashboard — command-centre tab registry.
 *
 * The Dashboard is a TABBED command centre: an "Overview" tab with
 * cross-system headline KPIs, followed by one tab per SYSTEM-section view
 * (Influencer Journey → Internal Dashboard, mirroring the sidebar order).
 * Each view tab REUSES that feature's full page-view component + data fetch
 * (no logic re-implemented here) so the tab shows an identical experience to
 * the standalone route. Tab state lives in the `?tab=` URL search param so
 * tabs are linkable + server-rendered.
 */

export const DASHBOARD_TABS = [
  "overview",
  "journey",
  "tat",
  "ad-status",
  "compliance",
  "cost",
  "funnel",
  "internal",
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DEFAULT_TAB: DashboardTab = "overview";

export const TAB_LABELS: Record<DashboardTab, string> = {
  overview: "Overview",
  journey: "Influencer Journey",
  tat: "TAT Analytics",
  "ad-status": "Ad Status",
  compliance: "Compliance KPIs",
  cost: "Cost Analytics",
  funnel: "Funnel View",
  internal: "Internal Dashboard",
};

export function resolveTab(raw: string | undefined | null): DashboardTab {
  const v = String(raw ?? "").trim();
  return (DASHBOARD_TABS as readonly string[]).includes(v)
    ? (v as DashboardTab)
    : DEFAULT_TAB;
}
