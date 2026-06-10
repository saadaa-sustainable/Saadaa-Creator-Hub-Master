import { z } from "zod";
import { isValidUrl } from "@/lib/validators";

/**
 * Posting submit — mirrors legacy submitPosting(postId, postDate, postLink,
 * downloadLink, rawDump, partnershipId).
 *
 * Field rules (legacy parity + REQ #9):
 * - postDate: optional input. Server decodes from postLink shortcode when
 *   blank (instant, no API — see lib/instagram-shortcode.ts). Fallback to today.
 * - postLink: required URL.
 * - downloadLink: MANDATORY for every post (drive link to the content asset).
 * - rawDump: optional raw-footage drive link.
 * - partnershipId: REQUIRED when ad usage rights are granted; when present must
 *   be the numeric Meta partnership code (REQ #9 + D1). Not forced on non-ad
 *   posts (barter/organic) which have no Meta code.
 */

/** Truthiness for ads_usage_rights — values are free-text durations ("5 Months",
 * "12 Months", "Lifetime") or empty/None, never literally "Yes". Mirrors the
 * canonical ADS_YES helper used in accounts-hub. */
const hasAdRights = (v?: string | null): boolean => {
  if (!v) return false;
  return !["", "no", "n/a", "none", "0", "false"].includes(
    String(v).trim().toLowerCase(),
  );
};

export const PostingSchema = z
  .object({
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
      .min(1, "Drive Download Link required")
      .refine((v) => isValidUrl(v), "Download link must be a valid URL"),
    rawDump: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((v) => !v || isValidUrl(v), "Raw footage link must be a valid URL"),
    partnershipId: z.string().trim().optional().default(""),
    adsUsageRights: z.string().trim().optional().default(""),
  })
  // REQ #9: Partnership Key required for ad posts (any non-trivial
  // ads_usage_rights), matching the payment-eligibility gate in submitPayments.
  .refine(
    (v) => {
      if (hasAdRights(v.adsUsageRights) && !v.partnershipId) return false;
      return true;
    },
    {
      message: "Partnership Key required when ad usage rights are granted",
      path: ["partnershipId"],
    },
  )
  // REQ #9 + D1: when present, Partnership Key must be the numeric Meta code.
  .refine(
    (v) => {
      if (v.partnershipId && !/^\d{6,}$/.test(v.partnershipId)) return false;
      return true;
    },
    {
      message:
        "Partnership Key must be the numeric Meta partnership code (digits only)",
      path: ["partnershipId"],
    },
  );

export type PostingInput = z.infer<typeof PostingSchema>;
