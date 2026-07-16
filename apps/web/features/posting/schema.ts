import { z } from "zod";
import { isValidUrl } from "@/lib/validators";

/**
 * Posting submit — mirrors legacy submitPosting(postId, postDate, postLink,
 * downloadLink, rawDump).
 *
 * Field rules (legacy parity):
 * - postDate: optional input. Server decodes from postLink shortcode when
 *   blank (instant, no API — see lib/instagram-shortcode.ts). Fallback to today.
 * - postLink: required URL.
 * - downloadLink: no longer a form field (2026-07-16) — the Drive automation
 *   uploads the reel to Saadaa All Collabs/{collab}/{post}.mp4 on submit and
 *   auto-fills posts.download_link. Kept optional here so resubmits carry an
 *   existing manual link through unchanged.
 * - rawDump: optional raw-footage drive link.
 *
 * Partnership Key is no longer a form field (2026-07-02): the partnership-ad
 * invite is auto-sent on submit and posts.partnership_id / partnership_status
 * are stamped from Meta by lib/partnership-sync.ts. Payment/ads gates moved
 * from "key present" to "creator approved" (see lib/partnership.ts).
 */
export const PostingSchema = z.object({
  postId: z.string().trim().min(1),
  postDate: z.string().trim().optional().default(""),
  postLink: z
    .string()
    .trim()
    .min(1, "Post link required")
    .regex(/^https?:\/\//i, "Must be a valid URL"),
  downloadLink: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => !v || isValidUrl(v), "Download link must be a valid URL"),
  rawDump: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => !v || isValidUrl(v), "Raw footage link must be a valid URL"),
  adsUsageRights: z.string().trim().optional().default(""),
  // Bank details — OPTIONAL at onboarding for Barter + Paid (2026-07-11); when
  // still missing on the collab, submitPosting makes these three MANDATORY
  // before the deliverable can be marked Posted.
  bankName: z.string().trim().optional().default(""),
  bankNumber: z.string().trim().optional().default(""),
  ifsc: z.string().trim().optional().default(""),
});

export type PostingInput = z.infer<typeof PostingSchema>;
