/**
 * Maps a slug (the value of `data-know-more` on the PageHeader button) to
 * its content component. Adding a new stage = add an entry here + create
 * the matching `<slug>.tsx` file.
 */
import type { ComponentType } from "react";
import AccountsHubKM from "./accounts-hub";
import AdStatusKM from "./ad-status";
import AuditLogKM from "./audit-log";
import CampaignsKM from "./campaigns";
import ComplianceKM from "./compliance";
import CostAnalyticsKM from "./cost-analytics";
import CreatorAnalyticsKM from "./creator-analytics";
import DashboardKM from "./dashboard";
import ErrorsKM from "./errors";
import FunnelKM from "./funnel";
import HistoricAnalyticsKM from "./historic-analytics";
import InternalDashboardKM from "./internal-dashboard";
import IssueDeskKM from "./issue-desk";
import JourneyKM from "./journey";
import MyDashboardKM from "./my-dashboard";
import OffboardingKM from "./offboarding";
import OnboardingKM from "./onboarding";
import OrdersKM from "./orders";
import OrderStatusKM from "./order-status";
import PostingKM from "./posting";
import ReachOutInboundKM from "./reach-out-inbound";
import ReachOutOutboundKM from "./reach-out-outbound";
import SettingsKM from "./settings";
import SheetsKM from "./sheets";
import TatKM from "./tat";
import UserPanelKM from "./user-panel";

export const KM_REGISTRY: Record<string, ComponentType> = {
  dashboard: DashboardKM,
  campaigns: CampaignsKM,
  "reach-out-outbound": ReachOutOutboundKM,
  "reach-out-inbound": ReachOutInboundKM,
  onboarding: OnboardingKM,
  offboarding: OffboardingKM,
  posting: PostingKM,
  "order-status": OrderStatusKM,
  "accounts-hub": AccountsHubKM,
  orders: OrdersKM,
  "ad-status": AdStatusKM,
  tat: TatKM,
  journey: JourneyKM,
  "my-dashboard": MyDashboardKM,
  compliance: ComplianceKM,
  funnel: FunnelKM,
  "cost-analytics": CostAnalyticsKM,
  "creator-analytics": CreatorAnalyticsKM,
  "historic-analytics": HistoricAnalyticsKM,
  "internal-dashboard": InternalDashboardKM,
  errors: ErrorsKM,
  "audit-log": AuditLogKM,
  "issue-desk": IssueDeskKM,
  sheets: SheetsKM,
  "user-panel": UserPanelKM,
  settings: SettingsKM,
};

export type KMSlug = keyof typeof KM_REGISTRY;
