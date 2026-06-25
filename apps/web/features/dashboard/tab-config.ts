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
  "creators",
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
  creators: "Creator Analytics",
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

/**
 * Per-tab Know More slug. The Dashboard shell owns the single PageHeader, so the
 * "Know More" button is CONTEXTUAL — it opens the help content for the active
 * tab's view, identical to that view's standalone sidebar page. Each value is a
 * key in `features/know-more/content/registry.tsx` (KM_REGISTRY): Overview maps
 * to the dashboard KM; every mirror tab maps to its feature's own KM slug.
 */
export const TAB_KM_SLUGS: Record<DashboardTab, string> = {
  overview: "dashboard",
  creators: "creator-analytics",
  journey: "journey",
  tat: "tat",
  "ad-status": "ad-status",
  compliance: "compliance",
  cost: "cost-analytics",
  funnel: "funnel",
  internal: "internal-dashboard",
};

export function tabKnowMoreSlug(tab: DashboardTab): string {
  return TAB_KM_SLUGS[tab];
}
