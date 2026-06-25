import { z } from "zod";

/**
 * Onboarding — mirrors legacy InfluencerBackend.js#submitOrderCreation +
 * Index.html#view-onboarding form fields verbatim.
 *
 *   Sections (legacy IDs in parens):
 *     1. Collaboration Configuration
 *        - agency        (#ob_agency)        optional
 *        - collabType    (#ob_collab)        required, "Barter" | "Barter + Paid"
 *        - commercials   (#ob_commercials)   amount (₹); locked 0 if Barter
 *        - estDelivery   (#ob_estDate)       required ISO date
 *        - reels         (#ob_reels)         int
 *        - posts         (#ob_posts)         int (static posts)
 *        - stories       (#ob_stories)       int (dropped during deliverable expansion)
 *        - adsRights     (#ob_adsRights)     enum None / N Months / Lifetime
 *     2. Shopify Order
 *        - orderId       (#ob_orderId)       required; triggers shopify lookup
 *        - orderStatus   (#ob_orderStatus)   button-grid: Unfulfilled / Fulfilled / Delivered / RTO / Cancelled / Cancelled After RTO
 *     3. Bank Details (only when collabType = Barter + Paid)
 *        - bankName, bankNumber, ifsc
 *     4. Duration + Remarks
 *        - duration      (#ob_duration)      free text
 *        - remarks       (#ob_remarks)       textarea
 */

export const COLLAB_TYPES = ["Barter", "Barter + Paid"] as const;
export type CollabType = (typeof COLLAB_TYPES)[number];

export const ADS_USAGE_RIGHTS = [
  "",
  "1 Month",
  "2 Months",
  "3 Months",
  "4 Months",
  "5 Months",
  "6 Months",
  "7 Months",
  "8 Months",
  "9 Months",
  "10 Months",
  "11 Months",
  "12 Months",
  "Lifetime",
] as const;
export type AdsUsageRights = (typeof ADS_USAGE_RIGHTS)[number];

export const ORDER_STATUSES = [
  "Unfulfilled",
  "Fulfilled",
  "Delivered",
  "RTO",
  "Order Cancelled",
  "Order Cancelled After RTO",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** REQ #2: content duration captured per-collab on onboarding. "" = unset. */
export const CONTENT_DURATIONS = [
  "",
  "24-25 sec",
  "35-45 sec",
  "45+ sec",
] as const;
export type ContentDuration = (typeof CONTENT_DURATIONS)[number];

export const OnboardingSchema = z
  .object({
    // Reach-out rows are onboarded by their bigserial `id` (post_id is NULL until
    // onboarding mints it). Already-onboarded rows still pass postId. One of the
    // two must be present — enforced in the superRefine below.
    id: z.coerce.number().int().positive().optional(),
    postId: z.string().trim().optional(),
    agency: z.string().trim().optional().default(""),
    collabType: z.enum(COLLAB_TYPES, { message: "Collaboration Type required" }),
    commercials: z.coerce.number().min(0).default(0),
    estDelivery: z.string().trim().min(1, "Est. Content Delivery date required"),
    reels: z.coerce.number().int().min(0).default(0),
    posts: z.coerce.number().int().min(0).default(0),
    stories: z.coerce.number().int().min(0).default(0),
    adsUsageRights: z.enum(ADS_USAGE_RIGHTS).optional().default(""),
    orderId: z.string().trim().min(1, "Shopify Order ID required"),
    orderStatus: z.enum(ORDER_STATUSES, { message: "Order Status required" }),
    bankName: z.string().trim().optional().default(""),
    bankNumber: z.string().trim().optional().default(""),
    ifsc: z.string().trim().optional().default(""),
    // .catch("") so legacy free-text durations don't fail re-submit validation.
    duration: z.enum(CONTENT_DURATIONS).catch("").optional().default(""),
    remarks: z.string().trim().optional().default(""),
  })
  .superRefine((data, ctx) => {
    // Either the bigserial row id (reach-out onboard) or a post_id (already
    // onboarded) must identify the row to onboard.
    if (data.id == null && !(data.postId && data.postId.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postId"],
        message: "Row id or Post ID required",
      });
    }
    // Bank details required for Barter + Paid
    if (data.collabType === "Barter + Paid") {
      if (!data.bankName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bankName"],
          message: "Bank Account Name required for Barter + Paid",
        });
      }
      if (!data.bankNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bankNumber"],
          message: "Bank Account Number required for Barter + Paid",
        });
      }
      if (!data.ifsc) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ifsc"],
          message: "IFSC required for Barter + Paid",
        });
      }
    }
  });

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

/** Legacy Barter rule: commercials forced to 0 for Barter (parity with submitOrderCreation). */
export function applyBarterLock(input: OnboardingInput): OnboardingInput {
  if (input.collabType === "Barter") {
    return { ...input, commercials: 0 };
  }
  return input;
}
