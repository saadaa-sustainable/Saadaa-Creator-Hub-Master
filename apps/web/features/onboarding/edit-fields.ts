/**
 * Shared (client-safe) constants + types for the onboarding-edit approval flow.
 * Kept out of edit-actions.ts because a "use server" module may only export
 * async functions.
 */

export const EDITABLE_FIELDS = [
  "order_id",
  "collab_type",
  "commercial_amount",
  "ads_usage_rights",
  "est_delivery",
  "reels",
  "static_posts",
  "stories",
  "bank_name",
  "bank_number",
  "ifsc",
] as const;
export type OnboardingEditField = (typeof EDITABLE_FIELDS)[number];

export const ONBOARDING_EDIT_FIELD_LABELS: Record<OnboardingEditField, string> =
  {
    order_id: "Order ID",
    collab_type: "Collab Type",
    commercial_amount: "Commercials (₹)",
    ads_usage_rights: "Ads Usage Rights",
    est_delivery: "Est. Content Delivery",
    reels: "Reels",
    static_posts: "Static Posts",
    stories: "Stories",
    bank_name: "Bank Name",
    bank_number: "Account Number",
    ifsc: "IFSC Code",
  };

/** Ads-usage-rights options, mirroring the onboarding form. */
export const EDIT_ADS_USAGE_OPTIONS = [
  "",
  "3 Months",
  "6 Months",
  "12 Months",
  "Perpetual",
] as const;

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
