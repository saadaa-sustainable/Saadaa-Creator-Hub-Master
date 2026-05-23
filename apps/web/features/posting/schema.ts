import { z } from "zod";

/**
 * Posting submit — mirrors legacy submitPosting(postId, postDate, postLink,
 * downloadLink, rawDump, partnershipId).
 *
 * Field rules (legacy parity):
 * - postDate: optional input. Server decodes from postLink shortcode when
 *   blank (instant, no API — see lib/instagram-shortcode.ts). Fallback to today.
 * - postLink: required URL.
 * - downloadLink: MANDATORY when ads_usage_rights = 'Yes' (legacy §7.1).
 * - rawDump: optional raw-footage drive link.
 * - partnershipId: optional Meta paid-partnership key.
 */
export const PostingSchema = z
  .object({
    postId: z.string().trim().min(1),
    postDate: z.string().trim().optional().default(""),
    postLink: z
      .string()
      .trim()
      .min(1, "Post link required")
      .regex(/^https?:\/\//i, "Must be a valid URL"),
    downloadLink: z.string().trim().optional().default(""),
    rawDump: z.string().trim().optional().default(""),
    partnershipId: z.string().trim().optional().default(""),
    adsUsageRights: z.string().trim().optional().default(""),
  })
  .refine(
    (v) => {
      if (v.adsUsageRights === "Yes" && !v.downloadLink) return false;
      return true;
    },
    {
      message: "Drive Download Link required when Ads Usage Rights = Yes",
      path: ["downloadLink"],
    },
  );

export type PostingInput = z.infer<typeof PostingSchema>;
