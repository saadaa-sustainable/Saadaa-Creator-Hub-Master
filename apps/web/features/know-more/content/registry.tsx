/**
 * Maps a slug (the value of `data-know-more` on the PageHeader button) to
 * its content component. Adding a new stage = add an entry here + create
 * the matching `<slug>.tsx` file.
 */
import type { ComponentType } from "react";
import AccountsHubKM from "./accounts-hub";
import CampaignsKM from "./campaigns";
import OnboardingKM from "./onboarding";
import OrderStatusKM from "./order-status";
import PostingKM from "./posting";
import ReachOutInboundKM from "./reach-out-inbound";
import ReachOutOutboundKM from "./reach-out-outbound";

export const KM_REGISTRY: Record<string, ComponentType> = {
  campaigns: CampaignsKM,
  "reach-out-outbound": ReachOutOutboundKM,
  "reach-out-inbound": ReachOutInboundKM,
  onboarding: OnboardingKM,
  posting: PostingKM,
  "order-status": OrderStatusKM,
  "accounts-hub": AccountsHubKM,
};

export type KMSlug = keyof typeof KM_REGISTRY;
