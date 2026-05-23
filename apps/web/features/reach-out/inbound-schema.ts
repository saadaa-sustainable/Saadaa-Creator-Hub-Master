import { z } from "zod";
import { GENDERS } from "./schema";

/**
 * Inbound batch — mirrors legacy submitReachOutBatch + #view-reachout-inbound.
 * Bulk roster, manual cap 10, CSV bypass, batch submit creates one Reach Out
 * (workflow_status='Reach Out', reachout_direction='inbound') per valid row.
 *
 * Mandatory per row (legacy parity): url, gender, contentCode, AT LEAST one
 * commercial rate (reel OR post). Followers + verification auto-fill via the
 * 3-hr Apify cron later.
 */

const igUrlRe = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+/i;

export const InboundRowSchema = z
  .object({
    instagramLink: z
      .string()
      .trim()
      .min(1, "Profile URL required")
      .regex(igUrlRe, "Must be a valid Instagram profile URL"),
    gender: z.enum(GENDERS, { message: "Gender required" }),
    contentCode: z.string().trim().min(1, "Content Code required"),
    reelRate: z.coerce.number().min(0).optional(),
    postRate: z.coerce.number().min(0).optional(),
  })
  .refine(
    (v) => {
      const hasReel = v.reelRate != null && v.reelRate > 0;
      const hasPost = v.postRate != null && v.postRate > 0;
      return hasReel || hasPost;
    },
    {
      message: "At least one commercial rate (Reel or Post) is required",
      path: ["reelRate"],
    },
  );
export type InboundRowInput = z.infer<typeof InboundRowSchema>;

export const InboundBatchSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign required"),
  rows: z.array(InboundRowSchema).min(1, "Add at least one row"),
});
export type InboundBatchInput = z.infer<typeof InboundBatchSchema>;

export const INBOUND_MANUAL_CAP = 10;

export function makeInboundRow(prefill: Partial<InboundRowInput> = {}): InboundRowInput {
  return {
    instagramLink: prefill.instagramLink ?? "",
    gender: prefill.gender ?? "Female",
    contentCode: prefill.contentCode ?? "",
    reelRate: prefill.reelRate,
    postRate: prefill.postRate,
  };
}

/** username slug derived from URL (mirrors legacy _usernameFromUrlInbound). */
export function inboundUsernameFromUrl(input: string): string {
  return input
    .trim()
    .replace(/^.*instagram\.com\//i, "")
    .replace(/[\/\?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
}
