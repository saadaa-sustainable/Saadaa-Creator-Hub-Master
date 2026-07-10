/**
 * Shared (client-safe) constants + types for the onboarding-edit approval flow.
 * Kept out of edit-actions.ts because a "use server" module may only export
 * async functions.
 */

export const EDITABLE_FIELDS = [
  "order_id",
  "collab_type",
  "commercial_amount",
  "garment_qty",
  "ads_usage_rights",
  "est_delivery",
] as const;
export type OnboardingEditField = (typeof EDITABLE_FIELDS)[number];

export const ONBOARDING_EDIT_FIELD_LABELS: Record<OnboardingEditField, string> =
  {
    order_id: "Order ID",
    collab_type: "Collab Type",
    commercial_amount: "Commercial (₹, collab total)",
    garment_qty: "Barter (No. of Products)",
    ads_usage_rights: "Ads Usage Rights",
    est_delivery: "Est. Content Delivery",
  };

export interface OnboardingEditForm {
  collabId: string;
  postId: string;
  infId: string | null;
  creatorName: string | null;
  username: string | null;
  campaignId: string | null;
  deliverables: number;
  values: Record<OnboardingEditField, string>;
  pending: boolean;
}

/** A pending onboarding edit as rendered in the Approvals queue. */
export interface OnboardingEditItem {
  id: number;
  collabId: string;
  creator: string | null;
  requestedBy: string | null;
  reason: string | null;
  createdAt: string | null;
  changes: Array<{ field: string; label: string; before: string; after: string }>;
}
