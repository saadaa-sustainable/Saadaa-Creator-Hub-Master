import { z } from "zod";
import { GENDERS } from "./schema";
import { IG_PROFILE_RE } from "@/lib/validators";

/**
 * Inbound batch — mirrors legacy submitReachOutBatch + #view-reachout-inbound.
 * Bulk roster, manual cap 10, CSV bypass, batch submit creates one Reach Out
 * (workflow_status='Reach Out', reachout_direction='inbound') per valid row.
 *
 * Mandatory per row (post 2026-05-27 schema cleanup): url, gender, contentCode,
 * collabType, AND commercials (forced to 0 if Barter). Per-type rate columns
 * (reel/post/story) were dropped in favour of a single agreed commercial amount
 * that gets equal-split across deliverables in onboarding.
 */

export const INBOUND_COLLAB_TYPES = ["Barter", "Barter + Paid"] as const;
export type InboundCollabType = (typeof INBOUND_COLLAB_TYPES)[number];

export const InboundRowSchema = z
  .object({
    instagramLink: z
      .string()
      .trim()
      .min(1, "Profile URL required")
      .regex(IG_PROFILE_RE, "Must be a valid Instagram profile URL"),
    gender: z.enum(GENDERS, { message: "Gender required" }),
    contentCode: z.string().trim().min(1, "Content Type required"),
    collabType: z.enum(INBOUND_COLLAB_TYPES, {
      message: "Collab Type required",
    }),
    commercials: z.coerce.number().min(0).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.collabType === "Barter + Paid" && !(v.commercials > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commercials"],
        message: "Commercial amount required for Barter + Paid",
      });
    }
  });
export type InboundRowInput = z.infer<typeof InboundRowSchema>;

export const InboundBatchSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign required"),
  rows: z.array(InboundRowSchema).min(1, "Add at least one row"),
});
export type InboundBatchInput = z.infer<typeof InboundBatchSchema>;

export const INBOUND_MANUAL_CAP = 10;

export function makeInboundRow(
  prefill: Partial<InboundRowInput> = {},
): InboundRowInput {
  return {
    instagramLink: prefill.instagramLink ?? "",
    gender: prefill.gender ?? "Female",
    contentCode: prefill.contentCode ?? "",
    collabType: prefill.collabType ?? "Barter",
    commercials:
      prefill.commercials != null && !Number.isNaN(prefill.commercials)
        ? prefill.commercials
        : 0,
  };
}

/** Legacy Barter rule: commercials forced to 0 for Barter (parity with onboarding). */
export function applyInboundBarterLock(row: InboundRowInput): InboundRowInput {
  if (row.collabType === "Barter") return { ...row, commercials: 0 };
  return row;
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
